import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { useMonths } from "../src/api/hooks";
import { Card, ErrorBanner } from "../src/components/ui";
import { formatMoney, monthLabel } from "../src/format";
import { colors, font, radius, spacing } from "../src/theme";

export default function HistoryScreen() {
  const router = useRouter();
  const months = useMonths();

  if (months.isLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const data = months.data ?? [];

  return (
    <View style={s.container}>
      <ErrorBanner message={months.error?.userMessage} />

      {/* MOBILE GOTCHA: FlatList, not data.map(). FlatList only renders the rows
          currently on screen and recycles them as you scroll. Mapping over an
          array mounts every row at once, which is fine for 10 months and janky
          for 200. */}
      <FlatList
        data={data}
        keyExtractor={(m) => `${m.year}-${m.month}`}
        contentContainerStyle={{ padding: spacing.lg }}
        ListEmptyComponent={
          <Card>
            <Text style={font.caption}>
              No history yet. Once you've recorded expenses, each month will appear here.
            </Text>
          </Card>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/month/${item.year}-${item.month}`)}
            style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
          >
            <View>
              <Text style={font.body}>{monthLabel(item.year, item.month)}</Text>
              <Text style={font.caption}>Total spent</Text>
            </View>
            <Text style={s.total}>{formatMoney(item.total)}</Text>
          </Pressable>
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
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  total: { fontSize: 17, fontWeight: "600", color: colors.text },
});
