/**
 * MOBILE GOTCHA: there is no CSS here. No stylesheets, no cascade, no classes,
 * no `gap: 1rem`. Styles are plain JS objects, layout is flexbox only (no grid),
 * and nothing inherits except text styles inside <Text>. So shared values like
 * colors and spacing have to live in a module you import — this one.
 */
export const colors = {
  bg: "#F6F7F9",
  surface: "#FFFFFF",
  border: "#E4E7EC",
  text: "#101828",
  textMuted: "#667085",
  primary: "#2563EB",
  primaryText: "#FFFFFF",
  danger: "#DC2626",
  success: "#059669",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const font = {
  h1: { fontSize: 32, fontWeight: "700", color: colors.text },
  h2: { fontSize: 20, fontWeight: "600", color: colors.text },
  body: { fontSize: 16, color: colors.text },
  label: { fontSize: 14, fontWeight: "500", color: colors.textMuted },
  caption: { fontSize: 13, color: colors.textMuted },
};
