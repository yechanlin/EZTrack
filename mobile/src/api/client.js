import Constants from "expo-constants";

import { clearTokens, getTokens, saveTokens } from "../auth/tokenStore";

/**
 * Where is the backend?
 *
 * MOBILE GOTCHA: on a physical phone, "localhost" means *the phone itself*, not
 * your Mac. So http://localhost:8000 will always fail on a real device, even
 * though it works fine in a browser on your laptop.
 *
 * Expo tells us the IP of the machine running the dev server (`hostUri` looks
 * like "192.168.1.42:8081"). We reuse that host and swap in Django's port, so
 * this Just Works on a real phone over Wi-Fi with no manual IP editing.
 *
 * In a production build there's no dev server, so we fall back to EXPO_PUBLIC_API_URL.
 */
function resolveBaseUrl() {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `http://${host}:8000`;
  }

  // Last resort — only correct in a simulator, never on a physical device.
  return "http://localhost:8000";
}

export const BASE_URL = resolveBaseUrl();

class ApiError extends Error {
  constructor(status, data) {
    super(`API ${status}`);
    this.status = status;
    this.data = data;
  }

  /** Flatten DRF's {"field": ["msg"]} error shape into one readable line. */
  get userMessage() {
    const d = this.data;
    if (!d) return "Something went wrong. Please try again.";
    if (typeof d === "string") return d;
    if (d.detail) return d.detail;
    const first = Object.values(d)[0];
    if (Array.isArray(first)) return first[0];
    return "Something went wrong. Please try again.";
  }
}

export { ApiError };

/**
 * Refresh-token handling.
 *
 * The access token expires after 30 minutes. Rather than make the user log in
 * again, we transparently exchange the refresh token for a new access token and
 * replay the original request once.
 *
 * `refreshPromise` de-dupes: if five queries fire at once and all get a 401, we
 * only want ONE refresh call, not five (the fifth would fail anyway, since
 * ROTATE_REFRESH_TOKENS invalidates the old refresh token after first use).
 */
let refreshPromise = null;

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const { refresh } = await getTokens();
    if (!refresh) return null;

    const res = await fetch(`${BASE_URL}/api/auth/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh }),
    });

    if (!res.ok) {
      // Refresh token is expired or already used — the user has to log in again.
      await clearTokens();
      return null;
    }

    const data = await res.json();
    // ROTATE_REFRESH_TOKENS=True means the server hands back a NEW refresh token
    // each time and retires the old one. Persist both or the next refresh fails.
    await saveTokens({ access: data.access, refresh: data.refresh ?? refresh });
    return data.access;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

async function request(path, { method = "GET", body, _retried = false } = {}) {
  const { access } = await getTokens();

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401 && !_retried) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      return request(path, { method, body, _retried: true });
    }
  }

  if (res.status === 204) return null; // DELETE returns no body

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: "POST", body }),
  patch: (path, body) => request(path, { method: "PATCH", body }),
  put: (path, body) => request(path, { method: "PUT", body }),
  delete: (path) => request(path, { method: "DELETE" }),
};
