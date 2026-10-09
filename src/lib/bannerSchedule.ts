// Regras de agendamento dos banners promocionais.
// Tudo é avaliado no fuso da loja, independente do fuso do aparelho do cliente.

export type AgendamentoTipo = 'sempre' | 'semanal' | 'data';

export interface BannerAgendavel {
  id: string;
  ativo: boolean;
  imagem_url: string | null;
  agendamento_tipo: AgendamentoTipo;
  dias_semana: string[];
  data_inicio: string | null; // YYYY-MM-DD
  data_fim: string | null; // YYYY-MM-DD
  hora_inicio: string | null; // HH:MM[:SS]
  hora_fim: string | null;
  updated_at: string;
}

export const STORE_TIMEZONE = 'America/Sao_Paulo';

// Índice = Date.getDay()
export const DIAS_SEMANA = [
  { key: 'dom', curto: 'Dom', longo: 'Domingo' },
  { key: 'seg', curto: 'Seg', longo: 'Segunda' },
  { key: 'ter', curto: 'Ter', longo: 'Terça' },
  { key: 'qua', curto: 'Qua', longo: 'Quarta' },
  { key: 'qui', curto: 'Qui', longo: 'Quinta' },
  { key: 'sex', curto: 'Sex', longo: 'Sexta' },
  { key: 'sab', curto: 'Sáb', longo: 'Sábado' },
] as const;

export interface ZonedNow {
  date: string; // YYYY-MM-DD
  weekday: number; // 0 = domingo
  minutes: number; // minutos desde 00:00
}

const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

const zonedFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: STORE_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

