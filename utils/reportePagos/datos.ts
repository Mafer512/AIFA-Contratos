/**
 * Datos del reporte de Pagos: un solo modelo que alimentan Excel, Word y PDF.
 *
 * Parte de lo mismo que pinta la pantalla (los renglones ya calculados del
 * Resumen de pagos) para que el reporte no pueda decir otra cosa. Además
 * vuelve a sacar cada mes de las columnas crudas de la fila con código
 * propio y compara: si algo no cuadra, el reporte lo dice en su sección de
 * control de calidad en vez de imprimir un número dudoso.
 *
 * Todo el dinero se suma en centavos enteros: así el total de una columna es
 * exactamente la suma de lo que se imprime renglón por renglón.
 */
import { parseFechaFlexible } from '../fichaServicio';

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'] as const;

/** Lo que ya calcula el tablero por cada renglón de Pagos. */
export interface PagoEntrada {
  key: string;
  service: string;
  contrato: string;
  paid: number;
  total: number;
  pctRaw: number;
  monthly: Array<{ month: string; value: number; deductiva: number }>;
  row: Record<string, any>;
}

export interface MesServicio {
  mes: string;
  /** Pago neto del mes, el mismo que enseña la tabla. */
  pago: number;
  preventivos: number;
  correctivos: number;
  notaCredito: number;
  /** El mes trae Preventivos/Correctivos/Nota capturados (si no, el importe va directo en el mes). */
  conDesglose: boolean;
  complemento: boolean | null;
  observacion: string;
}

export interface ServicioReporte {
  id: string;
  contrato: string;
  servicio: string;
  proveedor: string;
  tipoContrato: string;
  inicio: Date | null;
  termino: Date | null;
  montoMaximo: number;
  pagado: number;
  /** Monto máximo − pagado, sin bajar de cero (como en pantalla). */
  saldo: number;
  /** Avance sin tope; puede pasar de 100 si se pagó de más. */
  avance: number;
  meses: MesServicio[];
  observaciones: string;
}

export interface TotalMes {
  mes: string;
  pago: number;
  preventivos: number;
  correctivos: number;
  notaCredito: number;
  /** Pagos de meses sin desglose (el importe va directo en la columna del mes). */
  sinDesglose: number;
  acumulado: number;
  serviciosConPago: number;
}

export interface Validacion {
  concepto: string;
  ok: boolean;
  detalle: string;
}

export interface RangoAvance {
  etiqueta: string;
  servicios: number;
  monto: number;
  pagado: number;
}

export interface ReportePagos {
  anio: number;
  generado: Date;
  usuario: string;
  /** En el orden de la tabla (por ID). */
  servicios: ServicioReporte[];
  /** En el orden del Resumen de pagos (más pagado primero). */
  serviciosPorPagado: ServicioReporte[];
  porMes: TotalMes[];
  rangos: RangoAvance[];
  totales: {
    servicios: number;
    montoMaximo: number;
    pagado: number;
    saldo: number;
    avance: number;
    preventivos: number;
    correctivos: number;
    notasCredito: number;
    liquidados: number;
    sinPagos: number;
    sinMontoMaximo: number;
  };
  validaciones: Validacion[];
}

// ── Utilidades de dinero y texto ───────────────────────────────────────────

const aCentavos = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100);
const dePesos = (c: number) => c / 100;
export const redondear = (n: number) => dePesos(aCentavos(n));
export const sumar = (valores: number[]) => dePesos(valores.reduce((acc, v) => acc + aCentavos(v), 0));

const leerNumero = (v: unknown): { valor: number; legible: boolean } => {
  if (v === null || v === undefined || v === '') return { valor: 0, legible: true };
  if (typeof v === 'number') return Number.isFinite(v) ? { valor: v, legible: true } : { valor: 0, legible: false };
  const limpio = String(v).replace(/[$,\s]/g, '');
  if (!limpio) return { valor: 0, legible: true };
  const n = Number(limpio);
  return Number.isFinite(n) ? { valor: n, legible: true } : { valor: 0, legible: false };
};

const normalizar = (s: string) => s
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

const texto = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();

