export type Papel = 'admin' | 'cliente';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  papel: Papel;
}

export interface Conta {
  id: number;
  nome: string;
  moeda: string;
  fuso: string;
  ultimaSyncEm: string | null;
}

export interface Periodo {
  inicio: string;
  fim: string;
}

export interface Kpis {
  impressoes: number;
  cliques: number;
  investimento: number;
  conversoes: number;
  valorConversao: number;
  ctr: number | null;
  cpcMedio: number | null;
  custoPorConversao: number | null;
  taxaConversao: number | null;
  roas: number | null;
}

export type Variacoes = Record<keyof Kpis, number | null>;

export interface Summary {
  conta: Conta;
  periodo: Periodo;
  periodoAnterior: Periodo;
  temValorConversao: boolean;
  atual: Kpis;
  anterior: Kpis;
  variacao: Variacoes;
}

export interface Dia {
  data: string;
  impressoes: number;
  cliques: number;
  investimento: number;
  conversoes: number;
  valorConversao: number;
}

export interface Daily {
  periodo: Periodo;
  periodoAnterior: Periodo;
  atual: Dia[];
  anterior: Dia[];
}

export interface AcaoConversao {
  nome: string;
  categoria: string;
  atual: { conversoes: number; valorConversao: number };
  anterior: { conversoes: number; valorConversao: number };
  participacao: number | null;
  variacao: { conversoes: number | null; valorConversao: number | null };
}

export interface ConversionActions {
  periodo: Periodo;
  periodoAnterior: Periodo;
  totalConversoes: number;
  acoes: AcaoConversao[];
}

export interface Campanha {
  campaignId: string;
  nome: string;
  status: string;
  canal: string;
  atual: Kpis;
  anterior: Kpis;
  variacao: Variacoes;
}

export interface Campaigns {
  periodo: Periodo;
  periodoAnterior: Periodo;
  temValorConversao: boolean;
  campanhas: Campanha[];
}
