"""Balance correctness.

The balance is the one number the user actually looks at, and the one most likely
to be quietly wrong. These tests exercise it through the real API — not by calling
recalculate_balance() directly — because the thing worth proving is that every
write path remembers to keep it in step.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from expenses.models import Balance, Category, Expense

User = get_user_model()

TODAY = "2026-07-12"


class BalanceTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("a@example.com", "correcthorse42")
        self.client.force_authenticate(self.user)
        self.food = Category.objects.get(name="Food")  # seeded by migration 0002

    # helpers -----------------------------------------------------------------

    def add_expense(self, amount, category=None, date=TODAY):
        res = self.client.post(
            reverse("expense-list"),
            {"amount": str(amount), "category": (category or self.food).id, "date": date},
        )
        self.assertEqual(res.status_code, 201, res.data)
        return res.data["id"]

    def add_income(self, amount, date=TODAY):
        res = self.client.post(reverse("income-list"), {"amount": str(amount), "date": date})
        self.assertEqual(res.status_code, 201, res.data)
        return res.data["id"]

    def balance(self):
        # The Balance row is created lazily on first write, so a user who has never
        # successfully written anything has no row — which means zero, not missing.
        row = Balance.objects.filter(user=self.user).first()
        return row.current_amount if row else Decimal("0.00")

    # tests -------------------------------------------------------------------

    def test_starts_at_zero(self):
        res = self.client.get(reverse("balance"))
        self.assertEqual(Decimal(res.data["current_amount"]), Decimal("0.00"))

    def test_income_increases_balance(self):
        self.add_income("1000.00")
        self.assertEqual(self.balance(), Decimal("1000.00"))

    def test_expense_decreases_balance(self):
        self.add_income("1000.00")
        self.add_expense("25.50")
        self.assertEqual(self.balance(), Decimal("974.50"))

    def test_editing_amount_upward_adjusts_by_the_difference(self):
        self.add_income("1000.00")
        expense_id = self.add_expense("25.00")
        self.assertEqual(self.balance(), Decimal("975.00"))

        res = self.client.patch(
            reverse("expense-detail", args=[expense_id]), {"amount": "40.00"}
        )
        self.assertEqual(res.status_code, 200, res.data)
        # Not 1000 - 25 - 40. The new amount REPLACES the old one.
        self.assertEqual(self.balance(), Decimal("960.00"))

    def test_editing_amount_downward_adjusts_by_the_difference(self):
        self.add_income("1000.00")
        expense_id = self.add_expense("40.00")
        self.client.patch(reverse("expense-detail", args=[expense_id]), {"amount": "10.00"})
        self.assertEqual(self.balance(), Decimal("990.00"))

    def test_deleting_expense_restores_the_amount(self):
        self.add_income("1000.00")
        expense_id = self.add_expense("30.00")
        self.assertEqual(self.balance(), Decimal("970.00"))

        res = self.client.delete(reverse("expense-detail", args=[expense_id]))
        self.assertEqual(res.status_code, 204)
        self.assertEqual(self.balance(), Decimal("1000.00"))

    def test_deleting_income_removes_the_amount(self):
        income_id = self.add_income("1000.00")
        self.add_expense("100.00")
        self.assertEqual(self.balance(), Decimal("900.00"))

        self.client.delete(reverse("income-detail", args=[income_id]))
        self.assertEqual(self.balance(), Decimal("-100.00"))

    def test_balance_can_go_negative(self):
        # Overspending is a real thing that happens. It must not be clamped to zero
        # or rejected — the user needs to see that they're in the red.
        self.add_expense("50.00")
        self.assertEqual(self.balance(), Decimal("-50.00"))

    def test_long_mixed_sequence_matches_the_ledger(self):
        """The property that must hold no matter what: after any series of
        operations, balance == sum(income) - sum(expenses)."""
        self.add_income("500.00")
        self.add_income("250.25")
        ids = [self.add_expense(str(n)) for n in ("10.10", "20.20", "30.30", "40.40")]

        self.client.patch(reverse("expense-detail", args=[ids[0]]), {"amount": "99.99"})
        self.client.delete(reverse("expense-detail", args=[ids[1]]))
        self.add_expense("5.55")
        self.client.patch(reverse("expense-detail", args=[ids[2]]), {"amount": "1.00"})

        expected = Decimal("500.00") + Decimal("250.25") - (
            Decimal("99.99") + Decimal("40.40") + Decimal("5.55") + Decimal("1.00")
        )
        self.assertEqual(self.balance(), expected)

        # And independently: the cache agrees with a fresh sum of the ledger.
        ledger = sum(e.amount for e in Expense.objects.filter(user=self.user))
        self.assertEqual(self.balance(), Decimal("750.25") - ledger)

    def test_decimal_precision_is_exact(self):
        """Float arithmetic would drift here. 0.1 + 0.2 != 0.3 in binary floating
        point, and a ledger compounds that error."""
        self.add_income("0.30")
        self.add_expense("0.10")
        self.add_expense("0.20")
        self.assertEqual(self.balance(), Decimal("0.00"))

    def test_changing_only_the_date_leaves_balance_untouched(self):
        self.add_income("100.00")
        expense_id = self.add_expense("30.00")
        self.client.patch(reverse("expense-detail", args=[expense_id]), {"date": "2026-05-01"})
        self.assertEqual(self.balance(), Decimal("70.00"))

    def test_backdated_expense_still_affects_current_balance(self):
        # Balance is a running total across all time, not a per-month figure — an
        # expense from March still comes out of today's balance.
        self.add_income("100.00")
        self.add_expense("40.00", date="2026-03-15")
        self.assertEqual(self.balance(), Decimal("60.00"))

    def test_rejects_zero_and_negative_amounts(self):
        for bad in ("0", "-5.00"):
            res = self.client.post(
                reverse("expense-list"),
                {"amount": bad, "category": self.food.id, "date": TODAY},
            )
            self.assertEqual(res.status_code, 400, f"{bad} should be rejected")
        self.assertEqual(self.balance(), Decimal("0.00"))
