import { useEffect, useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useCampaigns, useConversionActions, useDaily, useSummary } from '../../api/hooks';
import type { Conta } from '../../api/types';
import { CampaignTable } from '../../components/CampaignTable';
import { ConversionBreakdown } from '../../components/ConversionBreakdown';
import { DailyCharts } from '../../components/DailyCharts';
import { Delta } from '../../components/Delta';
import { Filters } from '../../components/Filters';
import { KpiTile } from '../../components/KpiTile';
import { conversoes, dataCurta, dataHora, moeda, numero, percentual, roas } from '../../lib/format';
import { addDias, diasEntre, hojeNoFuso, isIsoDate, periodoDoPreset, PRESETS, rotuloComparacao, type Periodo, type PresetId } from '../../lib/periods';

const MAX_DIAS = 731;

/** Lê conta e período da URL (assim recarregar ou compartilhar o link mantém a visão). */
function useFiltros(contas: Conta[]) {
  const [params, setParams] = useSearchParams();
  const contaParam = Number(params.get('conta'));
  const conta = contas.find((c) => c.id === contaParam) ?? contas[0];
  const fuso = conta?.fuso ?? 'America/Sao_Paulo';
  const presetParam = params.get('periodo') as PresetId | null;
  const preset: PresetId = PRESETS.some((p) => p.id === presetParam) ? presetParam! : '30d';
  const maxData = addDias(hojeNoFuso(fuso), -1);

  const periodo = useMemo<Periodo>(() => {
    if (preset === 'custom') {
      const inicio = params.get('inicio');
      const fim = params.get('fim');
      if (isIsoDate(inicio) && isIsoDate(fim) && inicio <= fim && diasEntre(inicio, fim) <= MAX_DIAS) return { inicio, fim };
      return periodoDoPreset('30d', fuso);
    }
    return periodoDoPreset(preset, fuso);
  }, [preset, params, fuso]);

  const atualizar = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v === null ? next.delete(k) : next.set(k, v));
    setParams(next, { replace: true });
  };

  return {
    conta,
    preset,
    periodo,
    maxData,
    setConta: (id: number) => atualizar({ conta: String(id) }),
    setPreset: (p: PresetId) =>
      atualizar(p === 'custom' ? { periodo: p, inicio: periodo.inicio, fim: periodo.fim } : { periodo: p, inicio: null, fim: null }),
    setCustom: (p: Periodo) => {
      if (p.inicio > p.fim || diasEntre(p.inicio, p.fim) > MAX_DIAS) return;
      atualizar({ periodo: 'custom', inicio: p.inicio, fim: p.fim });
    },
  };
}

function Secao({ titulo, dica, children, carregando }: { titulo: string; dica?: ReactNode; children: ReactNode; carregando?: boolean }) {
  return (
    <section className={`card section${carregando ? ' is-refreshing' : ''}`} aria-busy={carregando}>
      <div className="section__head">
        <h2 className="section__title">{titulo}</h2>
        {dica ? <span className="section__hint">{dica}</span> : null}
      </div>
      {children}
    </section>
  );
}

function Carregando() {
  return (
    <div className="empty" role="status">
      <span className="visually-hidden">Carregando</span>
      <div className="spinner" style={{ margin: '0 auto' }} />
    </div>
  );
}

function Erro({ erro }: { erro: Error }) {
  return <p className="notice">{erro.message}</p>;
}

interface Props {
  contas: Conta[];
  /** Título opcional acima dos filtros (ex.: "Visualizando como ..." no modo admin). */
  titulo?: ReactNode;
}

