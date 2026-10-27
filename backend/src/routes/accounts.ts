import { Router, type Request } from 'express';
import { z } from 'zod';
import * as accounts from '../db/repositories/accounts.js';
import * as reports from '../db/repositories/reports.js';
import { addDays, daysBetweenInclusive, isIsoDate, todayInTimeZone } from '../lib/dates.js';
import { derive, totaisZerados, variacao, variacoes, type Totais } from '../metrics/derived.js';
import { diasDoPeriodo, periodoAnterior, type Periodo } from '../metrics/periods.js';
import { requireAccountAccess } from '../middleware/accountAccess.js';
import type { AdAccount } from '../db/repositories/accounts.js';

const MAX_DIAS = 731;

const isoDate = z.string().refine(isIsoDate, 'data no formato AAAA-MM-DD');
const periodoSchema = z
  .object({ inicio: isoDate.optional(), fim: isoDate.optional() })
  .refine((p) => !p.inicio || !p.fim || p.inicio <= p.fim, 'inicio deve ser anterior ou igual a fim')
  .refine((p) => !p.inicio || !p.fim || daysBetweenInclusive(p.inicio, p.fim) <= MAX_DIAS, `período máximo de ${MAX_DIAS} dias`);

/** Lê inicio/fim da query. Sem parâmetros: últimos 30 dias até ontem, no fuso da conta. */
function lerPeriodo(req: Request, account: AdAccount): { atual: Periodo; anterior: Periodo } {
  const q = periodoSchema.parse(req.query);
  const ontem = addDays(todayInTimeZone(account.fuso), -1);
  const fim = q.fim ?? (q.inicio && q.inicio > ontem ? q.inicio : ontem);
  const inicio = q.inicio ?? addDays(fim, -29);
  const atual = periodoSchema.parse({ inicio, fim }) as Periodo;
  return { atual, anterior: periodoAnterior(atual) };
}

function contaPublica(a: AdAccount) {
  return { id: a.id, nome: a.nome, moeda: a.moeda, fuso: a.fuso, ultimaSyncEm: a.ultima_sync_em };
}

export function accountsRouter(): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const user = req.user!;
    const list = user.papel === 'admin' ? await accounts.listActive() : await accounts.listForUser(user.id);
    res.json(list.map(contaPublica));
  });

  router.use('/:accountId', requireAccountAccess);

  router.get('/:accountId', (req, res) => {
    res.json(contaPublica(req.account!));
  });

  router.get('/:accountId/summary', async (req, res) => {
    const account = req.account!;
    const periodos = lerPeriodo(req, account);
    const [ta, tp, temValor] = await Promise.all([
      reports.totais(account.id, periodos.atual),
      reports.totais(account.id, periodos.anterior),
      reports.temValorConversao(account.id),
    ]);
    const atual = derive(ta, { temValorConversao: temValor });
    const anterior = derive(tp, { temValorConversao: temValor });
    res.json({
      conta: contaPublica(account),
      periodo: periodos.atual,
      periodoAnterior: periodos.anterior,
      temValorConversao: temValor,
      atual,
      anterior,
      variacao: variacoes(atual, anterior),
    });
  });

  router.get('/:accountId/daily', async (req, res) => {
    const account = req.account!;
    const periodos = lerPeriodo(req, account);
    const [sa, sp] = await Promise.all([
      reports.serieDiaria(account.id, periodos.atual),
      reports.serieDiaria(account.id, periodos.anterior),
    ]);
    // Dias sem nenhum dado aparecem com zero, para o gráfico não "pular" datas.
    const preencher = (p: Periodo, serie: Array<Totais & { data: string }>) => {
      const porDia = new Map(serie.map((s) => [s.data, s]));
      return diasDoPeriodo(p).map((data) => ({ ...totaisZerados, ...porDia.get(data), data }));
    };
    res.json({
      periodo: periodos.atual,
      periodoAnterior: periodos.anterior,
      atual: preencher(periodos.atual, sa),
      anterior: preencher(periodos.anterior, sp),
    });
  });

  router.get('/:accountId/conversion-actions', async (req, res) => {
    const account = req.account!;
    const periodos = lerPeriodo(req, account);
    const [la, lp] = await Promise.all([
      reports.porAcaoConversao(account.id, periodos.atual),
      reports.porAcaoConversao(account.id, periodos.anterior),
    ]);
    const nomes = [...new Set([...la, ...lp].map((x) => x.nome))];
    const total = la.reduce((s, x) => s + x.conversoes, 0);
    const acoes = nomes
      .map((nome) => {
        const a = la.find((x) => x.nome === nome);
        const p = lp.find((x) => x.nome === nome);
        const atual = { conversoes: a?.conversoes ?? 0, valorConversao: a?.valorConversao ?? 0 };
        const anterior = { conversoes: p?.conversoes ?? 0, valorConversao: p?.valorConversao ?? 0 };
        return {
          nome,
          categoria: a?.categoria ?? p?.categoria ?? 'UNKNOWN',
          atual,
          anterior,
          participacao: total > 0 ? atual.conversoes / total : null,
          variacao: { conversoes: variacao(atual.conversoes, anterior.conversoes), valorConversao: variacao(atual.valorConversao, anterior.valorConversao) },
        };
      })
      .sort((x, y) => y.atual.conversoes - x.atual.conversoes || y.anterior.conversoes - x.anterior.conversoes);
    res.json({ periodo: periodos.atual, periodoAnterior: periodos.anterior, totalConversoes: total, acoes });
  });

  router.get('/:accountId/campaigns', async (req, res) => {
    const account = req.account!;
    const periodos = lerPeriodo(req, account);
    const [la, lp, temValor] = await Promise.all([
      reports.porCampanha(account.id, periodos.atual),
      reports.porCampanha(account.id, periodos.anterior),
      reports.temValorConversao(account.id),
    ]);
    const anteriorPorId = new Map(lp.map((c) => [c.campaignId, c]));
    const pick = (c: Totais): Totais => ({
      impressoes: c.impressoes,
      cliques: c.cliques,
      investimento: c.investimento,
      conversoes: c.conversoes,
      valorConversao: c.valorConversao,
    });
    const campanhas = la
      // Campanhas sem nenhuma atividade no período só poluem a tabela do cliente.
      .filter((c) => c.impressoes > 0 || c.investimento > 0 || c.conversoes > 0)
      .map((c) => {
        const atual = derive(pick(c), { temValorConversao: temValor });
        const p = anteriorPorId.get(c.campaignId);
        const anterior = derive(p ? pick(p) : totaisZerados, { temValorConversao: temValor });
        return { campaignId: String(c.campaignId), nome: c.nome, status: c.status, canal: c.canal, atual, anterior, variacao: variacoes(atual, anterior) };
      })
      .sort((x, y) => y.atual.investimento - x.atual.investimento);
    res.json({ periodo: periodos.atual, periodoAnterior: periodos.anterior, temValorConversao: temValor, campanhas });
  });

  return router;
}
