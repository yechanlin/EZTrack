import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, Alert, View } from "react-native";

import { api } from "../../src/api/client";
import { useDeleteExpense, useUpdateExpense } from "../../src/api/hooks";
import ExpenseForm from "../../src/components/ExpenseForm";
import { colors } from "../../src/theme";

/**
 * Edit / Delete an expense.
 *
 * The balance arithmetic that the original plan worried about — "adjust by the
 * difference on edit, restore on delete" — is entirely absent here, on purpose.
 * The server recomputes the balance from the ledger after every write, so the app
 * just PATCHes the new amount and the balance follows. There is no delta to get
 * wrong on the client.
 */
export default function EditExpenseScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const expense = useQuery({
    queryKey: ["expense", id],
    queryFn: () => api.get(`/api/expenses/${id}/`),
  });

  const update = useUpdateExpense();
  const remove = useDeleteExpense();

  function confirmDelete() {
    // Alert.alert is the native confirmation dialog — there's no window.confirm.
    Alert.alert("Delete expense?", "This will add the amount back to your balance.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => remove.mutate(id, { onSuccess: () => router.back() }),
      },
    ]);
  }

  if (expense.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ExpenseForm
      initial={expense.data}
      submitLabel="Save changes"
      submitting={update.isPending}
      error={update.error ?? remove.error ?? expense.error}
      onSubmit={(body) =>
        update.mutate({ id, ...body }, { onSuccess: () => router.back() })
      }
      onDelete={confirmDelete}
      deleting={remove.isPending}
    />
  );
}
