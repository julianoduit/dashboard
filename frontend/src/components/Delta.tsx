import { percentual } from '../lib/format';

/** up = subir é bom (conversões); down = cair é bom (custo por conversão); neutral = nem bom nem ruim (investimento). */
export type Sentido = 'up' | 'down' | 'neutral';

interface Props {
  valor: number | null;
  sentido: Sentido;
  referencia?: string;
}

function Seta({ dir }: { dir: 'up' | 'down' | 'flat' }) {
  const d = dir === 'up' ? 'M6 2.5 10 8H2z' : dir === 'down' ? 'M6 9.5 2 4h8z' : 'M2 5.25h8v1.5H2z';
  return (
    <svg className="delta__icon" viewBox="0 0 12 12" aria-hidden="true">
      <path d={d} fill="currentColor" />
    </svg>
  );
}

/** Variação vs. período anterior. A cor indica bom/ruim, e seta + texto carregam o mesmo significado. */
export function Delta({ valor, sentido, referencia }: Props) {
  if (valor === null) {
    // Sem base (período anterior zerado): não há variação a mostrar.
    return <span className="delta delta--none">sem dados no período anterior</span>;
  }
  const plano = Math.abs(valor) < 0.0005;
  const dir = plano ? 'flat' : valor > 0 ? 'up' : 'down';
  const tom = plano || sentido === 'neutral' ? 'neutral' : (dir === 'up') === (sentido === 'up') ? 'good' : 'bad';
  const texto = `${valor > 0 ? '+' : ''}${percentual(valor)}`;
  const leitura = plano ? 'estável' : dir === 'up' ? 'aumento de' : 'queda de';
  return (
    <span className={`delta delta--${tom}`}>
      <Seta dir={dir} />
      <span className="visually-hidden">{leitura} </span>
      {texto.replace('-', '−')}
      {referencia ? <span className="delta__ref">{referencia}</span> : null}
    </span>
  );
}
