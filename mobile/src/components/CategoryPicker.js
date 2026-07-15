import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useCategories, useCreateCategory } from "../api/hooks";
import { colors, font, radius, spacing } from "../theme";

/**
 * Category chips, plus an inline "+ New" that creates a category without leaving
 * the expense you're in the middle of writing.
 *
 * Creating a category mid-expense is the common case — you're standing at the
 * till and there's no "Coffee" yet. Sending the user to a separate management
 * screen would mean abandoning the half-typed expense, so the whole flow happens
 * in place and the new category is auto-selected on success.
 */
export default function CategoryPicker({ value, onChange }) {
  const categories = useCategories();
  const create = useCreateCategory();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function submitNew() {
    const trimmed = name.trim();
    if (!trimmed) return;

    create.mutate(trimmed, {
      onSuccess: (created) => {
        onChange(created.id); // select it immediately — it's why they made it
        setName("");
        setAdding(false);
      },
      // On failure we deliberately stay open with the text intact, so a duplicate
      // name can be corrected rather than retyped.
    });
  }

  function cancelAdd() {
    setAdding(false);
    setName("");
    create.reset(); // clear any stale error so it doesn't reappear next open
  }

  const list = categories.data ?? [];

  return (
    <View>
      <Text style={[font.label, { marginBottom: spacing.sm }]}>Category</Text>

      {categories.isLoading ? (
        <Text style={font.caption}>Loading categories…</Text>
      ) : (
        <View style={s.chips}>
          {list.map((c) => {
            const selected = c.id === value;
            return (
              <Pressable
                key={c.id}
                onPress={() => onChange(c.id)}
                style={({ pressed }) => [
                  s.chip,
                  selected && s.chipSelected,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[s.chipText, selected && s.chipTextSelected]}>{c.name}</Text>
              </Pressable>
            );
          })}

          {!adding ? (
            <Pressable
              onPress={() => setAdding(true)}
              style={({ pressed }) => [s.chip, s.chipNew, pressed && { opacity: 0.7 }]}
            >
              <Text style={s.chipNewText}>+ New</Text>
            </Pressable>
          ) : null}
        </View>
      )}

      {adding ? (
        <View style={s.addRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Category name"
            placeholderTextColor={colors.textMuted}
            style={s.input}
            autoFocus
            maxLength={50}
            returnKeyType="done"
            onSubmitEditing={submitNew}
          />
          <Pressable
            onPress={submitNew}
            disabled={create.isPending || !name.trim()}
            style={({ pressed }) => [
              s.addBtn,
              (create.isPending || !name.trim()) && { opacity: 0.5 },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={s.addBtnText}>{create.isPending ? "…" : "Add"}</Text>
          </Pressable>
          <Pressable onPress={cancelAdd} style={s.cancelBtn}>
            <Text style={s.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}

      {/* The server rejects a name that clashes with your own categories OR with a
          global default, so this surfaces "Food already exists" rather than
          letting a duplicate through. */}
      {create.error ? (
        <Text style={s.error}>{create.error.userMessage}</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 15 },
  chipTextSelected: { color: colors.primaryText, fontWeight: "600" },

  chipNew: { borderStyle: "dashed", borderColor: colors.primary },
  chipNewText: { color: colors.primary, fontSize: 15, fontWeight: "600" },

  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  addBtn: {
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: { color: colors.primaryText, fontWeight: "600", fontSize: 15 },
  cancelBtn: { height: 44, justifyContent: "center", paddingHorizontal: spacing.xs },
  cancelText: { color: colors.textMuted, fontSize: 15 },

  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
});
