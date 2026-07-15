import * as SecureStore from "expo-secure-store";

/**
 * Token storage.
 *
 * MOBILE GOTCHA: use SecureStore, NOT AsyncStorage. AsyncStorage is the obvious
 * choice coming from web (it's the localStorage analogue) but it writes plaintext
 * to the app's sandbox. SecureStore puts values in the iOS Keychain / Android
 * Keystore, which is where credentials belong.
 *
 * SecureStore only stores strings, and only under keys matching [A-Za-z0-9._-].
 */
const ACCESS_KEY = "eztrack.access";
const REFRESH_KEY = "eztrack.refresh";

export async function getTokens() {
  const [access, refresh] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_KEY),
    SecureStore.getItemAsync(REFRESH_KEY),
  ]);
  return { access, refresh };
}

export async function saveTokens({ access, refresh }) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, access),
    SecureStore.setItemAsync(REFRESH_KEY, refresh),
  ]);
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ]);
}
