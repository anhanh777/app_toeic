import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setToken, type User } from './api';

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

  const refresh = async () => {
    try { setUser(await api.me()); } catch { setUser(null); setToken(null); }
  };
  useEffect(() => { refresh().finally(() => setLoading(false)); }, []);

  const apply = (token: string, u: User) => { setToken(token); setUser(u); };
  const login = async (email: string, password: string) => { const r = await api.login(email, password); apply(r.token, r.user); };
  const register = async (name: string, email: string, password: string) => { const r = await api.register(name, email, password); apply(r.token, r.user); };
  const googleLogin = async (idToken: string) => { const r = await api.googleLogin(idToken); apply(r.token, r.user); };
  const logout = () => { setToken(null); setUser(null); };

  return <Ctx.Provider value={{ user, loading, login, register, googleLogin, logout, refresh, setUser }}>{children}</Ctx.Provider>;
}
export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth phải dùng trong AuthProvider');
  return c;
}