export function getZonedNow(now: Date = new Date()): ZonedNow {
  const parts = Object.fromEntries(zonedFormatter.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
    minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
  };
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export function formatTime(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : '';
}

export function formatDateShort(date: string): string {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
}

/** Janela de horário do banner, ou null quando vale o dia todo. */
function timeWindow(b: BannerAgendavel): { start: number; end: number } | null {
  const start = timeToMinutes(b.hora_inicio);
  const end = timeToMinutes(b.hora_fim);
  if (start === null || end === null || start === end) return null;
  return { start, end };
}

/** O banner está programado para o dia informado (ignorando horário)? */
export function matchesDay(b: BannerAgendavel, date: string, weekday: number): boolean {
  switch (b.agendamento_tipo) {
    case 'semanal':
      return b.dias_semana.includes(DIAS_SEMANA[weekday].key);
    case 'data': {
      if (!b.data_inicio) return false;
      const fim = b.data_fim ?? b.data_inicio;
      return date >= b.data_inicio && date <= fim;
    }
    default:
      return true;
  }
}

/** Banner ativo e dentro da janela agendada neste momento. */
export function isLiveAt(b: BannerAgendavel, now: ZonedNow): boolean {
  if (!b.ativo) return false;
  const win = timeWindow(b);
  if (!win) return matchesDay(b, now.date, now.weekday);

  if (win.start < win.end) {
    return matchesDay(b, now.date, now.weekday) && now.minutes >= win.start && now.minutes < win.end;
  }

  // Janela que atravessa a meia-noite (ex.: 18:00–02:00).
  // Depois da meia-noite, quem vale é a programação do dia anterior.
  if (now.minutes >= win.start) return matchesDay(b, now.date, now.weekday);
  if (now.minutes < win.end) {
    const ontem = shiftDate(now.date, -1);
    return matchesDay(b, ontem, weekdayOf(ontem));
  }
  return false;
}

/** Quanto mais específica a regra, maior a prioridade. */
export function priorityOf(b: BannerAgendavel): number {
  const base = b.agendamento_tipo === 'data' ? 30 : b.agendamento_tipo === 'semanal' ? 20 : 10;
  return base + (timeWindow(b) ? 5 : 0);
}

export function compareByPriority(a: BannerAgendavel, b: BannerAgendavel): number {
  return priorityOf(b) - priorityOf(a) || b.updated_at.localeCompare(a.updated_at);
}

/** Banner que deve aparecer no site agora (ou null). */
export function pickLiveBanner<T extends BannerAgendavel>(banners: T[], now: ZonedNow): T | null {
  const live = banners.filter((b) => b.imagem_url && isLiveAt(b, now));
  live.sort(compareByPriority);
  return live[0] ?? null;
}

export function isExpired(b: BannerAgendavel, now: ZonedNow): boolean {
  if (b.agendamento_tipo !== 'data' || !b.data_inicio) return false;
  const fim = b.data_fim ?? b.data_inicio;
  if (fim > now.date) return false;
  if (fim < now.date) {
    // Ainda pode estar no trecho pós-meia-noite de uma janela noturna.
    const win = timeWindow(b);
    return !(win && win.start > win.end && fim === shiftDate(now.date, -1) && now.minutes < win.end);
  }
  // Último dia: expira quando a janela de hoje já passou.
  const win = timeWindow(b);
  return !!win && win.start < win.end && now.minutes >= win.end;
}

export interface NextStart {
  date: string;
  minutes: number;
}

/** Próximo momento em que o banner entra no ar (procura nas próximas 2 semanas). */
export function nextStart(b: BannerAgendavel, now: ZonedNow): NextStart | null {
  const win = timeWindow(b);
  const startMin = win?.start ?? 0;
  for (let d = 0; d < 15; d++) {
    const date = shiftDate(now.date, d);
    if (!matchesDay(b, date, weekdayOf(date))) continue;
    if (d === 0 && startMin <= now.minutes) continue;
    return { date, minutes: startMin };
  }
  return null;
}

export function describeNextStart(next: NextStart, now: ZonedNow): string {
  const hh = String(Math.floor(next.minutes / 60)).padStart(2, '0');
  const mm = String(next.minutes % 60).padStart(2, '0');
  const hora = `${hh}:${mm}`;
  if (next.date === now.date) return `hoje às ${hora}`;
  if (next.date === shiftDate(now.date, 1)) return `amanhã às ${hora}`;
  const dia = DIAS_SEMANA[weekdayOf(next.date)].curto.toLowerCase();
  return `${dia}, ${formatDateShort(next.date)} às ${hora}`;
}

const DIAS_UTEIS = ['seg', 'ter', 'qua', 'qui', 'sex'];

function describeDays(dias: string[]): string {
  const ordered = DIAS_SEMANA.filter((d) => dias.includes(d.key));
  if (ordered.length === 7) return 'Todos os dias';
  if (ordered.length === 5 && DIAS_UTEIS.every((d) => dias.includes(d))) return 'Seg a Sex';
  if (ordered.length === 2 && dias.includes('sab') && dias.includes('dom')) return 'Fins de semana';
  if (ordered.length === 1) return `Toda ${ordered[0].longo.toLowerCase()}`;
  return ordered.map((d) => d.curto).join(', ');
}

export function describeTimeWindow(b: Pick<BannerAgendavel, 'hora_inicio' | 'hora_fim'>): string {
  const start = timeToMinutes(b.hora_inicio);
  const end = timeToMinutes(b.hora_fim);
  if (start === null || end === null || start === end) return 'dia todo';
  const sufixo = end < start ? ' (dia seguinte)' : '';
  return `${formatTime(b.hora_inicio)} às ${formatTime(b.hora_fim)}${sufixo}`;
}

export function describeSchedule(b: BannerAgendavel): string {
  let dias: string;
  switch (b.agendamento_tipo) {
    case 'semanal':
      dias = b.dias_semana.length ? describeDays(b.dias_semana) : 'Nenhum dia selecionado';
      break;
    case 'data':
      if (!b.data_inicio) dias = 'Data não definida';
      else if (!b.data_fim || b.data_fim === b.data_inicio) dias = `Em ${formatDateShort(b.data_inicio)}`;
      else dias = `De ${formatDateShort(b.data_inicio)} a ${formatDateShort(b.data_fim)}`;
      break;
    default:
      dias = 'Todos os dias';
  }
  return `${dias} · ${describeTimeWindow(b)}`;
}

export type BannerStatus = 'no_ar' | 'sobreposto' | 'agendado' | 'expirado' | 'desativado' | 'sem_imagem';

export function bannerStatus(b: BannerAgendavel, now: ZonedNow, liveId: string | null): BannerStatus {
  if (!b.ativo) return 'desativado';
  if (!b.imagem_url) return 'sem_imagem';
  if (b.id === liveId) return 'no_ar';
  if (isLiveAt(b, now)) return 'sobreposto';
  if (isExpired(b, now)) return 'expirado';
  return 'agendado';
}