const formatoMoneda = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatoNumero = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** $1,234.56 */
export const dinero = (n: number) => formatoMoneda.format(redondear(n));
/** 1,234.56 (para columnas donde el encabezado ya dice que es en pesos) */
export const importe = (n: number) => formatoNumero.format(redondear(n));
/** $35.5 M / $820 mil, para etiquetas de gráficas */
export const dineroCompacto = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(n / 1e6).toLocaleString('es-MX', { maximumFractionDigits: a >= 1e8 ? 0 : 1 })} M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3).toLocaleString('es-MX')} mil`;
  return `$${Math.round(n).toLocaleString('es-MX')}`;
};
export const porcentaje = (n: number, decimales = 1) => `${(Number.isFinite(n) ? n : 0).toFixed(decimales)}%`;
export const fechaCorta = (d: Date | null) => d
  ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  : '';
export const fechaLarga = (d: Date) => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
export const fechaHora = (d: Date) =>
  `${fechaLarga(d)}, ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })} h`;

// ── Columnas de la fila cruda ──────────────────────────────────────────────

const FRAGMENTOS_MES: string[][] = [
  ['ene.', 'enero'], ['feb.', 'febrero'], ['mar.', 'marzo'], ['abr.', 'abril'],
  ['may.', 'mayo'], ['jun.', 'junio'], ['jul.', 'julio'], ['ago.', 'agosto'],
  ['sept.', 'sep.', 'septiembre'], ['oct.', 'octubre'], ['nov.', 'noviembre'], ['dic.', 'diciembre'],
];
const COLUMNA_MES = ['Ene.', 'Feb.', 'Mar.', 'Abr.', 'May.', 'Jun.', 'Jul.', 'Ago.', 'Sept.', 'Oct.', 'Nov.', 'Dic.'];

interface ColumnasMes { total: string | null; prev: string | null; corr: string | null; nota: string | null; complemento: string | null; observacion: string | null }

const resolverColumnas = (columnas: string[]): { meses: ColumnasMes[]; proveedor: string | null; tipo: string | null; inicio: string | null; termino: string | null; observaciones: string | null } => {
  const meses = FRAGMENTOS_MES.map((frags, i) => {
    const delMes = columnas.filter((c) => frags.some((f) => c.toLowerCase().includes(f)));
    const con = (...partes: string[]) => delMes.find((c) => partes.some((p) => normalizar(c).includes(p))) ?? null;
    return {
      total: columnas.find((c) => c === COLUMNA_MES[i] || (i === 8 && c === 'Sep.')) ?? null,
      prev: con('preventivo'),
      corr: con('correctivo'),
      nota: con('nota', 'credito'),
      complemento: con('complemento'),
      observacion: con('observacion'),
    };
  });
  const buscar = (...partes: string[]) => columnas.find((c) => partes.every((p) => normalizar(c).includes(p))) ?? null;
  return {
    meses,
    proveedor: buscar('proveedor'),
    tipo: buscar('tipo', 'contrato'),
    inicio: buscar('fecha', 'inicio'),
    termino: buscar('fecha', 'termino'),
    observaciones: columnas.find((c) => normalizar(c) === 'observaciones') ?? null,
  };
};

const leerBooleano = (v: unknown): boolean | null => {
  if (v === true || v === false) return v;
  const t = normalizar(String(v ?? ''));
  if (!t) return null;
  if (['si', 'sí', 'true', '1', 'x'].includes(t)) return true;
  if (['no', 'false', '0'].includes(t)) return false;
  return null;
};

// ── Construcción ───────────────────────────────────────────────────────────

export const RANGOS_AVANCE: Array<{ etiqueta: string; cabe: (a: number, pagado: number) => boolean }> = [
  { etiqueta: 'Sin pagos', cabe: (_a, p) => p <= 0 },
  { etiqueta: 'Hasta 25%', cabe: (a, p) => p > 0 && a <= 25 },
  { etiqueta: '25% a 50%', cabe: (a) => a > 25 && a <= 50 },
  { etiqueta: '50% a 75%', cabe: (a) => a > 50 && a <= 75 },
  { etiqueta: '75% a 99.9%', cabe: (a) => a > 75 && a < 99.95 },
  { etiqueta: '100% pagado', cabe: (a) => a >= 99.95 },
];

export const construirReportePagos = (
  entrada: PagoEntrada[],
  opciones: { anio: number; usuario: string; generado?: Date },
): ReportePagos => {
  const columnas = Array.from(new Set(entrada.flatMap((p) => Object.keys(p.row ?? {}))));
  const col = resolverColumnas(columnas);

  const diferenciasMes: string[] = [];
  const capturasIlegibles: string[] = [];
  const diferenciasTotal: string[] = [];

  const servicios: ServicioReporte[] = entrada.map((p) => {
    const row = p.row ?? {};
    const id = texto(row.id ?? row.ID ?? p.key);
    const etiqueta = p.contrato || `ID ${id}`;

    const meses: MesServicio[] = MESES.map((mes, i) => {
      const c = col.meses[i];
      const leer = (columna: string | null) => {
        if (!columna) return 0;
        const { valor, legible } = leerNumero(row[columna]);
        if (!legible) capturasIlegibles.push(`${etiqueta} · ${columna}: "${texto(row[columna])}"`);
        return valor;
      };
      const preventivos = redondear(leer(c.prev));
      const correctivos = redondear(leer(c.corr));
      const notaCredito = redondear(leer(c.nota));
      const capturado = redondear(leer(c.total));
      const conDesglose = preventivos !== 0 || correctivos !== 0 || notaCredito !== 0;
      // Misma regla que la tabla: el desglose manda; sin desglose, el importe del mes.
      const propio = Math.max(0, conDesglose ? sumar([preventivos, correctivos, -notaCredito]) : capturado);

      const enPantalla = redondear(p.monthly?.[i]?.value ?? 0);
      if (Math.abs(enPantalla - propio) >= 0.01) {
        diferenciasMes.push(`${etiqueta} · ${mes}: tablero ${dinero(enPantalla)}, recalculado ${dinero(propio)}`);
      }
      // Si el mes trae un importe capturado distinto de su desglose, también se avisa.
      if (conDesglose && capturado !== 0 && Math.abs(capturado - propio) >= 0.01) {
        diferenciasMes.push(`${etiqueta} · ${mes}: importe capturado ${dinero(capturado)} distinto del desglose ${dinero(propio)}`);
      }

      return {
        mes,
        pago: enPantalla,
        preventivos,
        correctivos,
        notaCredito,
        conDesglose,
        complemento: c.complemento ? leerBooleano(row[c.complemento]) : null,
        observacion: c.observacion ? texto(row[c.observacion]) : '',
      };
    });

    const pagado = sumar(meses.map((m) => m.pago));
    if (Math.abs(pagado - redondear(p.paid)) >= 0.01) {
      diferenciasTotal.push(`${etiqueta}: tablero ${dinero(p.paid)}, suma de meses ${dinero(pagado)}`);
    }
    const montoMaximo = redondear(p.total);

    return {
      id,
      contrato: texto(p.contrato),
      servicio: texto(p.service),
      proveedor: col.proveedor ? texto(row[col.proveedor]) : '',
      tipoContrato: col.tipo ? texto(row[col.tipo]) : '',
      inicio: col.inicio ? parseFechaFlexible(row[col.inicio]) : null,
      termino: col.termino ? parseFechaFlexible(row[col.termino]) : null,
      montoMaximo,
      pagado,
      saldo: Math.max(0, sumar([montoMaximo, -pagado])),
      avance: montoMaximo > 0 ? (pagado / montoMaximo) * 100 : 0,
      meses,
      observaciones: col.observaciones ? texto(row[col.observaciones]) : '',
    };
  });

  const porId = [...servicios].sort((a, b) => {
    const na = Number(a.id); const nb = Number(b.id);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.id.localeCompare(b.id, 'es', { numeric: true });
  });
  const porPagado = [...servicios].sort((a, b) => b.pagado - a.pagado);

  let acumulado = 0;
  const porMes: TotalMes[] = MESES.map((mes, i) => {
    const pago = sumar(servicios.map((s) => s.meses[i].pago));
    acumulado = sumar([acumulado, pago]);
    return {
      mes,
      pago,
      preventivos: sumar(servicios.map((s) => s.meses[i].preventivos)),
      correctivos: sumar(servicios.map((s) => s.meses[i].correctivos)),
      notaCredito: sumar(servicios.map((s) => s.meses[i].notaCredito)),
      sinDesglose: sumar(servicios.map((s) => (s.meses[i].conDesglose ? 0 : s.meses[i].pago))),
      acumulado,
      serviciosConPago: servicios.filter((s) => s.meses[i].pago > 0).length,
    };
  });

  const composicionDescuadrada = porMes
    .filter((m) => Math.abs(sumar([m.preventivos, m.correctivos, -m.notaCredito, m.sinDesglose]) - m.pago) >= 0.01)
    .map((m) => m.mes);

  const montoMaximo = sumar(servicios.map((s) => s.montoMaximo));
  const pagado = sumar(servicios.map((s) => s.pagado));
  const pagadoPorMes = sumar(porMes.map((m) => m.pago));
  const saldoPorServicio = sumar(servicios.map((s) => s.saldo));
  const saldo = sumar([montoMaximo, -pagado]);
  const conMaximo = servicios.filter((s) => s.montoMaximo > 0);
  const sobregiro = conMaximo.filter((s) => s.pagado - s.montoMaximo >= 0.01);
  const sinMaximo = servicios.filter((s) => s.montoMaximo <= 0);
  const pagadoTablero = sumar(entrada.map((p) => p.paid));

  const rangos = RANGOS_AVANCE.map((r) => {
    const dentro = conMaximo.filter((s) => r.cabe(s.avance, s.pagado));
    return {
      etiqueta: r.etiqueta,
      servicios: dentro.length,
      monto: sumar(dentro.map((s) => s.montoMaximo)),
      pagado: sumar(dentro.map((s) => s.pagado)),
    };
  });
  const enRangos = rangos.reduce((n, r) => n + r.servicios, 0);

  const lista = (items: string[], max = 4) =>
    items.slice(0, max).join('; ') + (items.length > max ? `; y ${items.length - max} más` : '');

  const validaciones: Validacion[] = [
    {
      concepto: 'Registros incluidos',
      ok: servicios.length === entrada.length && servicios.length > 0,
      detalle: `${servicios.length} contratos de ${entrada.length} registrados en la tabla de Pagos ${opciones.anio}.`,
    },
    {
      concepto: 'Pagos mensuales recalculados desde la base',
      ok: diferenciasMes.length === 0,
      detalle: diferenciasMes.length === 0
        ? `Los ${servicios.length * 12} importes mensuales coinciden con Preventivos + Correctivos − Nota de crédito (o con el importe del mes cuando no hay desglose).`
        : `${diferenciasMes.length} diferencia(s): ${lista(diferenciasMes)}.`,
    },
    {
      concepto: 'Composición de los totales por mes',
      ok: composicionDescuadrada.length === 0,
      detalle: composicionDescuadrada.length === 0
        ? 'En cada mes, Preventivos + Correctivos − Notas de crédito + Importe sin desglose = Pago del mes.'
        : `No cuadra en ${lista(composicionDescuadrada, 12)} (hay notas de crédito mayores que lo facturado en el mes; ese mes se toma como $0.00).`,
    },
    {
      concepto: 'Total pagado por contrato',
      ok: diferenciasTotal.length === 0,
      detalle: diferenciasTotal.length === 0
        ? 'En cada contrato, la suma de sus 12 meses es igual al total pagado que muestra el tablero.'
        : `${diferenciasTotal.length} diferencia(s): ${lista(diferenciasTotal)}.`,
    },
    {
      concepto: 'Cuadre del total pagado',
      ok: Math.abs(pagado - pagadoPorMes) < 0.01 && Math.abs(pagado - redondear(pagadoTablero)) < 0.01,
      detalle: `Suma por contrato ${dinero(pagado)} · suma por mes ${dinero(pagadoPorMes)} · tablero ${dinero(pagadoTablero)}.`,
    },
    {
      concepto: 'Saldo restante',
      ok: Math.abs(saldo - saldoPorServicio) < 0.01,
      detalle: Math.abs(saldo - saldoPorServicio) < 0.01
        ? `Monto máximo ${dinero(montoMaximo)} − total pagado ${dinero(pagado)} = ${dinero(saldo)}, igual a la suma de saldos por contrato.`
        : `Monto máximo − pagado = ${dinero(saldo)}; la suma de saldos por contrato es ${dinero(saldoPorServicio)} porque hay pagos por encima del monto máximo.`,
    },
    {
      concepto: 'Pagos por encima del monto máximo',
      ok: sobregiro.length === 0,
      detalle: sobregiro.length === 0
        ? 'Ningún contrato rebasa su monto máximo.'
        : lista(sobregiro.map((s) => `${s.contrato || `ID ${s.id}`} (${porcentaje(s.avance)})`), 6) + '.',
    },
    {
      concepto: 'Contratos sin monto máximo',
      ok: sinMaximo.length === 0,
      detalle: sinMaximo.length === 0
        ? 'Todos los contratos tienen monto máximo capturado.'
        : `${sinMaximo.length}: ${lista(sinMaximo.map((s) => s.contrato || `ID ${s.id}`), 6)}. No entran en el avance.`,
    },
    {
      concepto: 'Capturas no numéricas',
      ok: capturasIlegibles.length === 0,
      detalle: capturasIlegibles.length === 0
        ? 'Todas las celdas de importes contienen números.'
        : `${capturasIlegibles.length} celda(s) se tomaron como $0.00: ${lista(capturasIlegibles)}.`,
    },
    {
      concepto: 'Clasificación por avance',
      ok: enRangos === conMaximo.length,
      detalle: `${enRangos} de ${conMaximo.length} contratos con monto máximo quedan en exactamente un rango.`,
    },
  ];

  return {
    anio: opciones.anio,
    generado: opciones.generado ?? new Date(),
    usuario: opciones.usuario,
    servicios: porId,
    serviciosPorPagado: porPagado,
    porMes,
    rangos,
    totales: {
      servicios: servicios.length,
      montoMaximo,
      pagado,
      saldo,
      avance: montoMaximo > 0 ? (pagado / montoMaximo) * 100 : 0,
      preventivos: sumar(porMes.map((m) => m.preventivos)),
      correctivos: sumar(porMes.map((m) => m.correctivos)),
      notasCredito: sumar(porMes.map((m) => m.notaCredito)),
      liquidados: conMaximo.filter((s) => s.avance >= 99.95).length,
      sinPagos: servicios.filter((s) => s.pagado <= 0).length,
      sinMontoMaximo: sinMaximo.length,
    },
    validaciones,
  };
};

/** Último mes con algún pago: hasta ahí llegan las gráficas de evolución. */
export const ultimoMesConPago = (r: ReportePagos) => {
  for (let i = r.porMes.length - 1; i >= 0; i--) if (r.porMes[i].pago > 0) return i;
  return -1;
};

/** Observaciones capturadas (generales y por mes), para la sección de notas. */
export const observacionesRegistradas = (r: ReportePagos) => r.servicios.flatMap((s) => [
  ...(s.observaciones ? [{ servicio: s, mes: 'General', texto: s.observaciones }] : []),
  ...s.meses.filter((m) => m.observacion).map((m) => ({ servicio: s, mes: m.mes, texto: m.observacion })),
]);

export const NOTAS_METODOLOGICAS = [
  'Pago del mes = Preventivos + Correctivos − Nota de crédito. Cuando el mes no tiene desglose capturado se toma el importe registrado en el mes.',
  'Total pagado = suma de los pagos de enero a diciembre.',
  'Saldo restante = Monto máximo − Total pagado (cero cuando el contrato ya se pagó por completo).',
  'Avance = Total pagado ÷ Monto máximo. Los contratos sin monto máximo no entran en el avance global.',
  'Importes en pesos mexicanos (MXN), redondeados al centavo; los totales se suman en centavos, por lo que coinciden con la suma de los renglones.',
];
