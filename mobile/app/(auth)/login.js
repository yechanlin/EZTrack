import { Link } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../../src/auth/AuthContext";
import { Button, ErrorBanner, Field } from "../../src/components/ui";
import { colors, font, spacing } from "../../src/theme";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      // No navigation here — the auth gate in _layout.js sees `user` become
      // non-null and redirects. Keeping redirects in one place avoids the classic
      // double-navigation bug.
    } catch (e) {
      // A 401 from the login endpoint means bad credentials. DRF's stock message
      // is developer-speak, so replace it with something a human would say.
      setError(
        e.status === 401
          ? "That email and password don't match."
          : e.userMessage ?? "Could not sign in. Check your connection.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    // MOBILE GOTCHA: without KeyboardAvoidingView the on-screen keyboard slides up
    // and covers the password field and the submit button. iOS and Android need
    // different behaviors here, hence the Platform check.
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={s.container}>
          <Text style={font.h1}>EZTrack</Text>
          <Text style={[font.caption, { marginTop: spacing.xs, marginBottom: spacing.xl }]}>
            Sign in to track your spending.
          </Text>

          <ErrorBanner message={error} />

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"      // otherwise iOS capitalizes the first letter
            autoComplete="email"
            keyboardType="email-address"
            inputMode="email"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry
            autoCapitalize="none"
            onSubmitEditing={onSubmit}
            returnKeyType="go"
          />

          <Button title="Sign in" onPress={onSubmit} loading={busy} />

          <View style={s.footer}>
            <Text style={font.caption}>New here? </Text>
            <Link href="/(auth)/register" style={s.link}>
              Create an account
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
