from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    BalanceView,
    BudgetView,
    CategoryViewSet,
    ExpenseViewSet,
    IncomeViewSet,
    MonthsView,
    RecurringExpenseViewSet,
    RunRecurringView,
    SummaryView,
)

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("expenses", ExpenseViewSet, basename="expense")
router.register("income", IncomeViewSet, basename="income")
router.register("recurring", RecurringExpenseViewSet, basename="recurring")

urlpatterns = [
    # Must precede the router: otherwise the router's detail route captures "run"
    # as a pk (recurring/<pk>/) and this view is never reached.
    path("recurring/run/", RunRecurringView.as_view(), name="recurring-run"),
    path("", include(router.urls)),
    path("balance/", BalanceView.as_view(), name="balance"),
    path("summary/", SummaryView.as_view(), name="summary"),
    path("months/", MonthsView.as_view(), name="months"),
    path("budget/", BudgetView.as_view(), name="budget"),
]
