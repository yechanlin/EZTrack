import { Link, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../src/auth/AuthContext";
import { useBalance, useExpenses, useRunRecurring, useSummary } from "../src/api/hooks";
import { Card, ErrorBanner } from "../src/components/ui";
import { currentYearMonth, formatMoney, monthLabel, shortDate, todayLocal } from "../src/format";
import { colors, font, radius, spacing } from "../src/theme";

export default function HomeScreen() {
  const router = useRouter();
  const { logout } = useAuth();
  // The month is computed from the DEVICE clock, then sent explicitly to the API.
  // The server runs in UTC and would otherwise disagree about which month it is.
  const { year, month } = currentYearMonth();

  const balance = useBalance();
  const summary = useSummary(year, month);
  const expenses = useExpenses(year, month);
  const runRecurring = useRunRecurring();

  const [refreshing, setRefreshing] = useState(false);
  // Materialize recurring expenses once per app session, not on every screen focus —
  // it's the app-open catch-up, not something to redo each time you return from
  // History. (The endpoint is idempotent regardless; this just avoids the noise.)
  const didRunRecurring = useRef(false);

  const refetchAll = useCallback(async () => {
    await Promise.all([balance.refetch(), summary.refetch(), expenses.refetch()]);
  }, [balance, summary, expenses]);

  // MOBILE GOTCHA: a screen isn't unmounted when you navigate away from it — it
  // stays alive underneath. So coming back from the History screen fires no
  // re-render and no refetch. useFocusEffect is the hook that runs when the screen
  // is looked at again.
  useFocusEffect(
    useCallback(() => {
      if (!didRunRecurring.current) {
        didRunRecurring.current = true;
        // On first focus this session, post any recurring expenses that came due
        // while the app was closed. Its onSuccess invalidates the ledger, so new
        // occurrences flow into the queries below without an extra refetch here.
        runRecurring.mutate();
      }
      refetchAll();
    }, [refetchAll, runRecurring]),
  );

  async function onPullToRefresh() {
    setRefreshing(true);
    await refetchAll();
    setRefreshing(false);
  }

  const loading = balance.isLoading || summary.isLoading;
  const error = balance.error ?? summary.error ?? expenses.error;

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const data = summary.data;
  const spent = Number(data?.total_spent ?? 0);
  const budget = data?.budget != null ? Number(data.budget) : null;
  const remaining = data?.remaining != null ? Number(data.remaining) : null;
  const overBudget = remaining != null && remaining < 0;
  const pct = budget && budget > 0 ? Math.min(spent / budget, 1) : 0;

  const balanceValue = Number(balance.data?.current_amount ?? 0);
  const categories = data?.categories ?? [];
  const rows = expenses.data ?? [];

  // Today's spend, summed from the month's expenses already loaded — today is always
  // inside the current month, so no extra request is needed. Compare against the
  // DEVICE's local date (todayLocal), the same basis the date picker writes with, so
  // an expense added "today" always counts here regardless of the server's timezone.
  const today = todayLocal();
  const todaySpent = rows.reduce((sum, e) => (e.date === today ? sum + Number(e.amount) : sum), 0);

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onPullToRefresh} tintColor={colors.primary} />
        }
      >
        <View style={s.header}>
          <Text style={font.h2}>EZTrack</Text>
          <View style={s.headerActions}>
            <Link href="/recurring" style={s.headerLink}>
              Recurring
            </Link>
            <Link href="/history" style={s.headerLink}>
              History
            </Link>
            <Pressable onPress={logout}>
              <Text style={[s.headerLink, { color: colors.textMuted }]}>Sign out</Text>
            </Pressable>
          </View>
        </View>

        <ErrorBanner message={error?.userMessage} />

        {/* Balance */}
        <Card style={s.balanceCard}>
          {/* Today's spend, overlaid in the top-right corner of the balance card.
              Absolute positioning lifts it out of the normal top-to-bottom flow so it
              sits over the card rather than pushing the balance down. */}
          <View style={s.todayPill}>
            <Text style={s.todayLabel}>Today</Text>
            <Text style={s.todayAmount}>{formatMoney(todaySpent)}</Text>
          </View>

          <Text style={font.label}>Current balance</Text>
          <Text
            style={[
              s.balanceAmount,
              { color: balanceValue < 0 ? colors.danger : colors.text },
            ]}
          >
            {formatMoney(balanceValue)}
          </Text>
          <View style={s.balanceActions}>
            <Pressable onPress={() => router.push("/income/new")} style={s.addMoney}>
              <Text style={s.addMoneyText}>+ Add money</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/income")}>
              <Text style={s.viewAll}>View all</Text>
            </Pressable>
          </View>
        </Card>

        {/* This month */}
        <View style={s.sectionHead}>
          <Text style={font.h2}>{monthLabel(year, month)}</Text>
          <Pressable onPress={() => router.push("/budget")}>
            <Text style={s.linkSmall}>{budget != null ? "Edit budget" : "Set budget"}</Text>
          </Pressable>
        </View>

        <Card>
          <View style={s.row}>
            <Text style={font.label}>Spent</Text>
            <Text style={font.h2}>{formatMoney(spent)}</Text>
          </View>

          {budget != null ? (
            <>
              <View style={s.progressTrack}>
                <View
                  style={[
                    s.progressFill,
                    { width: `${pct * 100}%` },
                    overBudget && { backgroundColor: colors.danger },
                  ]}
                />
              </View>
              <Text style={[font.caption, overBudget && { color: colors.danger }]}>
                {overBudget
                  ? `${formatMoney(Math.abs(remaining))} over your ${formatMoney(budget)} budget`
                  : `${formatMoney(remaining)} left of ${formatMoney(budget)}`}
              </Text>
            </>
          ) : (
            <Text style={font.caption}>No budget set for this month.</Text>
          )}
        </Card>

        {/* By category */}
        <Text style={[font.h2, s.sectionTitle]}>By category</Text>
        {categories.length === 0 ? (
          <Card>
            <Text style={font.caption}>
              No spending yet this month. Tap + to add your first expense.
            </Text>
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
                style={({ pressed }) => [s.catRow, i > 0 && s.divider, pressed && { opacity: 0.6 }]}
              >
                <Text style={font.body}>{c.name}</Text>
                <View style={s.catRight}>
                  <Text style={s.catTotal}>{formatMoney(c.total)}</Text>
                  <Text style={s.chevron}>›</Text>
                </View>
              </Pressable>
            ))}
          </Card>
        )}

        {/* Individual expenses — tap to edit */}
        <Text style={[font.h2, s.sectionTitle]}>Expenses</Text>
        {rows.length === 0 ? (
          <Card>
            <Text style={font.caption}>Nothing recorded yet.</Text>
          </Card>
        ) : (
          <Card style={{ paddingVertical: spacing.sm }}>
            {rows.map((e, i) => (
              <Pressable
                key={e.id}
                onPress={() => router.push(`/expense/${e.id}`)}
                style={({ pressed }) => [
                  s.expenseRow,
                  i > 0 && s.divider,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={font.body}>{e.category_name}</Text>
                  <Text style={font.caption}>
                    {shortDate(e.date)}
                    {e.note ? ` · ${e.note}` : ""}
                  </Text>
                </View>
                <Text style={s.catTotal}>{formatMoney(e.amount)}</Text>
              </Pressable>
            ))}
          </Card>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating action button. Nothing in RN positions itself over siblings by
          default — `position: absolute` inside the SafeAreaView is what lifts it
          above the ScrollView. */}
      <Pressable
        onPress={() => router.push("/expense/new")}
        style={({ pressed }) => [s.fab, pressed && { opacity: 0.85 }]}
      >
        <Text style={s.fabText}>+</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: spacing.lg },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerLink: { color: colors.primary, fontWeight: "600", fontSize: 15 },

  balanceCard: { marginBottom: spacing.lg },
  balanceAmount: { fontSize: 40, fontWeight: "700", marginTop: spacing.xs },
  todayPill: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    alignItems: "flex-end",
    backgroundColor: "#EEF2FF", // light indigo tint; distinct from the white card
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  todayLabel: { fontSize: 12, fontWeight: "600", color: colors.primary, letterSpacing: 0.3 },
  todayAmount: { fontSize: 18, fontWeight: "700", color: colors.primary, marginTop: 1 },
  balanceActions: {
    marginTop: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addMoney: { alignSelf: "flex-start" },
  addMoneyText: { color: colors.primary, fontWeight: "600", fontSize: 15 },
  viewAll: { color: colors.textMuted, fontWeight: "600", fontSize: 14 },

  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  sectionTitle: { marginTop: spacing.lg, marginBottom: spacing.sm },
  linkSmall: { color: colors.primary, fontWeight: "600", fontSize: 14 },

  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  progressTrack: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: radius.pill,
    marginVertical: spacing.md,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: colors.primary, borderRadius: radius.pill },

  catRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  catRight: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  chevron: { fontSize: 22, color: colors.textMuted, marginTop: -2 },
  expenseRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  catTotal: { fontSize: 16, fontWeight: "600", color: colors.text },

  fab: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.xl,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    // Elevation on Android, shadow on iOS — they're separate systems.
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabText: { color: colors.primaryText, fontSize: 32, lineHeight: 36, fontWeight: "300" },
});
