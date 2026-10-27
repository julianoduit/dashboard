import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAdminContas, useAdminUsuarios, useExcluirUsuario, useSalvarUsuario } from '../../api/admin';
import type { Papel } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { customerId } from '../../lib/format';
import { AdminShell } from './AdminShell';

/** Senha legível para o admin repassar ao cliente (sem caracteres ambíguos como 0/O, 1/l). */
function gerarSenha(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(14);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}

function normaliza(s: string) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function UserFormPage() {
  const { id } = useParams();
  const editando = id !== undefined && id !== 'novo';
  const userId = editando ? Number(id) : undefined;
  const navigate = useNavigate();
  const { usuario: eu } = useAuth();
  const usuarios = useAdminUsuarios();
  const contas = useAdminContas();
  const salvar = useSalvarUsuario();
  const excluir = useExcluirUsuario();
  const existente = usuarios.data?.find((u) => u.id === userId);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [papel, setPapel] = useState<Papel>('cliente');
  const [ativo, setAtivo] = useState(true);
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [buscaConta, setBuscaConta] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregado, setCarregado] = useState(!editando);

  useEffect(() => {
    if (existente && !carregado) {
      setNome(existente.nome);
      setEmail(existente.email);
      setPapel(existente.papel);
      setAtivo(existente.ativo);
      setSelecionadas(new Set(existente.contas));
      setCarregado(true);
    }
  }, [existente, carregado]);

  const listaContas = useMemo(() => {
    const q = normaliza(buscaConta.trim()).replace(/-/g, '');
    return (contas.data ?? [])
      .filter((c) => !q || normaliza(c.nome).includes(q) || c.customer_id.includes(q))
      .sort((a, b) => Number(selecionadas.has(b.id)) - Number(selecionadas.has(a.id)) || Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome));
    // A ordem usa a seleção de quando o formulário carregou (selecionadas fica fora das
    // dependências de propósito), para a lista não "pular" a cada clique.
  }, [contas.data, buscaConta, carregado]);

  if (editando && usuarios.isSuccess && !existente) {
    return (
      <AdminShell>
        <p className="notice">Usuário não encontrado.</p>
      </AdminShell>
    );
  }

  const souEu = eu?.id === userId;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!editando && senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    if (editando && senha && senha.length < 8) return setErro('A nova senha precisa ter pelo menos 8 caracteres.');
    try {
      await salvar.mutateAsync({
        ...(userId !== undefined && { id: userId }),
        input: { nome, email, papel, ...(editando && { ativo }), ...(senha && { senha }), accountIds: papel === 'admin' ? [] : [...selecionadas] },
      });
      navigate('/admin/usuarios', { state: { msg: editando ? 'Usuário atualizado' : 'Usuário criado' } });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível salvar.');
    }
  }

  async function onExcluir() {
    if (!existente || !confirm(`Excluir ${existente.nome}? O acesso dele acaba na hora. Essa ação não pode ser desfeita.`)) return;
    try {
      await excluir.mutateAsync(existente.id);
      navigate('/admin/usuarios');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível excluir.');
    }
  }

  const alternarConta = (contaId: number) =>
    setSelecionadas((s) => {
      const n = new Set(s);
      if (n.has(contaId)) n.delete(contaId);
      else n.add(contaId);
      return n;
    });

  return (
    <AdminShell>
      <div className="admin-head">
        <div>
          <Link to="/admin/usuarios" className="link-btn">
            ← Usuários
          </Link>
          <h1 className="admin-head__title" style={{ marginTop: 6 }}>
            {editando ? `Editar ${existente?.nome ?? ''}` : 'Novo usuário'}
          </h1>
        </div>
      </div>

      {editando && !carregado ? (
        <div className="empty">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : (
        <form className="card form-card" onSubmit={onSubmit}>
          <div className="form-grid">
            <label className="field">
              <span className="field__label">Nome</span>
              <input className="input" required value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="off" />
            </label>
            <label className="field">
              <span className="field__label">E-mail</span>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
            </label>
            <label className="field">
              <span className="field__label">{editando ? 'Nova senha (opcional)' : 'Senha'}</span>
              <span className="input-row">
                <input
                  className="input"
                  type="text"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder={editando ? 'Deixe em branco para manter' : 'Mínimo de 8 caracteres'}
                />
                <button type="button" className="btn" onClick={() => setSenha(gerarSenha())}>
                  Gerar
                </button>
              </span>
              <span className="field__help">
                {editando ? 'Trocar a senha encerra as sessões abertas desse usuário.' : 'Envie a senha ao cliente por um canal seguro.'}
              </span>
            </label>
            <label className="field">
              <span className="field__label">Papel</span>
              <select className="select" value={papel} disabled={souEu} onChange={(e) => setPapel(e.target.value as Papel)}>
                <option value="cliente">Cliente (vê só as contas vinculadas)</option>
                <option value="admin">Equipe Dúit (admin, vê tudo)</option>
              </select>
            </label>
            {editando ? (
              <label className="switch span-2">
                <input type="checkbox" checked={ativo} disabled={souEu} onChange={(e) => setAtivo(e.target.checked)} />
                Acesso ativo {ativo ? '' : '(o usuário não consegue entrar)'}
              </label>
            ) : null}

            {papel === 'cliente' ? (
              <div className="field span-2">
                <span className="field__label">
                  Contas que este cliente pode ver ({selecionadas.size} selecionada{selecionadas.size === 1 ? '' : 's'})
                </span>
                <input
                  className="input"
                  type="search"
                  placeholder="Buscar conta"
                  aria-label="Buscar conta"
                  value={buscaConta}
                  onChange={(e) => setBuscaConta(e.target.value)}
                  style={{ height: 40, marginBottom: 6 }}
                />
                <div className="check-list" role="group" aria-label="Contas">
                  {listaContas.map((c) => (
                    <label key={c.id} className="check-item">
                      <input type="checkbox" checked={selecionadas.has(c.id)} onChange={() => alternarConta(c.id)} />
                      <span>
                        {c.nome}
                        <span className="cell-sub">
                          {customerId(c.customer_id)}
                          {!c.ativo ? ' · desativada: o cliente só vê depois de ativar a conta' : ''}
                        </span>
                      </span>
                    </label>
                  ))}
                  {!listaContas.length ? <p className="empty">Nenhuma conta encontrada.</p> : null}
                </div>
              </div>
            ) : null}
          </div>

          {erro ? (
            <p className="form-error" role="alert">
              {erro}
            </p>
          ) : null}

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={salvar.isPending}>
              {salvar.isPending ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar usuário'}
            </button>
            <Link to="/admin/usuarios" className="btn">
              Cancelar
            </Link>
            <span className="form-actions__spacer" />
            {editando && !souEu ? (
              <button type="button" className="btn btn--danger" onClick={onExcluir} disabled={excluir.isPending}>
                Excluir usuário
              </button>
            ) : null}
          </div>
        </form>
      )}
    </AdminShell>
  );
}
