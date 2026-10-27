import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Daily, Dia } from '../api/types';
import { conversoes, dataExtenso, diaMes, moeda, moedaCompacta, numeroCompacto } from '../lib/format';

interface SerieProps {
  titulo: string;
  dias: Dia[];
  campo: 'conversoes' | 'investimento';
  formatar: (v: number) => string;
  formatarEixo: (v: number) => string;
  total: string;
}

interface DicaProps {
  active?: boolean;
  payload?: ReadonlyArray<{ value?: unknown; payload?: unknown }>;
  formatar: (v: number) => string;
}

function DicaDia({ active, payload, formatar }: DicaProps) {
  const p = payload?.[0];
  if (!active || !p) return null;
  const dia = p.payload as Dia;
  return (
    <div className="tooltip">
      <div className="tooltip__value">
        <span className="tooltip__key" aria-hidden="true" />
        {formatar(Number(p.value))}
      </div>
      <div className="tooltip__label">{dataExtenso(dia.data)}</div>
    </div>
  );
}

/** Um gráfico por medida (nunca dois eixos Y no mesmo gráfico). O hover é sincronizado pelo syncId. */
function Serie({ titulo, dias, campo, formatar, formatarEixo, total }: SerieProps) {
  const gradId = `wash-${campo}`;
  return (
    <figure style={{ margin: 0 }}>
      <figcaption>
        <div className="chart__title">{titulo}</div>
        <div className="chart__total">Total no período: {total}</div>
      </figcaption>
      <div className="chart__frame">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={dias} syncId="diario" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--data-1)" stopOpacity={0.16} />
                <stop offset="100%" stopColor="var(--data-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--hairline)" strokeWidth={1} />
            <XAxis
              dataKey="data"
              tickFormatter={diaMes}
              tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--axis)' }}
              minTickGap={24}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={formatarEixo}
              tick={{ fill: 'var(--ink-3)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={campo === 'investimento' ? 64 : 36}
              allowDecimals={campo === 'investimento'}
            />
            <Tooltip
              cursor={{ stroke: 'var(--ink-3)', strokeWidth: 1 }}
              content={(props) => <DicaDia active={props.active} payload={props.payload} formatar={formatar} />}
              isAnimationActive={false}
            />
            <Area
              type="linear"
              dataKey={campo}
              stroke="var(--data-1)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              fill={`url(#${gradId})`}
              dot={dias.length <= 14 ? { r: 3.5, fill: 'var(--data-1)', stroke: 'var(--surface-1)', strokeWidth: 2 } : false}
              activeDot={{ r: 4.5, fill: 'var(--data-1)', stroke: 'var(--surface-1)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function DailyCharts({ data, moedaConta }: { data: Daily; moedaConta: string }) {
  const totConv = data.atual.reduce((s, d) => s + d.conversoes, 0);
  const totInv = data.atual.reduce((s, d) => s + d.investimento, 0);
  return (
    <>
      <div className="charts">
        <Serie
          titulo="Conversões por dia"
          dias={data.atual}
          campo="conversoes"
          formatar={conversoes}
          formatarEixo={numeroCompacto}
          total={conversoes(totConv)}
        />
        <Serie
          titulo="Investimento por dia"
          dias={data.atual}
          campo="investimento"
          formatar={(v) => moeda(v, moedaConta)}
          formatarEixo={(v) => moedaCompacta(v, moedaConta)}
          total={moeda(totInv, moedaConta)}
        />
      </div>
      <details className="details">
        <summary>Ver dados dia a dia em tabela</summary>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Dia</th>
                <th scope="col">Conversões</th>
                <th scope="col">Investimento</th>
                <th scope="col">Cliques</th>
              </tr>
            </thead>
            <tbody>
              {[...data.atual].reverse().map((d) => (
                <tr key={d.data}>
                  <td>{dataExtenso(d.data)}</td>
                  <td>{conversoes(d.conversoes)}</td>
                  <td>{moeda(d.investimento, moedaConta)}</td>
                  <td>{d.cliques.toLocaleString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
