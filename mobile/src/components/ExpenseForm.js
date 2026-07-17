import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { todayLocal } from "../format";
import { colors, font, spacing } from "../theme";
import CategoryPicker from "./CategoryPicker";
import DateField from "./DateField";
import { Button, ErrorBanner, Field } from "./ui";

/**
 * Shared by the "add expense" and "edit expense" screens. Both submit the same
 * shape; only the endpoint and the buttons differ.
 *
 * `allowRecurring` (add screen only) shows a "Repeat monthly" switch. When it's on,
 * the submitted payload carries `repeat: true`; the parent decides what to do with
 * that (create a recurring rule instead of a one-off). Keeping the branching out of
 * here lets the edit screen reuse the form untouched.
 */
export default function ExpenseForm({
  initial,
  onSubmit,
  submitLabel,
  submitting,
  error,
  onDelete,
  deleting,
  allowRecurring = false,
}) {
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : "");
  const [categoryId, setCategoryId] = useState(initial?.category ?? null);
  const [note, setNote] = useState(initial?.note ?? "");
  const [date, setDate] = useState(initial?.date ?? todayLocal());
  const [repeat, setRepeat] = useState(false);
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
    // Date no longer needs format validation — the picker only ever yields a valid
    // YYYY-MM-DD, so there's no bad input to guard against.
    setLocalError(null);
    // Send the amount as a string. The server stores it as an exact Decimal, and
    // a JS float round-trip is exactly how cents go missing.
    onSubmit({
      amount: parsed.toFixed(2),
      category: categoryId,
      note: note.trim(),
      date,
      repeat: allowRecurring && repeat,
    });
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

        <DateField label="Date" value={date} onChange={setDate} />

        {allowRecurring ? (
          <View style={s.repeatRow}>
            <View style={{ flex: 1 }}>
              <Text style={font.body}>Repeat monthly</Text>
              <Text style={font.caption}>
                Auto-adds this on the {ordinal(dayOf(date))} of each month.
              </Text>
            </View>
            <Switch
              value={repeat}
              onValueChange={setRepeat}
              trackColor={{ true: colors.primary }}
            />
          </View>
        ) : null}

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

// "2026-07-05" -> 5
function dayOf(iso) {
  return Number(iso.split("-")[2]);
}

// 1 -> "1st", 2 -> "2nd", 21 -> "21st". Just for the helper text.
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const s = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  repeatRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
});
