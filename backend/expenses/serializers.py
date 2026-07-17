from django.db.models import Q
from rest_framework import serializers

from .models import Balance, Budget, Category, Expense, Income, RecurringExpense


def validate_owned_category(user, category):
    """Reject a category the user isn't allowed to reference.

    Only global defaults (user IS NULL) and the user's own categories are valid.
    Without this, one user could POST against another's private category id and leak
    its name back in the response. Shared by the Expense and RecurringExpense
    serializers so the rule can't drift between them.
    """
    if category.user_id is not None and category.user_id != user.id:
        raise serializers.ValidationError("That category does not exist.")
    if category.is_archived:
        raise serializers.ValidationError("That category has been archived.")
    return category


class CategorySerializer(serializers.ModelSerializer):
    is_custom = serializers.BooleanField(read_only=True)

    class Meta:
        model = Category
        fields = ("id", "name", "is_custom", "is_archived")
        # `user` is deliberately absent from fields. It's never accepted from the
        # client — the view sets it from request.user. If it were writable, anyone
        # could create a category owned by someone else.
        read_only_fields = ("is_archived",)

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("Name cannot be blank.")

        user = self.context["request"].user
        # Block duplicates against the user's own categories AND the global ones —
        # otherwise a user could add a second "Food" that shadows the default and
        # the picker would show two identical entries.
        clash = Category.objects.filter(name__iexact=name).filter(
            Q(user=user) | Q(user__isnull=True)
        )
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError(f'"{name}" already exists.')
        return name


class ExpenseSerializer(serializers.ModelSerializer):
    # Show the category name alongside the id so list screens don't need a second
    # request (or a client-side join) just to render a label.
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Expense
        fields = ("id", "amount", "category", "category_name", "note", "date", "created_at")
        read_only_fields = ("created_at",)

    def validate_category(self, category):
        return validate_owned_category(self.context["request"].user, category)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value


class IncomeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Income
        fields = ("id", "amount", "note", "date", "created_at")
        read_only_fields = ("created_at",)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value


class RecurringExpenseSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = RecurringExpense
        fields = (
            "id", "amount", "category", "category_name", "note",
            "frequency", "anchor_day", "start_date", "next_run", "active",
        )
        # next_run is the generation cursor, managed by the service — never client-set.
        read_only_fields = ("next_run",)

    def validate_category(self, category):
        return validate_owned_category(self.context["request"].user, category)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero.")
        return value

    def validate(self, attrs):
        # anchor_day's valid range depends on frequency, so it's cross-field.
        # On PATCH, fall back to the instance for whichever field wasn't sent.
        frequency = attrs.get("frequency") or getattr(self.instance, "frequency", None)
        anchor = attrs.get("anchor_day", getattr(self.instance, "anchor_day", None))
        if anchor is not None and frequency == RecurringExpense.WEEKLY:
            if not 0 <= anchor <= 6:
                raise serializers.ValidationError(
                    {"anchor_day": "Weekly rules use 0 (Mon) to 6 (Sun)."}
                )
        elif anchor is not None:  # monthly
            if not 1 <= anchor <= 31:
                raise serializers.ValidationError(
                    {"anchor_day": "Monthly rules use a day from 1 to 31."}
                )
        return attrs


class BalanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Balance
        fields = ("current_amount", "updated_at")


class BudgetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Budget
        fields = ("id", "year", "month", "amount")

    def validate_month(self, value):
        if not 1 <= value <= 12:
            raise serializers.ValidationError("Month must be between 1 and 12.")
        return value


class CategoryTotalSerializer(serializers.Serializer):
    """One row of the home screen's category breakdown."""

    id = serializers.IntegerField()
    name = serializers.CharField()
    total = serializers.DecimalField(max_digits=12, decimal_places=2)


class SummarySerializer(serializers.Serializer):
    """Everything the home screen needs, in one response."""

    year = serializers.IntegerField()
    month = serializers.IntegerField()
    total_spent = serializers.DecimalField(max_digits=12, decimal_places=2)
    budget = serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True)
    remaining = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)
    categories = CategoryTotalSerializer(many=True)
