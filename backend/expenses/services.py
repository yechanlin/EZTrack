from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from .models import Balance, Expense, Income

ZERO = Decimal("0.00")


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
