import type { ReactNode } from 'react';
import { Delta, type Sentido } from './Delta';

interface Props {
  rotulo: string;
  valor: string;
  variacao: number | null;
  sentido: Sentido;
  referencia: string;
  sub?: ReactNode;
}

export function KpiTile({ rotulo, valor, variacao, sentido, referencia, sub }: Props) {
  return (
    <div className="card kpi">
      <span className="kpi__label">{rotulo}</span>
      <span className="kpi__value">{valor}</span>
      <Delta valor={variacao} sentido={sentido} />
      <span className="kpi__sub">{sub ?? referencia}</span>
    </div>
  );
}
