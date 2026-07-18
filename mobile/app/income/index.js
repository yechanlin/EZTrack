import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useIncome } from "../../src/api/hooks";
import { Button, Card, ErrorBanner } from "../../src/components/ui";
import { currentYearMonth, formatMoney, monthLabel, shortDate } from "../../src/format";
import { colors, font, spacing } from "../../src/theme";

/**
 * This month's income, each entry tappable to edit or delete. Reached from the
 * balance card on Home. Month-scoped to match the rest of the app's month-centric
 * layout (Home shows this month's expenses the same way).
 */
export default function IncomeListScreen() {
  const router = useRouter();
  const { year, month } = currentYearMonth();
  const income = useIncome(year, month);

  // A screen isn't unmounted when you navigate away, so returning from the edit
  // screen fires no refetch on its own. useFocusEffect re-runs when it's looked at.
  useFocusEffect(
    useCallback(() => {
      income.refetch();
    }, [income]),
  );

  const rows = income.data ?? [];
  const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={[font.caption, { marginBottom: spacing.md }]}>
          {monthLabel(year, month)} · {formatMoney(total)} in
        </Text>

        <ErrorBanner message={income.error?.userMessage} />

        {income.isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : rows.length === 0 ? (
          <Card>
            <Text style={font.caption}>No income recorded this month yet.</Text>
          </Card>
        ) : (
          <Card style={{ paddingVertical: spacing.sm }}>
            {rows.map((r, i) => (
              <Pressable
                key={r.id}
                onPress={() => router.push(`/income/${r.id}`)}
                style={({ pressed }) => [s.row, i > 0 && s.divider, pressed && { opacity: 0.6 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={font.body}>{r.note || "Income"}</Text>
                  <Text style={font.caption}>{shortDate(r.date)}</Text>
                </View>
                <Text style={s.amount}>{formatMoney(r.amount, { signed: true })}</Text>
              </Pressable>
            ))}
          </Card>
        )}

        <Button
          title="+ Add income"
          onPress={() => router.push("/income/new")}
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  amount: { fontSize: 16, fontWeight: "600", color: colors.success },
});
