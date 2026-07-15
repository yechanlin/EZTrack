import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, font, radius, spacing } from "../theme";

/**
 * MOBILE GOTCHA: there is no <button>. Pressable is the closest thing — it's a
 * touch target that reports its own pressed state, which we use to dim it (mobile
 * has no :hover, so press feedback is the only affordance the user gets).
 */
export function Button({ title, onPress, loading, disabled, variant = "primary", style }) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        s.btn,
        variant === "primary" && s.btnPrimary,
        variant === "secondary" && s.btnSecondary,
        variant === "danger" && s.btnDanger,
        pressed && !isDisabled && { opacity: 0.75 },
        isDisabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "secondary" ? colors.text : colors.primaryText} />
      ) : (
        <Text style={[s.btnText, variant === "secondary" && { color: colors.text }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, error, ...inputProps }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={[font.label, { marginBottom: spacing.xs }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={[s.input, error && { borderColor: colors.danger }]}
        {...inputProps}
      />
      {error ? <Text style={s.errorText}>{error}</Text> : null}
    </View>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <View style={s.banner}>
      <Text style={{ color: colors.danger, fontSize: 14 }}>{message}</Text>
    </View>
  );
}

export function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

const s = StyleSheet.create({
  btn: {
    height: 50,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  btnDanger: { backgroundColor: colors.danger },
  btnText: { color: colors.primaryText, fontSize: 16, fontWeight: "600" },

  input: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  errorText: { color: colors.danger, fontSize: 13, marginTop: spacing.xs },

  banner: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
