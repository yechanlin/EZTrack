"""Concurrency: the balance must not lose updates under simultaneous writes.

recalculate_balance() reads the ledger, then writes the cached balance. Those are
two steps with a window between them. If thread 1 reads the ledger, thread 2 then
inserts an expense AND writes the (correct) new balance, and thread 1 finally
writes the total it computed before thread 2's insert existed — thread 1 silently
clobbers thread 2's expense. That's a lost update, and it's exactly what
select_for_update() in recalculate_balance() prevents.

WHY THIS TEST IS SHAPED SO ODDLY:
The obvious version — spawn N threads, each adding an expense, then assert the
total — passes whether or not the lock is present. Two reasons it can't catch the
bug: the read-write window is microseconds wide so threads rarely interleave
inside it, and if they all insert before any of them reads, they all read the same
complete ledger and all compute the same correct answer. A test that passes with
the bug present is worse than no test, because it implies coverage it doesn't have.

So this forces the exact interleaving, with two threads and explicit sequencing:

  T1: insert E1 -> read ledger (sees only E1) -> ...wait... -> write stale total
  T2:                        insert E2 -> read ledger -> write correct total

T1 writes last, with a total computed before E2 existed.

  Without the lock: T2 sails through, T1 then overwrites it. Balance is wrong.
  With the lock:    T1 holds the balance row from before its read until commit,
                    so T2 blocks. T1's wait times out, T1 commits, T2 then reads a
                    ledger containing both expenses and writes the right answer.

The timeout on T1's wait is load-bearing: under the lock, T2 *cannot* finish
first, so T1 must be able to give up and proceed. Verified both ways — with
select_for_update this passes; with it removed, it fails.

TransactionTestCase (not TestCase) because we need real commits: the standard
TestCase wraps each test in a transaction no other thread could ever see.
"""

import threading
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.db import connections
from django.test import TransactionTestCase

from expenses.models import Balance, Category, Expense, Income
from expenses.services import recalculate_balance

User = get_user_model()
TODAY = "2026-07-12"

STARTING_INCOME = Decimal("1000.00")
EXPENSE_EACH = Decimal("10.00")

_real_save = Balance.save


class BalanceConcurrencyTests(TransactionTestCase):
    serialized_rollback = True  # keep the migration-seeded categories

    def test_lost_update_is_prevented(self):
        user = User.objects.create_user("race@example.com", "correcthorse42")
        category = Category.objects.create(name="Race", user=user)
        Income.objects.create(user=user, amount=STARTING_INCOME, date=TODAY)
        recalculate_balance(user)

        t1_has_read = threading.Event()   # T1 read the ledger, is about to write
        t2_finished = threading.Event()   # T2 completed its whole insert + recalc
        errors = []

        def sequenced_save(self, *args, **kwargs):
            """Stretch T1's read-write window so T2 can slip inside it."""
            if threading.current_thread().name == "T1":
                t1_has_read.set()
                # Give T2 the chance to insert and recalc first. Under the lock T2
                # is blocked and can never finish, so this must time out rather
                # than wait forever.
                t2_finished.wait(timeout=3)
            return _real_save(self, *args, **kwargs)

        def t1():
            try:
                Expense.objects.create(
                    user=user, amount=EXPENSE_EACH, category=category, date=TODAY
                )
                recalculate_balance(user)  # reads ledger, then blocks inside save()
            except Exception as exc:
                errors.append(("T1", exc))
            finally:
                connections.close_all()

        def t2():
            try:
                # Only move once T1 has already read the ledger — that's what makes
                # T1's pending write stale.
                t1_has_read.wait(timeout=3)
                Expense.objects.create(
                    user=user, amount=EXPENSE_EACH, category=category, date=TODAY
                )
                recalculate_balance(user)
            except Exception as exc:
                errors.append(("T2", exc))
            finally:
                t2_finished.set()
                connections.close_all()

        with mock.patch.object(Balance, "save", sequenced_save):
            threads = [
                threading.Thread(target=t1, name="T1"),
                threading.Thread(target=t2, name="T2"),
            ]
            for t in threads:
                t.start()
            for t in threads:
                t.join(timeout=30)

        self.assertEqual(errors, [], f"threads raised: {errors}")

        expected = STARTING_INCOME - (EXPENSE_EACH * 2)  # 980.00
        self.assertEqual(Expense.objects.filter(user=user).count(), 2)
        self.assertEqual(
            Balance.objects.get(user=user).current_amount,
            expected,
            "Lost update: one thread's expense was clobbered by another thread's "
            "stale balance write. Is select_for_update() still in recalculate_balance()?",
        )
