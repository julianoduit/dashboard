import { useCallback, useEffect, useState } from 'react';

/** Mensagem curta de confirmação no rodapé, some sozinha. */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
  return { toast: useCallback((m: string) => setMsg(m), []), node };
}
