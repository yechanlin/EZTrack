import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Alert, View } from "react-native";

import { api } from "../../src/api/client";
import { useDeleteIncome, useUpdateIncome } from "../../src/api/hooks";
import IncomeForm from "../../src/components/IncomeForm";
import { colors } from "../../src/theme";

/**
 * Edit / Delete an income entry.
 *
 * Like the expense edit screen, there's no balance arithmetic here: the server
 * recomputes the balance from the ledger after every write, so the app just PATCHes
 * the new amount and the balance follows. Editing a paycheck from 3000 to 3200
 * moves the balance by exactly 200 without the client computing a delta.
 */
export default function EditIncomeScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();

  const income = useQuery({
    queryKey: ["income-detail", id],
    queryFn: () => api.get(`/api/income/${id}/`),
  });

  const update = useUpdateIncome();
  const remove = useDeleteIncome();

  function confirmDelete() {
    Alert.alert("Delete income?", "This will subtract the amount from your balance.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => remove.mutate(id, { onSuccess: () => router.back() }),
      },
    ]);
  }

  if (income.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <IncomeForm
      initial={income.data}
      submitLabel="Save changes"
      submitting={update.isPending}
      error={update.error ?? remove.error ?? income.error}
      onSubmit={(body) => update.mutate({ id, ...body }, { onSuccess: () => router.back() })}
      onDelete={confirmDelete}
      deleting={remove.isPending}
    />
  );
}
