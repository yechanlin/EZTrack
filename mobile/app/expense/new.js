import { useRouter } from "expo-router";

import { useCreateExpense, useCreateRecurring, useRunRecurring } from "../../src/api/hooks";
import ExpenseForm from "../../src/components/ExpenseForm";

/**
 * Add Expense.
 *
 * Presented as a modal (configured in app/_layout.js), so it slides up over the
 * home screen instead of pushing a new page — the home screen stays visible
 * behind it, which is what makes it feel like a popup rather than navigation.
 *
 * NOTE: expo-router matches static segments before dynamic ones, so /expense/new
 * lands here and not in [id].js.
 */
export default function NewExpenseScreen() {
  const router = useRouter();
  const create = useCreateExpense();
  const createRecurring = useCreateRecurring();
  const runRecurring = useRunRecurring();

  function handleSubmit({ repeat, ...body }) {
    // Only dismiss on success. On failure the modal stays open with the error shown,
    // so the user doesn't lose what they typed.
    if (!repeat) {
      create.mutate(body, { onSuccess: () => router.back() });
      return;
    }

    // Recurring: turn the one-off into a monthly rule anchored on the chosen day,
    // starting from the chosen date. Creating the rule doesn't post the expense —
    // run() materializes any occurrence due today (so it shows up immediately if the
    // date is today or in the past).
    createRecurring.mutate(
      {
        amount: body.amount,
        category: body.category,
        note: body.note,
        frequency: "monthly",
        anchor_day: Number(body.date.split("-")[2]),
        start_date: body.date,
      },
      {
        onSuccess: () => runRecurring.mutate(undefined, { onSuccess: () => router.back() }),
      },
    );
  }

  // The form is "busy" during either path; the error surfaces whichever failed.
  const submitting = create.isPending || createRecurring.isPending || runRecurring.isPending;
  const error = create.error ?? createRecurring.error ?? runRecurring.error;

  return (
    <ExpenseForm
      submitLabel="Add expense"
      submitting={submitting}
      error={error}
      allowRecurring
      onSubmit={handleSubmit}
    />
  );
}
