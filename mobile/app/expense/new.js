import { useRouter } from "expo-router";

import { useCreateExpense } from "../../src/api/hooks";
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

  return (
    <ExpenseForm
      submitLabel="Add expense"
      submitting={create.isPending}
      error={create.error}
      onSubmit={(body) =>
        create.mutate(body, {
          // Only dismiss on success. On failure the modal stays open with the
          // error shown, so the user doesn't lose what they typed.
          onSuccess: () => router.back(),
        })
      }
    />
  );
}