export function Dashboard({ contas, titulo }: Props) {
  const f = useFiltros(contas);
  const contaId = f.conta?.id;
  const summary = useSummary(contaId, f.periodo);
  const daily = useDaily(contaId, f.periodo);
  const actions = useConversionActions(contaId, f.periodo);
  const campaigns = useCampaigns(contaId, f.periodo);

  useEffect(() => {
    if (f.conta) document.title = `${f.conta.nome} | Resultados`;
  }, [f.conta]);

  if (!f.conta) {
    return (
      <div className="container">
        <div className="card section">
          <h1 className="section__title">Nenhuma conta disponível</h1>
          <p className="muted">Ainda não há contas de anúncio liberadas para o seu usuário. Fale com a equipe da Dúit.</p>
        </div>
      </div>
    );
  }

  const conta = f.conta;
  const m = conta.moeda;
  const ref = rotuloComparacao(f.periodo);
  const s = summary.data;
  const semDados = s && s.atual.impressoes === 0 && s.atual.investimento === 0 && s.atual.conversoes === 0;
  const ultimaSync = s?.conta.ultimaSyncEm ?? conta.ultimaSyncEm;

  return (
    <div className="container">
      <div className="page-head">
        {titulo}
        <h1 className="page-head__title">{conta.nome}</h1>
        <Filters
          contas={contas}
          contaId={contaId}
          onConta={f.setConta}
          preset={f.preset}
          periodo={f.periodo}
          onPreset={f.setPreset}
          onCustom={f.setCustom}
          maxData={f.maxData}
        />
        <div className="freshness">
          <span>
            <span className="freshness__dot" aria-hidden="true" />
            {ultimaSync ? `Dados atualizados em ${dataHora(ultimaSync, conta.fuso)}` : 'Primeira atualização ainda não aconteceu'}
          </span>
          <span className="freshness__note">
            {dataCurta(f.periodo.inicio)} a {dataCurta(f.periodo.fim)}. Os números dos últimos dias ainda podem mudar: o Google Ads
            conta a conversão no dia do clique.
          </span>
        </div>
      </div>

      {summary.error ? <Erro erro={summary.error} /> : null}

      {s ? (
        <div className={`kpis${summary.isPlaceholderData ? ' is-refreshing' : ''}`}>
          <div className="card kpi kpi--hero">
            <span className="kpi__label">Conversões</span>
            <span className="kpi__value">{conversoes(s.atual.conversoes)}</span>
            <div className="kpi__hero-foot">
              <Delta valor={s.variacao.conversoes} sentido="up" referencia={ref} />
              <span>antes: {conversoes(s.anterior.conversoes)}</span>
            </div>
          </div>
          <KpiTile rotulo="Investimento" valor={moeda(s.atual.investimento, m)} variacao={s.variacao.investimento} sentido="neutral" referencia={ref} />
          <KpiTile
            rotulo="Custo por conversão"
            valor={moeda(s.atual.custoPorConversao, m)}
            variacao={s.variacao.custoPorConversao}
            sentido="down"
            referencia={ref}
          />
          {s.temValorConversao ? (
            <KpiTile
              rotulo="Valor de conversão"
              valor={moeda(s.atual.valorConversao, m)}
              variacao={s.variacao.valorConversao}
              sentido="up"
              referencia={ref}
              sub={`ROAS ${roas(s.atual.roas)}`}
            />
          ) : (
            <KpiTile
              rotulo="Taxa de conversão"
              valor={percentual(s.atual.taxaConversao)}
              variacao={s.variacao.taxaConversao}
              sentido="up"
              referencia={ref}
            />
          )}
          <KpiTile rotulo="Cliques" valor={numero(s.atual.cliques)} variacao={s.variacao.cliques} sentido="up" referencia={ref} />
          <KpiTile rotulo="CTR" valor={percentual(s.atual.ctr, 2)} variacao={s.variacao.ctr} sentido="up" referencia={ref} sub="cliques ÷ impressões" />
          <KpiTile rotulo="CPC médio" valor={moeda(s.atual.cpcMedio, m)} variacao={s.variacao.cpcMedio} sentido="down" referencia={ref} />
        </div>
      ) : summary.isPending ? (
        <Carregando />
      ) : null}

      {semDados ? (
        <p className="notice" style={{ marginTop: 20 }}>
          Não há dados de anúncios para este período. Se a conta foi liberada agora, os números aparecem depois da primeira atualização.
        </p>
      ) : null}

      <Secao
        titulo="De onde vieram as conversões"
        dica={actions.data ? `${conversoes(actions.data.totalConversoes)} no total` : undefined}
        carregando={actions.isPlaceholderData}
      >
        {actions.error ? (
          <Erro erro={actions.error} />
        ) : actions.data ? (
          <ConversionBreakdown data={actions.data} moedaConta={m} mostrarValor={!!s?.temValorConversao} referencia={ref} />
        ) : (
          <Carregando />
        )}
      </Secao>

      <Secao titulo="Dia a dia" carregando={daily.isPlaceholderData}>
        {daily.error ? <Erro erro={daily.error} /> : daily.data ? <DailyCharts data={daily.data} moedaConta={m} /> : <Carregando />}
      </Secao>

      <Secao titulo="Campanhas" dica={<span className="only-desktop">Clique no título da coluna para ordenar</span>} carregando={campaigns.isPlaceholderData}>
        {campaigns.error ? <Erro erro={campaigns.error} /> : campaigns.data ? <CampaignTable data={campaigns.data} moedaConta={m} /> : <Carregando />}
      </Secao>
    </div>
  );
}
