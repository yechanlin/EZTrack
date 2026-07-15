from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    BalanceView,
    BudgetView,
    CategoryViewSet,
    ExpenseViewSet,
    IncomeViewSet,
    MonthsView,
    SummaryView,
)

router = DefaultRouter()
router.register("categories", CategoryViewSet, basename="category")
router.register("expenses", ExpenseViewSet, basename="expense")
router.register("income", IncomeViewSet, basename="income")

urlpatterns = [
    path("", include(router.urls)),
    path("balance/", BalanceView.as_view(), name="balance"),
    path("summary/", SummaryView.as_view(), name="summary"),
    path("months/", MonthsView.as_view(), name="months"),
    path("budget/", BudgetView.as_view(), name="budget"),
]
