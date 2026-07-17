import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { dateToIso, isoToDate, longDate } from "../format";
import { colors, font, radius, spacing } from "../theme";

/**
 * A tappable date field backed by the native picker. Stores/returns YYYY-MM-DD, so
 * it drops straight into the existing forms in place of the old raw-text field —
 * the value the parent gets is identical, just no longer typed by hand.
 *
 * MOBILE GOTCHA: the two platforms present this completely differently.
 *  - Android shows a one-shot modal dialog. It fires onChange once (with the picked
 *    date, or nothing if dismissed) and closes itself, so we drive visibility with
 *    `show` state and hide it after every event.
 *  - iOS has no dialog; the picker is an inline component you mount in the layout.
 *    Here we reveal it on tap and let it sit open, updating as the user spins it.
 */
export default function DateField({ label = "Date", value, onChange }) {
  const [show, setShow] = useState(false);

  function handleChange(event, picked) {
    // Android: dismissed without choosing → leave the value untouched.
    if (Platform.OS === "android") {
      setShow(false);
      if (event.type === "dismissed" || !picked) return;
    }
    if (picked) onChange(dateToIso(picked));
  }

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={[font.label, { marginBottom: spacing.xs }]}>{label}</Text>

      <Pressable
        onPress={() => setShow(true)}
        style={({ pressed }) => [s.button, pressed && { opacity: 0.7 }]}
      >
        <Text style={s.buttonText}>{longDate(value)}</Text>
      </Pressable>

      {show ? (
        <DateTimePicker
          value={isoToDate(value)}
          mode="date"
          // Spinner reads clearly on iOS and avoids the calendar grid overflowing a
          // modal on small screens.
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={handleChange}
        />
      ) : null}

      {/* iOS picker stays open inline; give an explicit way to collapse it. */}
      {show && Platform.OS === "ios" ? (
        <Pressable onPress={() => setShow(false)} style={s.done}>
          <Text style={s.doneText}>Done</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  button: {
    height: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  buttonText: { fontSize: 16, color: colors.text },
  done: { alignSelf: "flex-end", paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  doneText: { color: colors.primary, fontWeight: "600", fontSize: 15 },
});
