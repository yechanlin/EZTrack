import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";

import { useCreateIncome } from "../src/api/hooks";
import { Button, ErrorBanner, Field } from "../src/components/ui";
import { todayLocal } from "../src/format";
import { font, spacing } from "../src/theme";

/**
 * Add money to the balance.
 *
 * This screen is why the balance is reconstructible at all. Without an Income
 * ledger, the balance could only ever go down, and there'd be no record of where
 * the starting number came from — so a balance that drifted could never be
 * repaired, only overwritten.
 */
export default function IncomeScreen() {
  const router = useRouter();
  const create = useCreateIncome();

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [localError, setLocalError] = useState(null);

  function submit() {
    const parsed = Number(amount);
    if (!amount.trim() || Number.isNaN(parsed) || parsed <= 0) {
      setLocalError("Enter an amount greater than zero.");
      return;
    }
    setLocalError(null);
    create.mutate(
      { amount: parsed.toFixed(2), note: note.trim(), date },
      { onSuccess: () => router.back() },
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[font.caption, { marginBottom: spacing.lg }]}>
          Add income, a top-up, or your starting balance.
        </Text>

        <ErrorBanner message={localError ?? create.error?.userMessage} />

        <Field
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
          inputMode="decimal"
          autoFocus
        />
        <Field
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="Paycheck, refund, …"
          maxLength={200}
        />
        <Field
          label="Date"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />

        <Button title="Add money" onPress={submit} loading={create.isPending} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg },
});
