import { useMinhasContas } from '../../api/hooks';
import { AppShell } from '../../components/AppShell';
import { Dashboard } from './Dashboard';

export function ClientHome() {
  const contas = useMinhasContas();
  return (
    <AppShell>
      {contas.isPending ? (
        <div className="loading">
          <div className="spinner" />
        </div>
      ) : contas.error ? (
        <div className="container">
          <p className="notice">{contas.error.message}</p>
        </div>
      ) : (
        <Dashboard contas={contas.data} />
      )}
    </AppShell>
  );
}
