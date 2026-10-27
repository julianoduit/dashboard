/** Traduções dos enums da Google Ads API para o cliente. */

const categorias: Record<string, string> = {
  CONTACT: 'Contato',
  PHONE_CALL_LEAD: 'Ligação',
  SUBMIT_LEAD_FORM: 'Formulário',
  IMPORTED_LEAD: 'Lead importado',
  QUALIFIED_LEAD: 'Lead qualificado',
  CONVERTED_LEAD: 'Lead convertido',
  BOOK_APPOINTMENT: 'Agendamento',
  REQUEST_QUOTE: 'Pedido de orçamento',
  GET_DIRECTIONS: 'Como chegar',
  OUTBOUND_CLICK: 'Clique para o site',
  PURCHASE: 'Compra',
  ADD_TO_CART: 'Adição ao carrinho',
  BEGIN_CHECKOUT: 'Início de checkout',
  SIGNUP: 'Cadastro',
  SUBSCRIBE_PAID: 'Assinatura',
  PAGE_VIEW: 'Visualização de página',
  STORE_VISIT: 'Visita à loja',
  STORE_SALE: 'Venda na loja',
  ENGAGEMENT: 'Engajamento',
  DOWNLOAD: 'Download',
  DEFAULT: 'Outra',
  UNKNOWN: 'Outra',
};

const canais: Record<string, string> = {
  SEARCH: 'Pesquisa',
  PERFORMANCE_MAX: 'Performance Max',
  DISPLAY: 'Display',
  VIDEO: 'YouTube',
  SHOPPING: 'Shopping',
  DEMAND_GEN: 'Demand Gen',
  DISCOVERY: 'Discovery',
  LOCAL: 'Local',
  LOCAL_SERVICES: 'Serviços locais',
  SMART: 'Inteligente',
  MULTI_CHANNEL: 'App',
  HOTEL: 'Hotel',
  TRAVEL: 'Viagens',
};

const status: Record<string, string> = {
  ENABLED: 'Ativa',
  PAUSED: 'Pausada',
  REMOVED: 'Removida',
};

export const rotuloCategoria = (c: string) => categorias[c] ?? 'Outra';
export const rotuloCanal = (c: string) => canais[c] ?? c.replaceAll('_', ' ').toLowerCase();
export const rotuloStatus = (s: string) => status[s] ?? s;
