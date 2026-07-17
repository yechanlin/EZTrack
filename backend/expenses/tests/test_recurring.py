"""Recurring-expense generation.

The whole feature rests on one property: generation is idempotent and correct no
matter how long the app has been closed. The idempotency test is the load-bearing
one — a duplicate-posting bug here would silently double a user's spending.

Tests drive the real API and the service directly. `today` is injected rather than
relying on the wall clock, so catch-up and month-boundary behaviour are deterministic.
"""

from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from expenses.models import Balance, Category, Expense, RecurringExpense
from expenses.services import generate_due_recurring

User = get_user_model()


class RecurringTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("a@example.com", "correcthorse42")
        self.client.force_authenticate(self.user)
        self.food = Category.objects.get(name="Food")  # seeded by migration 0002

    def make_rule(self, *, amount="15.00", start="2026-01-15", frequency="monthly",
                  anchor_day=15, active=True, user=None):
        return RecurringExpense.objects.create(
            user=user or self.user,
            amount=Decimal(amount),
            category=self.food,
            frequency=frequency,
            anchor_day=anchor_day,
            start_date=date.fromisoformat(start),
            next_run=date.fromisoformat(start),
            active=active,
        )

    def expense_count(self, user=None):
        return Expense.objects.filter(user=user or self.user).count()

    def balance(self, user=None):
        row = Balance.objects.filter(user=user or self.user).first()
        return row.current_amount if row else Decimal("0.00")

    # generation --------------------------------------------------------------

    def test_due_rule_posts_one_occurrence(self):
        self.make_rule(start="2026-01-15")
        created = generate_due_recurring(self.user, today=date(2026, 1, 15))
        self.assertEqual(created, 1)
        self.assertEqual(self.expense_count(), 1)

    def test_not_yet_due_posts_nothing(self):
        self.make_rule(start="2026-02-01")
        created = generate_due_recurring(self.user, today=date(2026, 1, 20))
        self.assertEqual(created, 0)
        self.assertEqual(self.expense_count(), 0)

    def test_catch_up_posts_every_missed_month(self):
        # Rule started in January; app first opened in April → Jan, Feb, Mar, Apr.
        self.make_rule(start="2026-01-15", anchor_day=15)
        created = generate_due_recurring(self.user, today=date(2026, 4, 20))
        self.assertEqual(created, 4)
        self.assertEqual(self.expense_count(), 4)
        dates = sorted(str(d) for d in Expense.objects.values_list("date", flat=True))
        self.assertEqual(dates, ["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"])

    def test_idempotent_second_run_posts_nothing(self):
        """The load-bearing test: running generation twice must not double-post."""
        self.make_rule(start="2026-01-15")
        generate_due_recurring(self.user, today=date(2026, 3, 20))
        first = self.expense_count()
        generate_due_recurring(self.user, today=date(2026, 3, 20))
        self.assertEqual(self.expense_count(), first, "second run duplicated occurrences")

    def test_month_end_anchor_clamps_to_february(self):
        # Anchor on the 31st: months without a 31st must clamp, never roll forward.
        self.make_rule(start="2026-01-31", anchor_day=31)
        generate_due_recurring(self.user, today=date(2026, 3, 31))
        dates = sorted(str(d) for d in Expense.objects.values_list("date", flat=True))
        # 2026 is not a leap year → Feb clamps to the 28th.
        self.assertEqual(dates, ["2026-01-31", "2026-02-28", "2026-03-31"])

    def test_leap_year_february_clamps_to_29(self):
        self.make_rule(start="2024-02-29", anchor_day=31)  # 2024 is a leap year
        generate_due_recurring(self.user, today=date(2024, 2, 29))
        self.assertEqual(
            str(Expense.objects.get().date), "2024-02-29"
        )

    def test_weekly_advances_by_seven_days(self):
        self.make_rule(start="2026-01-05", frequency="weekly", anchor_day=0)
        generate_due_recurring(self.user, today=date(2026, 1, 26))
        dates = sorted(str(d) for d in Expense.objects.values_list("date", flat=True))
        self.assertEqual(dates, ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"])

    def test_paused_rule_posts_nothing(self):
        self.make_rule(start="2026-01-15", active=False)
        created = generate_due_recurring(self.user, today=date(2026, 6, 1))
        self.assertEqual(created, 0)
        self.assertEqual(self.expense_count(), 0)

    def test_generated_expense_moves_the_balance(self):
        self.make_rule(amount="20.00", start="2026-01-15")
        generate_due_recurring(self.user, today=date(2026, 1, 15))
        self.assertEqual(self.balance(), Decimal("-20.00"))

    def test_deleting_rule_keeps_the_expenses_it_created(self):
        rule = self.make_rule(start="2026-01-15")
        generate_due_recurring(self.user, today=date(2026, 1, 15))
        rule.delete()
        # SET_NULL: the posted expense survives, just orphaned from its rule.
        self.assertEqual(self.expense_count(), 1)
        self.assertIsNone(Expense.objects.get().source_recurring_id)

    # API surface -------------------------------------------------------------

    def test_create_rule_sets_next_run_to_start_date(self):
        res = self.client.post(
            reverse("recurring-list"),
            {"amount": "9.99", "category": self.food.id, "frequency": "monthly",
             "anchor_day": 3, "start_date": "2026-05-03"},
            format="json",
        )
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(res.data["next_run"], "2026-05-03")

    def test_run_endpoint_reports_created_count(self):
        self.make_rule(start="2026-01-15")
        res = self.client.post(reverse("recurring-run"), {}, format="json")
        # today is real here, and start is in the past → at least one occurrence.
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(res.data["created"], 1)

    def test_run_is_idempotent_via_endpoint(self):
        self.make_rule(start="2026-01-15")
        self.client.post(reverse("recurring-run"), {}, format="json")
        count = self.expense_count()
        self.client.post(reverse("recurring-run"), {}, format="json")
        self.assertEqual(self.expense_count(), count)

    def test_cannot_use_another_users_category(self):
        other = User.objects.create_user("b@example.com", "correcthorse42")
        private = Category.objects.create(name="Secret", user=other)
        res = self.client.post(
            reverse("recurring-list"),
            {"amount": "5.00", "category": private.id, "frequency": "monthly",
             "anchor_day": 1, "start_date": "2026-01-01"},
            format="json",
        )
        self.assertEqual(res.status_code, 400, res.data)

    # isolation ---------------------------------------------------------------

    def test_run_only_touches_the_callers_rules(self):
        other = User.objects.create_user("b@example.com", "correcthorse42")
        self.make_rule(start="2026-01-15", user=other)  # someone else's rule

        # The authenticated user (self.user) has no rules → their run does nothing,
        # and must not fire the other user's.
        res = self.client.post(reverse("recurring-run"), {}, format="json")
        self.assertEqual(res.data["created"], 0)
        self.assertEqual(self.expense_count(other), 0)
        self.assertEqual(self.balance(other), Decimal("0.00"))

    def test_cannot_see_or_edit_another_users_rule(self):
        other = User.objects.create_user("b@example.com", "correcthorse42")
        rule = self.make_rule(start="2026-01-15", user=other)

        self.assertEqual(self.client.get(reverse("recurring-list")).data["count"], 0)
        res = self.client.patch(
            reverse("recurring-detail", args=[rule.id]), {"active": False}, format="json"
        )
        self.assertEqual(res.status_code, 404)
