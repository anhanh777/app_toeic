// AuthContext — port từ frontend/src/auth.tsx (web).
// Token lưu trong expo-secure-store (xem api.ts), mở lại app tự đăng nhập.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, loadStoredToken, setToken, type User } from './api';

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  googleLogin: (idToken: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setUser(await api.me());
    } catch {
      setUser(null);
      await setToken(null);
    }
  }, []);

  useEffect(() => {
    // Nạp token đã lưu rồi mới gọi /me: có token mới xác thực được.
    loadStoredToken()
      .then((t) => {
        if (!t) return;
        return refresh();
      })
      .finally(() => setLoading(false));
  }, [refresh]);

  const apply = useCallback(async (token: string, u: User) => {
    await setToken(token);
    setUser(u);
  }, []);
  const login = useCallback(
    async (email: string, password: string) => {
      const r = await api.login(email, password);
      await apply(r.token, r.user);
    },
    [apply],
  );
  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const r = await api.register(name, email, password);
      await apply(r.token, r.user);
    },
    [apply],
  );
  const googleLogin = useCallback(
    async (idToken: string) => {
      const r = await api.googleLogin(idToken);
      await apply(r.token, r.user);
    },
    [apply],
  );
  const logout = useCallback(() => {
    setToken(null).catch(() => {
      /* bỏ qua */
    });
    setUser(null);
  }, []);

  return (
    <Ctx.Provider
      value={{ user, loading, login, register, googleLogin, logout, refresh, setUser }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth phải dùng trong AuthProvider');
  return c;
}
