import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, router, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "../src/auth/AuthContext";
import { colors } from "../src/theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

/**
 * The auth gate.
 *
 * expo-router is file-based (like Next.js): every file under app/ is a route.
 * There's no <Route guard> primitive — instead we watch the current route
 * segments and redirect whenever the auth state and the location disagree.
 * Keeping this in one place means individual screens never navigate on login or
 * logout themselves, which is what avoids double-navigation bugs.
 */
function RootNavigator() {
  const { user, loading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return; // still reading SecureStore — don't redirect yet

    const inAuthGroup = segments[0] === "(auth)";

    if (!user && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (user && inAuthGroup) {
      router.replace("/");
    }
  }, [user, loading, segments]);

  // Show a splash while we check for a stored token, so a returning user never
  // sees the login screen flash before being let straight in.
  if (loading) {
    return (
      <View style={s.splash}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.bg },
        headerStyle: { backgroundColor: colors.bg },
        headerShadowVisible: false,
        headerTintColor: colors.primary,
        headerTitleStyle: { color: colors.text },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)/register" options={{ headerShown: false }} />

      {/* presentation: "modal" slides the screen up from the bottom and leaves the
          previous screen visible behind it, instead of pushing a full page across.
          That's the difference between "a popup over Home" and "navigating away". */}
      <Stack.Screen
        name="expense/new"
        options={{ presentation: "modal", title: "Add expense" }}
      />
      <Stack.Screen
        name="expense/[id]"
        options={{ presentation: "modal", title: "Edit expense" }}
      />
      <Stack.Screen name="income" options={{ presentation: "modal", title: "Add money" }} />
      <Stack.Screen name="budget" options={{ presentation: "modal", title: "Monthly budget" }} />

      {/* History is a real page, so it pushes normally and gets a back button. */}
      <Stack.Screen name="history" options={{ title: "History" }} />
      <Stack.Screen name="month/[ym]" options={{ title: "" }} />
      <Stack.Screen name="recurring" options={{ title: "Recurring" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const s = {
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
};
