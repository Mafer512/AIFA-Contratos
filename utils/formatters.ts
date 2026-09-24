export type MonetaryValue = number | string | null | undefined;

export interface CurrencyFormatOptions {
  includeSymbol?: boolean;
  useGrouping?: boolean;
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();

const getCurrencyFormatter = ({
  includeSymbol = true,
  useGrouping = true,
}: CurrencyFormatOptions = {}) => {
  const cacheKey = `${includeSymbol ? 'currency' : 'decimal'}-${useGrouping ? 'grouped' : 'plain'}`;
  const cached = currencyFormatters.get(cacheKey);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat('es-MX', {
    ...(includeSymbol ? { style: 'currency' as const, currency: 'MXN' } : { style: 'decimal' as const }),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping,
  });
  currencyFormatters.set(cacheKey, formatter);
  return formatter;
};

const toFiniteMonetaryNumber = (value: MonetaryValue): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;

  const sanitized = value.trim().replace(/[$\s,]/g, '');
  if (!sanitized) return 0;
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Formats a monetary value for presentation only. It never mutates the source
 * value and always renders exactly two decimal places.
 */
export const formatCurrency = (
  value: MonetaryValue,
  options: CurrencyFormatOptions = {},
): string => getCurrencyFormatter(options).format(toFiniteMonetaryNumber(value));

/** Identifies dynamic table columns whose values represent money. */
export const isMonetaryField = (key: string): boolean => {
  const normalized = key.trim().toLowerCase();
  const exactMonths = [
    'ene', 'enero', 'feb', 'febrero', 'mar', 'marzo', 'abr', 'abril',
    'may', 'mayo', 'jun', 'junio', 'jul', 'julio', 'ago', 'agosto',
    'sep', 'septiembre', 'oct', 'octubre', 'nov', 'noviembre', 'dic', 'diciembre',
  ].flatMap((month) => [month, `${month}.`]);

  if (exactMonths.includes(normalized)) return true;
  return [
    'monto', 'importe', 'total', 'presupuesto', 'costo', 'valor', 'ejercido',
    'pagado', 'preventivos', 'correctivos', 'nota de', 'credito', 'crédito',
  ].some((fragment) => normalized.includes(fragment));
};

/**
 * Duración legible a partir de milisegundos: "2 h 15 min", "45 min", "30 s".
 *
 * Se corta en dos unidades a propósito. En la bitácora de accesos el dato útil
 * es el orden de magnitud de la sesión, no el segundo exacto, y "2 h 15 min 33 s"
 * estorba más de lo que informa.
 */
export const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) return '—';

  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} s`;

  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;

  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (totalHours < 24) return minutes ? `${totalHours} h ${minutes} min` : `${totalHours} h`;

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours ? `${days} d ${hours} h` : `${days} d`;
};

/**
 * Tiempo transcurrido en lenguaje natural: "hace 5 min", "hace 2 días".
 * Devuelve "ahora mismo" por debajo de un minuto.
 */
export const formatRelativeTime = (timestampMs: number, nowMs: number = Date.now()): string => {
  const diff = nowMs - timestampMs;
  if (!Number.isFinite(diff)) return '—';
  if (diff < 0) return 'en un momento';

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'ahora mismo';
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  const days = Math.floor(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;

  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;

  const years = Math.floor(months / 12);
  return `hace ${years} ${years === 1 ? 'año' : 'años'}`;
};

/**
 * Traduce un user-agent a algo que un humano pueda leer de un vistazo:
 * "Windows · Chrome", "iPhone · Safari".
 *
 * Es deliberadamente aproximado. El user-agent sirve aquí para distinguir "entró
 * desde su computadora" de "entró desde el celular", no para hacer forense: no
 * vale la pena arrastrar una librería de parsing por una columna informativa.
 */
export const describeDevice = (userAgent: string | null | undefined): string => {
  if (!userAgent) return 'Desconocido';
  const ua = userAgent;

  const os =
    /Windows NT/i.test(ua) ? 'Windows' :
    /iPhone/i.test(ua) ? 'iPhone' :
    /iPad/i.test(ua) ? 'iPad' :
    /Android/i.test(ua) ? 'Android' :
    /Mac OS X/i.test(ua) ? 'Mac' :
    /Linux/i.test(ua) ? 'Linux' :
    null;

  // El orden importa: Edge y Opera también dicen "Chrome" en su user-agent, y
  // Chrome dice "Safari". Se prueba del más específico al más genérico.
  const browser =
    /Edg\//i.test(ua) ? 'Edge' :
    /OPR\/|Opera/i.test(ua) ? 'Opera' :
    /Firefox\//i.test(ua) ? 'Firefox' :
    /Chrome\//i.test(ua) ? 'Chrome' :
    /Safari\//i.test(ua) ? 'Safari' :
    null;

  if (os && browser) return `${os} · ${browser}`;
  return os ?? browser ?? 'Desconocido';
};

/** true si el user-agent parece un teléfono o tableta. */
export const isMobileDevice = (userAgent: string | null | undefined): boolean =>
  !!userAgent && /iPhone|iPad|Android|Mobile/i.test(userAgent);
