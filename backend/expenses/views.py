from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.db.models.functions import TruncMonth
from rest_framework import status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.generics import RetrieveAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Balance, Budget, Category, Expense, Income, RecurringExpense
from .serializers import (
    BalanceSerializer,
    BudgetSerializer,
    CategorySerializer,
    ExpenseSerializer,
    IncomeSerializer,
    RecurringExpenseSerializer,
    SummarySerializer,
)
from .services import generate_due_recurring, recalculate_balance

ZERO = Decimal("0.00")


def parse_month(request):
    """Read ?year=&month= off the querystring, defaulting to the current month.

    The client always sends these explicitly, because the *device's* idea of today
    can differ from the server's (the server runs in UTC; the user might be in
    Seoul). Defaulting here is only a fallback for curl and the browsable API.
    """
    today = date.today()
    try:
        year = int(request.query_params.get("year", today.year))
        month = int(request.query_params.get("month", today.month))
    except (TypeError, ValueError):
        raise ValidationError("year and month must be integers.")

    if not 1 <= month <= 12:
        raise ValidationError("month must be between 1 and 12.")
    if not 2000 <= year <= 2100:
        raise ValidationError("year is out of range.")
    return year, month


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self):
        # Global defaults (user IS NULL) plus this user's own. Never anyone else's.
        return (
            Category.objects.filter(Q(user__isnull=True) | Q(user=self.request.user))
            .filter(is_archived=False)
            .order_by("name")
        )

    def perform_create(self, serializer):
        # The owner comes from the token, never from the request body.
        serializer.save(user=self.request.user)

    def destroy(self, request, *args, **kwargs):
        """Archive instead of deleting.

        Expense.category is PROTECT, so a real delete of a used category would raise
        a database error. And a global default isn't ours to remove at all.
        """
        category = self.get_object()

        if category.user_id is None:
            return Response(
                {"detail": "Default categories cannot be removed."},
                status=status.HTTP_403_FORBIDDEN,
            )

        category.is_archived = True
        category.save(update_fields=["is_archived"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class OwnedLedgerViewSet(viewsets.ModelViewSet):
    """Shared behaviour for Expense and Income: scope every query to the caller,
    stamp the owner on create, and refresh the cached balance after every write.

    Subclasses set `model` and `serializer_class`.
    """

    model = None

    def get_queryset(self):
        qs = self.model.objects.filter(user=self.request.user)

        # ?year=&month= is optional on list; absent means "all time".
        year = self.request.query_params.get("year")
        month = self.request.query_params.get("month")
        if year and month:
            y, m = parse_month(self.request)
            qs = qs.filter(date__year=y, date__month=m)
        return qs

    # Every mutation is wrapped in one transaction with the balance recompute, so
    # the ledger and the cached balance can never be observed out of step — and if
    # the recompute fails, the write rolls back with it.
    @transaction.atomic
    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
        recalculate_balance(self.request.user)

    @transaction.atomic
    def perform_update(self, serializer):
        serializer.save()
        recalculate_balance(self.request.user)

    @transaction.atomic
    def perform_destroy(self, instance):
        instance.delete()
        recalculate_balance(self.request.user)


class ExpenseViewSet(OwnedLedgerViewSet):
    model = Expense
    serializer_class = ExpenseSerializer

    def get_queryset(self):
        # select_related avoids one extra query per row to fetch category_name.
        return super().get_queryset().select_related("category")


class IncomeViewSet(OwnedLedgerViewSet):
    model = Income
    serializer_class = IncomeSerializer


class RecurringExpenseViewSet(viewsets.ModelViewSet):
    """CRUD for recurring rules. A rule is a template, not a ledger entry — creating
    or editing one doesn't move the balance, so this deliberately does NOT recompute
    the balance (unlike OwnedLedgerViewSet). The Expenses it later generates do, via
    generate_due_recurring()."""

    serializer_class = RecurringExpenseSerializer
    http_method_names = ["get", "post", "patch", "delete"]

    def get_queryset(self):
        return RecurringExpense.objects.filter(user=self.request.user).select_related("category")

    def perform_create(self, serializer):
        # next_run starts at start_date — the first occurrence the rule owes. The owner
        # comes from the token, never the request body.
        serializer.save(
            user=self.request.user,
            next_run=serializer.validated_data["start_date"],
        )


class RunRecurringView(APIView):
    """Materialize any recurring occurrences due up to today. Called by the app on
    launch — cheap and idempotent, so a redundant call is harmless."""

    def post(self, request):
        created = generate_due_recurring(request.user)
        return Response({"created": created})


class BalanceView(RetrieveAPIView):
    serializer_class = BalanceSerializer

    def get_object(self):
        balance, _ = Balance.objects.get_or_create(user=self.request.user)
        return balance


class SummaryView(APIView):
    """One call powering the whole home screen: total spent this month, the
    category breakdown, and progress against the month's budget.

    Aggregating server-side matters. The alternative — send every expense and sum
    them in JS — means the app downloads the user's entire month of data (and
    eventually paginates through it) just to render six numbers.
    """

    def get(self, request):
        year, month = parse_month(request)

        expenses = Expense.objects.filter(user=request.user, date__year=year, date__month=month)

        rows = (
            expenses.values("category_id", "category__name")
            .annotate(total=Sum("amount"))
            .order_by("-total")
        )
        categories = [
            {"id": r["category_id"], "name": r["category__name"], "total": r["total"]}
            for r in rows
        ]

        total_spent = expenses.aggregate(t=Sum("amount"))["t"] or ZERO

        budget = Budget.objects.filter(user=request.user, year=year, month=month).first()
        budget_amount = budget.amount if budget else None
        # `remaining` is only meaningful if a budget is set. Null (not zero) when
        # it isn't — zero would render as "0 left", which reads as "fully spent".
        remaining = (budget_amount - total_spent) if budget_amount is not None else None

        data = {
            "year": year,
            "month": month,
            "total_spent": total_spent,
            "budget": budget_amount,
            "remaining": remaining,
            "categories": categories,
        }
        return Response(SummarySerializer(data).data)


class MonthsView(APIView):
    """The distinct months in which this user has any expenses, newest first.

    Powers the History list. Doing this server-side with DISTINCT means History
    doesn't have to download the entire expense table to work out which months
    exist.
    """

    def get(self, request):
        rows = (
            Expense.objects.filter(user=request.user)
            .annotate(m=TruncMonth("date"))
            .values("m")
            .annotate(total=Sum("amount"))
            .order_by("-m")
        )
        return Response(
            [
                {"year": r["m"].year, "month": r["m"].month, "total": r["total"]}
                for r in rows
            ]
        )


class BudgetView(APIView):
    """GET/PUT the budget for one month. PUT upserts, so the app doesn't have to
    know whether a budget already exists for that month."""

    def get(self, request):
        year, month = parse_month(request)
        budget = Budget.objects.filter(user=request.user, year=year, month=month).first()
        if not budget:
            return Response({"year": year, "month": month, "amount": None})
        return Response(BudgetSerializer(budget).data)

    def put(self, request):
        year, month = parse_month(request)

        # Pull `amount` out by key rather than spreading request.data. On a
        # form-encoded request request.data is a QueryDict, and because QueryDict
        # subclasses dict, {**querydict} reads the raw internal storage and
        # bypasses the overridden __getitem__ — yielding {"amount": ["5.00"]}, a
        # list, which then fails validation with "A valid number is required".
        serializer = BudgetSerializer(
            data={"amount": request.data.get("amount"), "year": year, "month": month}
        )
        serializer.is_valid(raise_exception=True)

        budget, _ = Budget.objects.update_or_create(
            user=request.user,
            year=year,
            month=month,
            defaults={"amount": serializer.validated_data["amount"]},
        )
        return Response(BudgetSerializer(budget).data)

    def delete(self, request):
        year, month = parse_month(request)
        Budget.objects.filter(user=request.user, year=year, month=month).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
