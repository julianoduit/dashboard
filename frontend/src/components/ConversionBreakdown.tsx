import type { AcaoConversao, ConversionActions } from '../api/types';
import { conversoes, moeda, percentual } from '../lib/format';
import { rotuloCategoria } from '../lib/labels';
import { Delta } from './Delta';

const MAX_LINHAS = 7;

/** Junta as ações menores em "Outras" para a lista continuar legível no celular. */
function agrupar(acoes: AcaoConversao[]): AcaoConversao[] {
  const ativas = acoes.filter((a) => a.atual.conversoes > 0 || a.anterior.conversoes > 0);
  if (ativas.length <= MAX_LINHAS) return ativas;
  const principais = ativas.slice(0, MAX_LINHAS - 1);
  const resto = ativas.slice(MAX_LINHAS - 1);
  const soma = (f: (a: AcaoConversao) => number) => resto.reduce((s, a) => s + f(a), 0);
  const total = ativas.reduce((s, a) => s + a.atual.conversoes, 0);
  const atual = { conversoes: soma((a) => a.atual.conversoes), valorConversao: soma((a) => a.atual.valorConversao) };
  const anterior = { conversoes: soma((a) => a.anterior.conversoes), valorConversao: soma((a) => a.anterior.valorConversao) };
  return [
    ...principais,
    {
      nome: `Outras (${resto.length})`,
      categoria: 'DEFAULT',
      atual,
      anterior,
      participacao: total > 0 ? atual.conversoes / total : null,
      variacao: {
        conversoes: anterior.conversoes > 0 ? (atual.conversoes - anterior.conversoes) / anterior.conversoes : null,
        valorConversao: null,
      },
    },
  ];
}

interface Props {
  data: ConversionActions;
  moedaConta: string;
  mostrarValor: boolean;
  referencia: string;
}

export function ConversionBreakdown({ data, moedaConta, mostrarValor, referencia }: Props) {
  const linhas = agrupar(data.acoes);
  if (!linhas.length) return <p className="empty">Nenhuma conversão registrada neste período.</p>;
  const max = Math.max(...linhas.map((l) => l.atual.conversoes), 0);

  return (
    <ul className="breakdown">
      {linhas.map((l, i) => {
        const largura = max > 0 ? (l.atual.conversoes / max) * 100 : 0;
        return (
          <li key={l.nome} className="breakdown__row">
            <span className="breakdown__name">
              {l.nome}
              <span className="breakdown__cat">{rotuloCategoria(l.categoria)}</span>
            </span>
            <span className="breakdown__nums">
              <span className="breakdown__value">{conversoes(l.atual.conversoes)}</span>
              <span className="breakdown__share">{percentual(l.participacao, 0)}</span>
            </span>
            <div className="breakdown__track" aria-hidden="true">
              <div className="breakdown__bar" style={{ width: `${largura}%`, animationDelay: `${i * 60}ms` }} />
            </div>
            <span className="breakdown__meta">
              <Delta valor={l.variacao.conversoes} sentido="up" referencia={referencia} />
              <span>antes: {conversoes(l.anterior.conversoes)}</span>
              {mostrarValor && l.atual.valorConversao > 0 ? <span>valor: {moeda(l.atual.valorConversao, moedaConta)}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
