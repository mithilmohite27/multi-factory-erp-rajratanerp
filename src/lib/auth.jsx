import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { googleLogout } from "@react-oauth/google";
import { AUTH_SESSION_KEY, clearLocalCache } from "./sheets";
import { AuthContext } from "./authContext";

async function verifyCredential(credential) {
  const response = await fetch("/api/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(payload.error || "Google login failed.");
    error.status = response.status;
    throw error;
  }

  return payload.user;
}

function readStoredSession() {
  try {
    return JSON.parse(window.sessionStorage.getItem(AUTH_SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("checking");
  const [authError, setAuthError] = useState("");

  const logout = useCallback(() => {
    googleLogout();
    setUser(null);
    setAuthError("");
    setStatus("signed-out");
    window.sessionStorage.clear();
    clearLocalCache();
  }, []);

  useEffect(() => {
    const storedSession = readStoredSession();

    if (!storedSession?.credential) {
      setStatus("signed-out");
      return;
    }

    if (storedSession.user) {
      setUser(storedSession.user);
      setStatus("authenticated");
      return;
    }

    verifyCredential(storedSession.credential)
      .then((verifiedUser) => {
        window.sessionStorage.setItem(
          AUTH_SESSION_KEY,
          JSON.stringify({
            credential: storedSession.credential,
            user: verifiedUser,
          }),
        );
        setUser(verifiedUser);
        setStatus("authenticated");
      })
      .catch(() => {
        logout();
      });
  }, [logout]);

  const login = useCallback(async (credential) => {
    setStatus("checking");
    setAuthError("");

    try {
      const verifiedUser = await verifyCredential(credential);
      window.sessionStorage.setItem(
        AUTH_SESSION_KEY,
        JSON.stringify({ credential, user: verifiedUser }),
      );
      setUser(verifiedUser);
      setStatus("authenticated");
      return verifiedUser;
    } catch (error) {
      window.sessionStorage.removeItem(AUTH_SESSION_KEY);
      setUser(null);
      setStatus(error.status === 403 ? "denied" : "signed-out");
      setAuthError(error.message);
      throw error;
    }
  }, []);

  const value = useMemo(
    () => ({ user, status, authError, login, logout }),
    [user, status, authError, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
