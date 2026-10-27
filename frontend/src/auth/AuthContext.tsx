import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import type { Usuario } from '../api/types';

interface AuthValue {
  usuario: Usuario | null;
  carregando: boolean;
  login: (email: string, senha: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<Usuario>('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60_000,
  });

  const loginMut = useMutation({
    mutationFn: (v: { email: string; senha: string }) => api<Usuario>('/auth/login', { method: 'POST', json: v }),
    onSuccess: (u) => {
      qc.clear();
      qc.setQueryData(['me'], u);
    },
  });

  const value: AuthValue = {
    usuario: me.data ?? null,
    carregando: me.isPending,
    login: async (email, senha) => {
      await loginMut.mutateAsync({ email, senha });
    },
    logout: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
      qc.clear();
      qc.setQueryData(['me'], null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
