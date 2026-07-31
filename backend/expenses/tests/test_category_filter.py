"""The ?category= filter on the expense list, powering the category-detail screen."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from expenses.models import Category, Expense

User = get_user_model()
TODAY = "2026-07-12"


class CategoryFilterTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user("a@example.com", "correcthorse42")
        self.client.force_authenticate(self.user)
        self.food = Category.objects.get(name="Food")
        self.shopping = Category.objects.get(name="Shopping")

    def add(self, category, amount, date=TODAY):
        Expense.objects.create(user=self.user, category=category, amount=amount, date=date)

    def test_filters_to_the_named_category(self):
        self.add(self.food, "10.00")
        self.add(self.food, "20.00")
        self.add(self.shopping, "99.00")

        res = self.client.get(
            reverse("expense-list"), {"year": 2026, "month": 7, "category": self.food.id}
        )
        self.assertEqual(res.status_code, 200)
        rows = res.data["results"]
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(r["category_name"] == "Food" for r in rows))

    def test_no_category_param_returns_all(self):
        self.add(self.food, "10.00")
        self.add(self.shopping, "99.00")
        res = self.client.get(reverse("expense-list"), {"year": 2026, "month": 7})
        self.assertEqual(res.data["count"], 2)

    def test_non_integer_category_is_rejected(self):
        res = self.client.get(
            reverse("expense-list"), {"year": 2026, "month": 7, "category": "abc"}
        )
        self.assertEqual(res.status_code, 400)

    def test_category_filter_respects_month(self):
        self.add(self.food, "10.00", date="2026-07-05")
        self.add(self.food, "50.00", date="2026-06-05")  # different month
        res = self.client.get(
            reverse("expense-list"), {"year": 2026, "month": 7, "category": self.food.id}
        )
        self.assertEqual(len(res.data["results"]), 1)

    def test_cannot_see_another_users_expenses_via_category(self):
        # A global category id is shared, but the filter must still only return the
        # caller's own rows.
        other = User.objects.create_user("b@example.com", "correcthorse42")
        Expense.objects.create(user=other, category=self.food, amount="77.00", date=TODAY)
        self.add(self.food, "10.00")

        res = self.client.get(
            reverse("expense-list"), {"year": 2026, "month": 7, "category": self.food.id}
        )
        self.assertEqual(len(res.data["results"]), 1)
        self.assertEqual(res.data["results"][0]["amount"], "10.00")
