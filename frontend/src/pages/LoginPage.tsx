import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthContext';

export function LoginPage() {
  const { usuario, login } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (usuario) {
    const destino = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={destino} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await login(email, senha);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <div className="card login__card">
        <div className="login__brand">
          <img src="/brand/logo.svg" alt="Dúit Marketing" />
        </div>
        <h1 className="login__title">Seus resultados no Google Ads</h1>
        <p className="login__lead">Entre com o e-mail e a senha que a equipe da Dúit enviou para você.</p>
        <form className="login__form" onSubmit={onSubmit} noValidate>
          <label className="field">
            <span className="field__label">E-mail</span>
            <input
              className="input"
              type="email"
              autoComplete="username"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">Senha</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </label>
          {erro ? (
            <p className="login__error" role="alert">
              {erro}
            </p>
          ) : null}
          <button className="btn btn--primary" type="submit" disabled={enviando || !email || !senha} style={{ height: 46 }}>
            {enviando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
