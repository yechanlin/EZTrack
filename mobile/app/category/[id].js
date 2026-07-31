import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useExpensesByCategory } from "../../src/api/hooks";
import { Card, ErrorBanner } from "../../src/components/ui";
import { formatMoney, monthLabel, shortDate } from "../../src/format";
import { colors, font, spacing } from "../../src/theme";

/**
 * The expenses inside one category for one month — reached by tapping a row in the
 * "By category" list on Home (or a past month in History).
 *
 * Params arrive as strings (that's all a route can carry), so year/month are cast
 * back to numbers. `name` is passed in purely to title the screen and header
 * without a second request; the amounts come from the API, filtered by category.
 */
export default function CategoryDetailScreen() {
  const router = useRouter();
  const { id, name, year, month } = useLocalSearchParams();
  const y = Number(year);
  const m = Number(month);

  const expenses = useExpensesByCategory(y, m, id);
  const rows = expenses.data ?? [];
  // Sum the fetched rows rather than trusting a passed-in total — this list IS the
  // category for the month, so its own sum can't disagree with what's shown.
  const total = rows.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <>
      {/* Title the native header with the category name (from the tapped row). */}
      <Stack.Screen options={{ title: name ? String(name) : "Category" }} />

      <ScrollView style={s.container} contentContainerStyle={{ padding: spacing.lg }}>
        <ErrorBanner message={expenses.error?.userMessage} />

        <Card>
          <Text style={font.label}>
            {name} · {monthLabel(y, m)}
          </Text>
          <Text style={s.total}>{formatMoney(total)}</Text>
          <Text style={[font.caption, { marginTop: spacing.xs }]}>
            {rows.length} {rows.length === 1 ? "expense" : "expenses"}
          </Text>
        </Card>

        {expenses.isLoading ? (
          <View style={{ paddingVertical: spacing.xl }}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : rows.length === 0 ? (
          <Card style={{ marginTop: spacing.lg }}>
            <Text style={font.caption}>No expenses in this category this month.</Text>
          </Card>
        ) : (
          <Card style={{ marginTop: spacing.lg, paddingVertical: spacing.sm }}>
            {rows.map((e, i) => (
              <Pressable
                key={e.id}
                onPress={() => router.push(`/expense/${e.id}`)}
                style={({ pressed }) => [s.row, i > 0 && s.divider, pressed && { opacity: 0.6 }]}
              >
                <View style={{ flex: 1 }}>
                  {/* All rows share the category, so lead with the note (what it was
                      for) instead of repeating the category name. */}
                  <Text style={font.body}>{e.note || String(name) || "Expense"}</Text>
                  <Text style={font.caption}>{shortDate(e.date)}</Text>
                </View>
                <Text style={s.amount}>{formatMoney(e.amount)}</Text>
              </Pressable>
            ))}
          </Card>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  total: { fontSize: 32, fontWeight: "700", color: colors.text, marginTop: spacing.xs },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  amount: { fontSize: 16, fontWeight: "600", color: colors.text },
});
