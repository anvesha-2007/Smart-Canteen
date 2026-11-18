import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { apiFetch, getAuthToken, setAuthToken } from '../lib/api.ts';
import type { UserProfile } from '../types/canteen.ts';

type WsListener = (event: { type: string; payload: any }) => void;

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<UserProfile>;
  registerWithEmail: (payload: {
    email: string;
    password: string;
    fullName: string;
    department?: string;
    enrollmentId?: string;
    phone?: string;
  }) => Promise<UserProfile>;
  loginWithGoogle: () => Promise<UserProfile>;
  logout: () => Promise<void>;
  updateProfile: (payload: {
    fullName: string;
    department?: string;
    enrollmentId?: string;
    phone?: string;
  }) => Promise<UserProfile>;
  refreshUser: () => Promise<void>;
  subscribeWs: (listener: WsListener) => () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [wsToken, setWsToken] = useState<string | null>(null);
  const listenersRef = useRef<Set<WsListener>>(new Set());

  const subscribeWs = useCallback((listener: WsListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiFetch<{ user: UserProfile }>('/api/auth/me');
      setUser(res.user);
    } catch {
      setUser(null);
    }
  }, []);

  // Hydrate existing session cookie or Firebase auth state on mount
  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        const res = await apiFetch<{ user: UserProfile }>('/api/auth/me');
        if (active) {
          setUser(res.user);
        }
      } catch {
        // No cookie session yet
      } finally {
        if (active) setLoading(false);
      }
    };

    init();

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser && !getAuthToken()) {
        try {
          const idToken = await fbUser.getIdToken();
          const res = await apiFetch<{ user: UserProfile; token: string }>('/api/auth/firebase', {
            method: 'POST',
            body: JSON.stringify({ idToken }),
          });
          if (active) {
            setAuthToken(res.token);
            setWsToken(res.token);
            setUser(res.user);
          }
        } catch {
          // Ignore silent background sync failure
        }
      }
    });

    return () => {
      active = false;
      unsub();
    };
  }, []);

  // Maintain live WebSocket connection when authenticated
  useEffect(() => {
    if (!user || !wsToken) return;

    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(wsToken)}`;
      socket = new WebSocket(url);

      socket.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data);
          listenersRef.current.forEach((fn) => fn(parsed));
        } catch {
          // ignore malformed messages
        }
      };

      socket.onclose = () => {
        if (!stopped) {
          reconnectTimer = setTimeout(connect, 3500);
        }
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
    };
  }, [user, wsToken]);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{ user: UserProfile; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(res.token);
    setWsToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const registerWithEmail = useCallback(
    async (payload: {
      email: string;
      password: string;
      fullName: string;
      department?: string;
      enrollmentId?: string;
      phone?: string;
    }) => {
      const res = await apiFetch<{ user: UserProfile; token: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setAuthToken(res.token);
      setWsToken(res.token);
      setUser(res.user);
      return res.user;
    },
    []
  );

  const loginWithGoogle = useCallback(async () => {
    const cred = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await cred.user.getIdToken();
    const res = await apiFetch<{ user: UserProfile; token: string }>('/api/auth/firebase', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
    setAuthToken(res.token);
    setWsToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    try {
      await firebaseSignOut(auth);
    } catch {
      // ignore
    }
    setAuthToken(null);
    setWsToken(null);
    setUser(null);
  }, []);

  const updateProfile = useCallback(
    async (payload: {
      fullName: string;
      department?: string;
      enrollmentId?: string;
      phone?: string;
    }) => {
      const res = await apiFetch<{ user: UserProfile }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setUser(res.user);
      return res.user;
    },
    []
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        logout,
        updateProfile,
        refreshUser,
        subscribeWs,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
