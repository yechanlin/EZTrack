import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import { useDeleteRecurring, useRecurring, useUpdateRecurring } from "../src/api/hooks";
import { Card, ErrorBanner } from "../src/components/ui";
import { formatMoney } from "../src/format";
import { colors, font, radius, spacing } from "../src/theme";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** "Monthly on the 15th" / "Weekly on Monday" */
function scheduleLabel(rule) {
  if (rule.frequency === "weekly") return `Weekly on ${WEEKDAYS[rule.anchor_day] ?? "?"}`;
  return `Monthly on the ${ordinal(rule.anchor_day)}`;
}

export default function RecurringScreen() {
  const recurring = useRecurring();
  const update = useUpdateRecurring();
  const remove = useDeleteRecurring();

  if (recurring.isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const rules = recurring.data ?? [];

  function confirmDelete(rule) {
    // Native confirm — destructive actions should never be one accidental tap.
    Alert.alert(
      "Delete recurring expense?",
      "This stops future occurrences. Expenses it already added are kept.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => remove.mutate(rule.id) },
      ],
    );
  }

  return (
    <View style={s.container}>
      <ErrorBanner message={recurring.error?.userMessage} />

      <FlatList
        data={rules}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={{ padding: spacing.lg }}
        ListHeaderComponent={
          <Text style={[font.caption, { marginBottom: spacing.md }]}>
            These post automatically when you open the app. Toggle off to pause.
          </Text>
        }
        ListEmptyComponent={
          <Card>
            <Text style={font.caption}>
              No recurring expenses yet. When adding an expense, flip on “Repeat monthly”.
            </Text>
          </Card>
        }
        renderItem={({ item }) => (
          <View style={[s.row, !item.active && { opacity: 0.5 }]}>
            <View style={{ flex: 1 }}>
              <Text style={font.body}>
                {item.category_name}
                {item.note ? ` · ${item.note}` : ""}
              </Text>
              <Text style={font.caption}>{scheduleLabel(item)}</Text>
            </View>

            <Text style={s.amount}>{formatMoney(item.amount)}</Text>

            {/* Pause/resume without deleting — keeps the rule and its history. */}
            <Switch
              value={item.active}
              onValueChange={(active) => update.mutate({ id: item.id, active })}
              trackColor={{ true: colors.primary }}
              style={{ marginLeft: spacing.sm }}
            />

            <Pressable onPress={() => confirmDelete(item)} hitSlop={8} style={{ marginLeft: spacing.sm }}>
              <Text style={s.remove}>✕</Text>
            </Pressable>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  amount: { fontSize: 16, fontWeight: "600", color: colors.text },
  remove: { fontSize: 18, color: colors.textMuted, paddingHorizontal: spacing.xs },
});
