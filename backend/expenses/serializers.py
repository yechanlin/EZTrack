from django.db.models import Q
from rest_framework import serializers

from .models import Balance, Budget, Category, Expense, Income


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
        # CRITICAL: without this check, user A could POST an expense referencing
        # user B's private category id, which would leak B's category name back to
        # A through category_name. Only global categories and your own are valid.
        user = self.context["request"].user
        if category.user_id is not None and category.user_id != user.id:
            raise serializers.ValidationError("That category does not exist.")
        if category.is_archived:
            raise serializers.ValidationError("That category has been archived.")
        return category

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
