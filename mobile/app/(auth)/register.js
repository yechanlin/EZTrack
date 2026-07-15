import { Link } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth/AuthContext";
import { Button, ErrorBanner, Field } from "../../src/components/ui";
import { colors, font, spacing } from "../../src/theme";

export default function RegisterScreen() {
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await register(email.trim(), password);
    } catch (e) {
      // Django's password validators return genuinely useful messages here
      // ("too short", "too common"), so surface them rather than a generic string.
      setError(e.userMessage ?? "Could not create your account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={s.container}>
          <Text style={font.h1}>Create account</Text>
          <Text style={[font.caption, { marginTop: spacing.xs, marginBottom: spacing.xl }]}>
            Start tracking in a few seconds.
          </Text>

          <ErrorBanner message={error} />

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            secureTextEntry
            autoCapitalize="none"
            onSubmitEditing={onSubmit}
            returnKeyType="go"
          />

          <Button title="Create account" onPress={onSubmit} loading={busy} />

          <View style={s.footer}>
            <Text style={font.caption}>Already have an account? </Text>
            <Link href="/(auth)/login" style={s.link}>
              Sign in
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: "center", padding: spacing.lg },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: spacing.lg },
  link: { color: colors.primary, fontWeight: "600", fontSize: 13 },
});
