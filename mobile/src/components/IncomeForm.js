import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";

import { todayLocal } from "../format";
import { spacing } from "../theme";
import DateField from "./DateField";
import { Button, ErrorBanner, Field } from "./ui";

/**
 * Shared by the "add income" and "edit income" screens — the income counterpart to
 * ExpenseForm. Simpler than expenses: no category. Both paths submit the same shape
 * ({ amount, note, date }); only the endpoint and buttons differ.
 */
export default function IncomeForm({
  initial,
  onSubmit,
  submitLabel,
  submitting,
  error,
  onDelete,
  deleting,
}) {
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [date, setDate] = useState(initial?.date ?? todayLocal());
  const [localError, setLocalError] = useState(null);

  function submit() {
    const parsed = Number(amount);
    if (!amount.trim() || Number.isNaN(parsed) || parsed <= 0) {
      setLocalError("Enter an amount greater than zero.");
      return;
    }
    setLocalError(null);
    // Amount as a string — the server stores an exact Decimal, and a float round-trip
    // is how cents go missing.
    onSubmit({ amount: parsed.toFixed(2), note: note.trim(), date });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={localError ?? error?.userMessage} />

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
        <DateField label="Date" value={date} onChange={setDate} />

        <Button title={submitLabel} onPress={submit} loading={submitting} />

        {onDelete ? (
          <Button
            title="Delete income"
            variant="danger"
            onPress={onDelete}
            loading={deleting}
            style={{ marginTop: spacing.md }}
          />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
});
