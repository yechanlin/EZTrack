import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";

import { useBudget, useSetBudget } from "../src/api/hooks";
import { Button, ErrorBanner, Field } from "../src/components/ui";
import { currentYearMonth, monthLabel } from "../src/format";
import { font, spacing } from "../src/theme";

export default function BudgetScreen() {
  const router = useRouter();
  const { year, month } = currentYearMonth();

  const budget = useBudget(year, month);
  const save = useSetBudget();

  const [amount, setAmount] = useState("");
  const [localError, setLocalError] = useState(null);

  // Prefill once the existing budget loads. The query starts undefined, so this
  // can't be an initial useState value.
  useEffect(() => {
    if (budget.data?.amount != null) setAmount(String(budget.data.amount));
  }, [budget.data]);

  function submit() {
    const parsed = Number(amount);
    if (!amount.trim() || Number.isNaN(parsed) || parsed <= 0) {
      setLocalError("Enter an amount greater than zero.");
      return;
    }
    setLocalError(null);
    save.mutate(
      { year, month, amount: parsed.toFixed(2) },
      { onSuccess: () => router.back() },
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[font.caption, { marginBottom: spacing.lg }]}>
          Set a spending target for {monthLabel(year, month)}. Your balance is separate —
          this is just what you're aiming to stay under.
        </Text>

        <ErrorBanner message={localError ?? save.error?.userMessage} />

        <Field
          label="Monthly budget"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          inputMode="decimal"
          autoFocus
        />

        <Button title="Save budget" onPress={submit} loading={save.isPending} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg },
});
