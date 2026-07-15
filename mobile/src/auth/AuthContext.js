import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { BASE_URL, ApiError, api } from "../api/client";
import { clearTokens, getTokens, saveTokens } from "./tokenStore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // `loading` is true only while we check for an existing token on cold start.
  // The root layout shows a splash during this, so we never briefly flash the
  // login screen at a user who is in fact already logged in.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { access } = await getTokens();
        if (!access) return;
        // A stored token may be expired. /me/ is the cheapest way to find out;
        // the api client transparently refreshes if the access token is stale.
        setUser(await api.get("/api/auth/me/"));
      } catch {
        // Token is unusable (refresh also expired). Fall through to logged-out.
        await clearTokens();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // login and register hit different endpoints but land in the same place, so
  // they share this tail.
  const completeAuth = useCallback(async ({ access, refresh }) => {
    await saveTokens({ access, refresh });
    setUser(await api.get("/api/auth/me/"));
  }, []);

  const login = useCallback(
    async (email, password) => {
      // Deliberately a raw fetch, not api.post: the api client attaches a stale
      // Authorization header and would try to refresh on 401, which is wrong here.
      const res = await fetch(`${BASE_URL}/api/auth/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new ApiError(res.status, data);
      await completeAuth(data);
    },
    [completeAuth],
  );

  const register = useCallback(
    async (email, password) => {
      const res = await fetch(`${BASE_URL}/api/auth/register/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new ApiError(res.status, data);
      await completeAuth(data);
    },
    [completeAuth],
  );

  const logout = useCallback(async () => {
    await clearTokens();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
