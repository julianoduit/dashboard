import { useMemo, useState } from 'react';
import type { Campanha, Campaigns, Kpis } from '../api/types';
import { conversoes, moeda, numero, percentual, roas } from '../lib/format';
import { rotuloCanal, rotuloStatus } from '../lib/labels';

type Chave = 'nome' | keyof Kpis;

interface Coluna {
  chave: Chave;
  rotulo: string;
  render: (c: Campanha, moedaConta: string) => string;
}

function colunas(temValor: boolean): Coluna[] {
  const base: Coluna[] = [
    { chave: 'investimento', rotulo: 'Investimento', render: (c, m) => moeda(c.atual.investimento, m) },
    { chave: 'conversoes', rotulo: 'Conversões', render: (c) => conversoes(c.atual.conversoes) },
    { chave: 'custoPorConversao', rotulo: 'Custo por conversão', render: (c, m) => moeda(c.atual.custoPorConversao, m) },
    { chave: 'cliques', rotulo: 'Cliques', render: (c) => numero(c.atual.cliques) },
    { chave: 'ctr', rotulo: 'CTR', render: (c) => percentual(c.atual.ctr) },
    { chave: 'taxaConversao', rotulo: 'Taxa de conversão', render: (c) => percentual(c.atual.taxaConversao) },
  ];
  if (temValor) {
    base.push(
      { chave: 'valorConversao', rotulo: 'Valor de conversão', render: (c, m) => moeda(c.atual.valorConversao, m) },
      { chave: 'roas', rotulo: 'ROAS', render: (c) => roas(c.atual.roas) },
    );
  }
  return base;
}

function valorOrdenacao(c: Campanha, chave: Chave): number | string {
  if (chave === 'nome') return c.nome.toLocaleLowerCase('pt-BR');
  // null (sem denominador) vai sempre para o fim, em qualquer direção.
  return c.atual[chave] ?? Number.NaN;
}

export function CampaignTable({ data, moedaConta }: { data: Campaigns; moedaConta: string }) {
  const [ordem, setOrdem] = useState<{ chave: Chave; desc: boolean }>({ chave: 'investimento', desc: true });
  const cols = useMemo(() => colunas(data.temValorConversao), [data.temValorConversao]);

  const linhas = useMemo(() => {
    const arr = [...data.campanhas];
    arr.sort((a, b) => {
      const va = valorOrdenacao(a, ordem.chave);
      const vb = valorOrdenacao(b, ordem.chave);
      if (typeof va === 'number' && Number.isNaN(va)) return 1;
      if (typeof vb === 'number' && Number.isNaN(vb)) return -1;
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return ordem.desc ? -cmp : cmp;
    });
    return arr;
  }, [data.campanhas, ordem]);

  if (!data.campanhas.length) return <p className="empty">Nenhuma campanha com atividade neste período.</p>;

  const alternar = (chave: Chave) =>
    setOrdem((o) => (o.chave === chave ? { chave, desc: !o.desc } : { chave, desc: chave !== 'nome' }));
  const ariaSort = (chave: Chave) => (ordem.chave === chave ? (ordem.desc ? 'descending' : 'ascending') : 'none');
  const seta = (chave: Chave) => (ordem.chave === chave ? (ordem.desc ? '↓' : '↑') : '');

  return (
    <>
      <label className="field sort-select">
        <span className="field__label">Ordenar por</span>
        <select
          className="select"
          value={`${ordem.chave}:${ordem.desc ? 'desc' : 'asc'}`}
          onChange={(e) => {
            const [chave, dir] = e.target.value.split(':') as [Chave, string];
            setOrdem({ chave, desc: dir === 'desc' });
          }}
        >
          {cols.map((c) => (
            <option key={c.chave} value={`${c.chave}:desc`}>
              {c.rotulo} (maior)
            </option>
          ))}
          <option value="custoPorConversao:asc">Custo por conversão (menor)</option>
          <option value="nome:asc">Nome (A a Z)</option>
        </select>
      </label>

      <div className="table-wrap table-wrap--campaigns">
        <table className="table">
          <thead>
            <tr>
              <th scope="col" aria-sort={ariaSort('nome')}>
                <button type="button" className="sort-btn" data-active={ordem.chave === 'nome'} onClick={() => alternar('nome')}>
                  Campanha {seta('nome')}
                </button>
              </th>
              {cols.map((c) => (
                <th key={c.chave} scope="col" aria-sort={ariaSort(c.chave)}>
                  <button type="button" className="sort-btn" data-active={ordem.chave === c.chave} onClick={() => alternar(c.chave)}>
                    {c.rotulo} {seta(c.chave)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((c) => (
              <tr key={c.campaignId}>
                <td>
                  <span className="campaign__name">{c.nome}</span>
                  <span className="campaign__meta">
                    {rotuloCanal(c.canal)} · {rotuloStatus(c.status)}
                  </span>
                </td>
                {cols.map((col) => (
                  <td key={col.chave}>{col.render(c, moedaConta)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="campaign-cards">
        {linhas.map((c) => (
          <li key={c.campaignId} className="campaign-card">
            <span className="campaign__name">{c.nome}</span>
            <span className="campaign__meta">
              {rotuloCanal(c.canal)} · <span className="pill">{rotuloStatus(c.status)}</span>
            </span>
            <div className="campaign-card__grid">
              {cols.map((col) => (
                <div key={col.chave}>
                  <div className="campaign-card__k">{col.rotulo}</div>
                  <div className="campaign-card__v">{col.render(c, moedaConta)}</div>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
