import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useExpenses, useSummary } from "../../src/api/hooks";
import { Card, ErrorBanner } from "../../src/components/ui";
import { formatMoney, monthLabel, shortDate } from "../../src/format";
import { colors, font, spacing } from "../../src/theme";

/**
 * Read-only breakdown for one past month. Same shape as the home screen minus the
 * add button — you can look at history, but you edit from the current month.
 *
 * The route param is a single segment ("2026-6"), because expo-router can't match
 * two separate dynamic segments in one path the way /month/2026/6 would need.
 */
export default function MonthDetailScreen() {
  const router = useRouter();
  const { ym } = useLocalSearchParams();
  const [year, month] = String(ym).split("-").map(Number);

  const summary = useSummary(year, month);
  const expenses = useExpenses(year, month);

  if (summary.isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const categories = summary.data?.categories ?? [];
  const rows = expenses.data ?? [];
  const budget = summary.data?.budget != null ? Number(summary.data.budget) : null;

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: spacing.lg }}>
      <ErrorBanner message={summary.error?.userMessage} />

      <Text style={font.h1}>{monthLabel(year, month)}</Text>

      <Card style={{ marginTop: spacing.lg }}>
        <Text style={font.label}>Total spent</Text>
        <Text style={s.total}>{formatMoney(summary.data?.total_spent ?? 0)}</Text>
        {budget != null ? (
          <Text style={[font.caption, { marginTop: spacing.xs }]}>
            Budget was {formatMoney(budget)}
          </Text>
        ) : null}
      </Card>

      <Text style={[font.h2, s.sectionTitle]}>By category</Text>
      {categories.length === 0 ? (
        <Card>
          <Text style={font.caption}>No spending recorded this month.</Text>
        </Card>
      ) : (
        <Card style={{ paddingVertical: spacing.sm }}>
          {categories.map((c, i) => (
            <Pressable
              key={c.id}
              onPress={() =>
                router.push({
                  pathname: `/category/${c.id}`,
                  params: { name: c.name, year, month },
                })
              }
              style={({ pressed }) => [s.row, i > 0 && s.divider, pressed && { opacity: 0.6 }]}
            >
              <Text style={font.body}>{c.name}</Text>
              <View style={s.catRight}>
                <Text style={s.amount}>{formatMoney(c.total)}</Text>
                <Text style={s.chevron}>›</Text>
              </View>
            </Pressable>
          ))}
        </Card>
      )}

      <Text style={[font.h2, s.sectionTitle]}>Expenses</Text>
      {rows.length === 0 ? (
        <Card>
          <Text style={font.caption}>Nothing recorded.</Text>
        </Card>
      ) : (
        <Card style={{ paddingVertical: spacing.sm }}>
          {rows.map((e, i) => (
            <View key={e.id} style={[s.row, i > 0 && s.divider]}>
              <View style={{ flex: 1 }}>
                <Text style={font.body}>{e.category_name}</Text>
                <Text style={font.caption}>
                  {shortDate(e.date)}
                  {e.note ? ` · ${e.note}` : ""}
                </Text>
              </View>
              <Text style={s.amount}>{formatMoney(e.amount)}</Text>
            </View>
          ))}
        </Card>
      )}

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  total: { fontSize: 32, fontWeight: "700", color: colors.text, marginTop: spacing.xs },
  sectionTitle: { marginTop: spacing.lg, marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  amount: { fontSize: 16, fontWeight: "600", color: colors.text },
  catRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  chevron: { fontSize: 22, color: colors.textMuted, marginTop: -2 },
});
