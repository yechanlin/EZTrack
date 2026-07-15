import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";

import { todayLocal } from "../format";
import { spacing } from "../theme";
import CategoryPicker from "./CategoryPicker";
import { Button, ErrorBanner, Field } from "./ui";

/**
 * Shared by the "add expense" and "edit expense" screens. Both submit the same
 * shape; only the endpoint and the buttons differ.
 */
export default function ExpenseForm({
  initial,
  onSubmit,
  submitLabel,
  submitting,
  error,
  onDelete,
  deleting,
}) {
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : "");
  const [categoryId, setCategoryId] = useState(initial?.category ?? null);
  const [note, setNote] = useState(initial?.note ?? "");
  const [date, setDate] = useState(initial?.date ?? todayLocal());
  const [localError, setLocalError] = useState(null);

  function submit() {
    const parsed = Number(amount);
    if (!amount.trim() || Number.isNaN(parsed) || parsed <= 0) {
      setLocalError("Enter an amount greater than zero.");
      return;
    }
    if (!categoryId) {
      setLocalError("Pick a category.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setLocalError("Date must look like 2026-07-12.");
      return;
    }
    setLocalError(null);
    // Send the amount as a string. The server stores it as an exact Decimal, and
    // a JS float round-trip is exactly how cents go missing.
    onSubmit({ amount: parsed.toFixed(2), category: categoryId, note: note.trim(), date });
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <ErrorBanner message={localError ?? error?.userMessage} />

        <Field
          label="Amount"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          // "decimal-pad" gives a numeric keypad WITH a decimal point. "numeric"
          // includes other symbols; "number-pad" has no decimal point at all.
          keyboardType="decimal-pad"
          inputMode="decimal"
          autoFocus
        />

        <CategoryPicker value={categoryId} onChange={setCategoryId} />

        <View style={{ height: spacing.lg }} />

        <Field
          label="Note (optional)"
          value={note}
          onChangeText={setNote}
          placeholder="What was it for?"
          maxLength={200}
        />

        <Field
          label="Date"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />

        <Button title={submitLabel} onPress={submit} loading={submitting} />

        {onDelete ? (
          <Button
            title="Delete expense"
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
