import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, qs } from './client';
import type { Conta, Papel, Usuario } from './types';

export type SyncStatus = 'executando' | 'sucesso' | 'erro' | 'adiado';

export interface AdminConta {
  id: number;
  customer_id: string;
  nome: string;
  moeda: string;
  fuso: string;
  status_google: string | null;
  ativo: boolean;
  exibir_roas: boolean;
  na_mcc: boolean;
  historico_ate: string | null;
  historico_completo: boolean;
  ultima_sync_em: string | null;
  usuarios: number;
  ultima_sync_status: SyncStatus | null;
  ultima_sync_erro: string | null;
}

export interface AdminUsuario extends Usuario {
  ativo: boolean;
  criado_em: string;
  contas: number[];
}

export interface SyncRun {
  id: number;
  ad_account_id: number;
  conta_nome: string;
  customer_id: string;
  tipo: 'diario' | 'manual' | 'backfill';
  status: SyncStatus;
  periodo_inicio: string;
  periodo_fim: string;
  inicio: string;
  fim: string | null;
  linhas_gravadas: number;
  operacoes: number;
  erro: string | null;
  observacao: string | null;
  disparado_por_nome: string | null;
}

export interface UsuarioInput {
  nome: string;
  email: string;
  senha?: string;
  papel: Papel;
  ativo?: boolean;
  accountIds: number[];
}

const algumaRodando = (contas?: AdminConta[]) => !!contas?.some((c) => c.ultima_sync_status === 'executando');

/** Enquanto houver sync em andamento, atualiza a lista a cada 3 s. */
export const useAdminContas = () =>
  useQuery({
    queryKey: ['admin', 'accounts'],
    queryFn: () => api<AdminConta[]>('/admin/accounts'),
    staleTime: 10_000,
    refetchInterval: (q) => (algumaRodando(q.state.data) ? 3000 : false),
  });

export const useAdminUsuarios = () => useQuery({ queryKey: ['admin', 'users'], queryFn: () => api<AdminUsuario[]>('/admin/users') });

export const useSyncRuns = (filtro: { accountId?: number; status?: SyncStatus }) =>
  useQuery({
    queryKey: ['admin', 'sync-runs', filtro],
    queryFn: () => api<SyncRun[]>(`/admin/sync-runs${qs({ accountId: filtro.accountId, status: filtro.status, limit: 200 })}`),
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === 'executando') ? 3000 : false),
  });

export const useContasDoUsuario = (userId: number) =>
  useQuery({
    queryKey: ['admin', 'users', userId, 'accounts'],
    queryFn: () => api<{ usuario: Usuario; contas: Conta[] }>(`/admin/users/${userId}/accounts`),
  });

export const useConta = (id: number) => useQuery({ queryKey: ['account', id], queryFn: () => api<Conta>(`/accounts/${id}`) });

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['admin'] });
    void qc.invalidateQueries({ queryKey: ['accounts'] });
  };
}

export function useAtualizarMcc() {
  const done = useInvalidate();
  return useMutation({ mutationFn: () => api<{ contas: number }>('/admin/accounts/refresh-mcc', { method: 'POST' }), onSuccess: done });
}

export function useAlterarConta() {
  const qc = useQueryClient();
  const done = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: number; ativo?: boolean; exibirRoas?: boolean }) =>
      api<AdminConta>(`/admin/accounts/${v.id}`, {
        method: 'PATCH',
        json: { ...(v.ativo !== undefined && { ativo: v.ativo }), ...(v.exibirRoas !== undefined && { exibirRoas: v.exibirRoas }) },
      }),
    // Atualização otimista: o interruptor responde na hora.
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ['admin', 'accounts'] });
      const prev = qc.getQueryData<AdminConta[]>(['admin', 'accounts']);
      qc.setQueryData<AdminConta[]>(['admin', 'accounts'], (list) =>
        list?.map((c) =>
          c.id === v.id ? { ...c, ...(v.ativo !== undefined && { ativo: v.ativo }), ...(v.exibirRoas !== undefined && { exibir_roas: v.exibirRoas }) } : c,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(['admin', 'accounts'], ctx.prev),
    onSettled: done,
  });
}

export function useSincronizar() {
  const done = useInvalidate();
  return useMutation({ mutationFn: (id: number) => api(`/admin/accounts/${id}/sync`, { method: 'POST' }), onSuccess: done });
}

export function useSalvarUsuario() {
  const done = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, input }: { id?: number; input: UsuarioInput }) => {
      if (id === undefined) {
        return api<AdminUsuario>('/admin/users', {
          method: 'POST',
          json: { nome: input.nome, email: input.email, senha: input.senha, papel: input.papel, accountIds: input.accountIds },
        });
      }
      const user = await api<AdminUsuario>(`/admin/users/${id}`, {
        method: 'PATCH',
        json: {
          nome: input.nome,
          email: input.email,
          papel: input.papel,
          ...(input.ativo !== undefined && { ativo: input.ativo }),
          ...(input.senha && { senha: input.senha }),
        },
      });
      await api(`/admin/users/${id}/accounts`, { method: 'PUT', json: { accountIds: input.accountIds } });
      return user;
    },
    onSuccess: done,
  });
}

export function useExcluirUsuario() {
  const done = useInvalidate();
  return useMutation({ mutationFn: (id: number) => api(`/admin/users/${id}`, { method: 'DELETE' }), onSuccess: done });
}
