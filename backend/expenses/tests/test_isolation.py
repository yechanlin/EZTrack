"""User isolation.

Now that this is a hosted, multi-user app, the worst bug is no longer a wrong
balance — it's user A seeing or touching user B's money. Each of these asserts a
404/403 rather than a 200, and that A's data is never moved by B's actions.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from expenses.models import Balance, Category, Expense

User = get_user_model()
TODAY = "2026-07-12"


class IsolationTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user("alice@example.com", "correcthorse42")
        self.bob = User.objects.create_user("bob@example.com", "correcthorse42")
        self.food = Category.objects.get(name="Food")

        # Alice has money and one expense.
        self.alice_expense = Expense.objects.create(
            user=self.alice, amount=Decimal("50.00"), category=self.food, date=TODAY
        )
        # Alice has a private category.
        self.alice_category = Category.objects.create(name="Therapy", user=self.alice)

    def as_bob(self):
        self.client.force_authenticate(self.bob)

    def as_alice(self):
        self.client.force_authenticate(self.alice)

    # reading -----------------------------------------------------------------

    def test_bob_cannot_see_alice_expenses_in_list(self):
        self.as_bob()
        res = self.client.get(reverse("expense-list"))
        self.assertEqual(res.data["count"], 0)

    def test_bob_cannot_fetch_alice_expense_by_id(self):
        self.as_bob()
        res = self.client.get(reverse("expense-detail", args=[self.alice_expense.id]))
        # 404, not 403 — a 403 would confirm the row exists, which is itself a leak.
        self.assertEqual(res.status_code, 404)

    def test_bob_cannot_see_alice_private_category(self):
        self.as_bob()
        res = self.client.get(reverse("category-list"))
        names = [c["name"] for c in res.data["results"]]
        self.assertNotIn("Therapy", names)
        # But he does get the global defaults.
        self.assertIn("Food", names)

    def test_bob_summary_excludes_alice_spending(self):
        self.as_bob()
        res = self.client.get(reverse("summary"), {"year": 2026, "month": 7})
        self.assertEqual(Decimal(res.data["total_spent"]), Decimal("0.00"))
        self.assertEqual(res.data["categories"], [])

    def test_bob_months_excludes_alice_months(self):
        self.as_bob()
        res = self.client.get(reverse("months"))
        self.assertEqual(res.data, [])

    # writing -----------------------------------------------------------------

    def test_bob_cannot_edit_alice_expense(self):
        self.as_bob()
        res = self.client.patch(
            reverse("expense-detail", args=[self.alice_expense.id]), {"amount": "1.00"}
        )
        self.assertEqual(res.status_code, 404)
        self.alice_expense.refresh_from_db()
        self.assertEqual(self.alice_expense.amount, Decimal("50.00"))

    def test_bob_cannot_delete_alice_expense(self):
        self.as_bob()
        res = self.client.delete(reverse("expense-detail", args=[self.alice_expense.id]))
        self.assertEqual(res.status_code, 404)
        self.assertTrue(Expense.objects.filter(id=self.alice_expense.id).exists())

    def test_bob_cannot_post_an_expense_against_alice_private_category(self):
        """The subtle one. Bob can't *see* Alice's category, but nothing stops him
        guessing its id and POSTing to it. If the serializer didn't validate
        ownership, the response would echo back `category_name: "Therapy"` — leaking
        Alice's private category name to Bob."""
        self.as_bob()
        res = self.client.post(
            reverse("expense-list"),
            {"amount": "10.00", "category": self.alice_category.id, "date": TODAY},
        )
        self.assertEqual(res.status_code, 400, res.data)
        self.assertEqual(Expense.objects.filter(user=self.bob).count(), 0)

    def test_bob_cannot_own_an_expense_by_passing_a_user_field(self):
        """`user` isn't a serializer field, so DRF ignores it — but assert that,
        rather than trusting it."""
        self.as_bob()
        res = self.client.post(
            reverse("expense-list"),
            {
                "amount": "10.00",
                "category": self.food.id,
                "date": TODAY,
                "user": self.alice.id,
            },
        )
        self.assertEqual(res.status_code, 201)
        expense = Expense.objects.get(id=res.data["id"])
        self.assertEqual(expense.user, self.bob)  # not Alice

    # balances ----------------------------------------------------------------

    def test_bob_writes_never_move_alice_balance(self):
        self.as_alice()
        self.client.post(reverse("income-list"), {"amount": "1000.00", "date": TODAY})
        alice_before = Balance.objects.get(user=self.alice).current_amount

        self.as_bob()
        self.client.post(reverse("income-list"), {"amount": "77.00", "date": TODAY})
        self.client.post(
            reverse("expense-list"),
            {"amount": "12.00", "category": self.food.id, "date": TODAY},
        )

        self.assertEqual(Balance.objects.get(user=self.alice).current_amount, alice_before)
        self.assertEqual(Balance.objects.get(user=self.bob).current_amount, Decimal("65.00"))

    def test_bob_cannot_read_alice_balance(self):
        self.as_alice()
        self.client.post(reverse("income-list"), {"amount": "1000.00", "date": TODAY})

        self.as_bob()
        res = self.client.get(reverse("balance"))
        # Bob gets his own balance (0), never Alice's.
        self.assertEqual(Decimal(res.data["current_amount"]), Decimal("0.00"))

    def test_bob_cannot_read_or_overwrite_alice_budget(self):
        self.as_alice()
        self.client.put(reverse("budget"), {"amount": "500.00", "year": 2026, "month": 7})

        self.as_bob()
        res = self.client.get(reverse("budget"), {"year": 2026, "month": 7})
        self.assertIsNone(res.data["amount"])

        self.client.put(reverse("budget"), {"amount": "9.00", "year": 2026, "month": 7})
        self.as_alice()
        res = self.client.get(reverse("budget"), {"year": 2026, "month": 7})
        self.assertEqual(Decimal(res.data["amount"]), Decimal("500.00"))

    # unauthenticated ---------------------------------------------------------

    def test_every_endpoint_requires_authentication(self):
        self.client.force_authenticate(None)
        for name in ("expense-list", "income-list", "category-list", "balance", "summary", "months", "budget"):
            res = self.client.get(reverse(name))
            self.assertIn(res.status_code, (401, 403), f"{name} was reachable without a token")
