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
