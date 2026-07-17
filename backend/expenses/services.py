import calendar
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from .models import Balance, Expense, Income, RecurringExpense

ZERO = Decimal("0.00")

# Safety cap on how many occurrences one rule can post in a single catch-up. Even a
# rule left unrun for years can't create an unbounded number of rows (or spin forever
# on a bug). ~400 covers >30 years monthly / ~7.5 years weekly.
MAX_CATCHUP = 400


@transaction.atomic
def recalculate_balance(user):
    """Recompute a user's cached balance from their ledger. The single place the
    balance is ever written.

    WHY A FULL RECOMPUTE, NOT A DELTA:
    The obvious implementation is to adjust the balance by the amount that changed
    — subtract on add, add back on delete, apply the difference on edit. That's
    three separate arithmetic paths, each of which can be wrong, and each of which
    corrupts the balance *permanently and silently* when it is. There'd be no way
    to detect the drift, let alone repair it, because the balance would be the only
    record of itself.

    Recomputing from the ledger is one code path that is obviously correct by
    construction. The balance becomes a pure function of Income and Expense, so it
    cannot drift — a bug anywhere else is fixed simply by calling this again.

    The cost is a SUM over two indexed columns. At the scale of a personal expense
    tracker (thousands of rows, not millions) that's single-digit milliseconds, and
    it's a trade worth making many times over for a number the user actually cares
    about being right.

    CONCURRENCY: select_for_update() takes a row lock for the duration of the
    surrounding transaction. Without it, two simultaneous writes could both read
    the ledger before either commits, and the second would overwrite the first.
    """
    # Lock the balance row first. get_or_create covers users created before the
    # balance row existed (and makes the function safe to call unconditionally).
    balance, _ = Balance.objects.select_for_update().get_or_create(user=user)

    total_income = Income.objects.filter(user=user).aggregate(t=Sum("amount"))["t"] or ZERO
    total_spent = Expense.objects.filter(user=user).aggregate(t=Sum("amount"))["t"] or ZERO

    balance.current_amount = total_income - total_spent
    balance.save(update_fields=["current_amount", "updated_at"])
    return balance


def _advance(rule, from_date):
    """The date of the occurrence after `from_date` for this rule.

    Monthly is the fiddly case: a rule anchored on the 31st must still fire in
    February. We clamp the anchor to each month's real length, so anchor_day 31
    posts on Feb 28 (or 29 in a leap year), Apr 30, etc. — never rolls into the
    next month.
    """
    if rule.frequency == RecurringExpense.WEEKLY:
        return from_date + timedelta(days=7)

    # Monthly: step to the first of next month, then clamp the anchor to its length.
    year = from_date.year + (from_date.month // 12)
    month = from_date.month % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(rule.anchor_day, last_day))


@transaction.atomic
def generate_due_recurring(user, today=None):
    """Post every occurrence a user's recurring rules owe up to and including `today`.

    Idempotent by construction: each occurrence is written with get_or_create keyed on
    (source_recurring, date), and a unique constraint backs that — so running this
    twice, or two requests racing on app-open, can never double-post. select_for_update
    locks the rules being advanced so a concurrent run waits rather than duplicating the
    cursor walk.

    Returns the number of Expense rows created (0 means nothing was due).
    """
    today = today or date.today()

    rules = list(
        RecurringExpense.objects.select_for_update().filter(
            user=user, active=True, next_run__lte=today
        )
    )

    created = 0
    for rule in rules:
        guard = 0
        while rule.next_run <= today and guard < MAX_CATCHUP:
            _, made = Expense.objects.get_or_create(
                source_recurring=rule,
                date=rule.next_run,
                defaults={
                    "user": user,
                    "amount": rule.amount,
                    "category": rule.category,
                    "note": rule.note,
                },
            )
            if made:
                created += 1
            rule.next_run = _advance(rule, rule.next_run)
            guard += 1
        rule.save(update_fields=["next_run"])

    if created:
        recalculate_balance(user)  # reuse the single source of truth for the balance
    return created
