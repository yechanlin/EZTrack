from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

# Money is always Decimal, never float. 0.1 + 0.2 != 0.3 in binary floating point,
# and those errors compound over a ledger. DecimalField maps to Postgres NUMERIC,
# which is exact.
MONEY = {"max_digits": 10, "decimal_places": 2}
POSITIVE = [MinValueValidator(Decimal("0.01"))]


class Category(models.Model):
    """A spending category.

    `user = NULL` means a global default (Food, Shopping, Subscription) shared by
    everyone. A non-null user means someone added it themselves.

    There's deliberately no `is_custom` boolean: it would just duplicate
    `user_id IS NOT NULL` and could drift out of sync with it.
    """

    name = models.CharField(max_length=50)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="categories",
    )
    # Expenses PROTECT their category, so a category that's been used can never be
    # deleted. Archiving hides it from the picker without breaking that history.
    is_archived = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name"],
                name="unique_category_name_per_user",
            ),
            # UniqueConstraint above does NOT cover the global rows: in SQL, NULL is
            # never equal to NULL, so two global categories both named "Food" would
            # both be allowed. This second constraint covers that case.
            models.UniqueConstraint(
                fields=["name"],
                condition=models.Q(user__isnull=True),
                name="unique_global_category_name",
            ),
        ]
        verbose_name_plural = "categories"

    @property
    def is_custom(self):
        return self.user_id is not None

    def __str__(self):
        return self.name


class Expense(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="expenses"
    )
    amount = models.DecimalField(**MONEY, validators=POSITIVE)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="expenses")
    note = models.CharField(max_length=200, blank=True)
    # The date the money was actually spent (user-editable, may be backdated).
    date = models.DateField()
    # When the row was created. System bookkeeping, never shown to the user.
    created_at = models.DateTimeField(auto_now_add=True)
    # Set when this expense was auto-created by a recurring rule (NULL for one-offs).
    # SET_NULL, not CASCADE: deleting the rule must NOT delete the expenses it already
    # posted — those are real spending that happened.
    source_recurring = models.ForeignKey(
        "RecurringExpense",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated",
    )

    class Meta:
        ordering = ["-date", "-created_at"]
        indexes = [
            # Every read is "this user's expenses, in this month" — so index the
            # pair, not each column separately.
            models.Index(fields=["user", "date"]),
        ]
        constraints = [
            # One occurrence per (rule, date). This is what makes generation
            # idempotent: a second `run` can't post the same day twice, even under
            # two concurrent requests. NULLs are exempt (many one-off expenses can
            # share a date), which is exactly what we want.
            models.UniqueConstraint(
                fields=["source_recurring", "date"],
                name="unique_recurring_occurrence_per_date",
            ),
        ]

    def __str__(self):
        return f"{self.amount} on {self.date}"


class Income(models.Model):
    """Money coming in. Without this, the balance could only ever go down, and
    there'd be no way to reconstruct it from the ledger."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="income"
    )
    amount = models.DecimalField(**MONEY, validators=POSITIVE)
    note = models.CharField(max_length=200, blank=True)
    date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created_at"]
        indexes = [models.Index(fields=["user", "date"])]
        verbose_name_plural = "income"

    def __str__(self):
        return f"+{self.amount} on {self.date}"


class Balance(models.Model):
    """A cached running balance: sum(income) - sum(expenses).

    This is a CACHE, not the source of truth. It exists so the home screen can read
    one row instead of aggregating the whole ledger on every load. It is always
    recomputable from Income and Expense via services.recalculate_balance(), which
    means it can never drift into a state we can't repair.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="balance"
    )
    # Wider than MONEY: a balance accumulates many transactions, so give it headroom.
    current_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.email}: {self.current_amount}"


class Budget(models.Model):
    """An optional spending target for one calendar month."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="budgets"
    )
    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()  # 1-12
    amount = models.DecimalField(**MONEY, validators=POSITIVE)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "year", "month"], name="unique_budget_per_user_month"
            ),
            models.CheckConstraint(
                condition=models.Q(month__gte=1) & models.Q(month__lte=12),
                name="budget_month_in_range",
            ),
        ]

    def __str__(self):
        return f"{self.year}-{self.month:02d}: {self.amount}"


class RecurringExpense(models.Model):
    """A rule that auto-creates an Expense on a schedule.

    This is a *template*, not a ledger entry — it produces Expense rows but isn't one
    itself, so it never touches the balance directly. `next_run` is a cursor: the date
    of the next occurrence still owed. generate_due_recurring() advances it as it posts
    occurrences, so catching up after the app has been closed for months is just
    "keep posting until next_run passes today".
    """

    MONTHLY = "monthly"
    WEEKLY = "weekly"
    FREQUENCY_CHOICES = [(MONTHLY, "Monthly"), (WEEKLY, "Weekly")]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="recurring"
    )
    amount = models.DecimalField(**MONEY, validators=POSITIVE)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="recurring")
    note = models.CharField(max_length=200, blank=True)

    frequency = models.CharField(max_length=10, choices=FREQUENCY_CHOICES, default=MONTHLY)
    # monthly: day of month 1-31 (clamped to the month's length at generation time, so
    #          31 posts on Feb 28/29). weekly: weekday 0=Mon .. 6=Sun.
    anchor_day = models.PositiveSmallIntegerField()

    start_date = models.DateField()  # first date this rule may generate
    next_run = models.DateField()    # cursor: date of the next occurrence still owed
    active = models.BooleanField(default=True)  # paused rules generate nothing
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "active", "next_run"])]

    def __str__(self):
        return f"{self.amount} {self.frequency} (next {self.next_run})"
