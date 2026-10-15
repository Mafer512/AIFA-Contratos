/**
 * Lo que comparten los tres formatos: títulos, textos, tablas y el orden de
 * las secciones. Word y PDF recorren las mismas secciones; Excel arma sus
 * hojas con los mismos títulos y fórmulas en lugar de texto.
 */
import {
  MESES, MESES_CORTOS, NOTAS_METODOLOGICAS, dinero, importe, porcentaje, fechaCorta, sumar,
  observacionesRegistradas, ultimoMesConPago, type ReportePagos, type ServicioReporte,
} from './datos';
import type { Grafica, GraficasReporte } from './graficas';

/** 'tabla' = reporte detallado de la Tabla de Pagos; 'resumen' = Resumen de pagos. */
export type TipoReporte = 'tabla' | 'resumen';
export type FormatoReporte = 'excel' | 'word' | 'pdf';

export interface Logo {
  dataUrl: string;
  png: Uint8Array;
}

export interface EntradaFormato {
  reporte: ReportePagos;
  graficas: GraficasReporte;
  tipo: TipoReporte;
  logo: Logo | null;
}

export const INSTITUCION = 'Aeropuerto Internacional Felipe Ángeles';
export const FUENTE_DATOS = 'Fuente: Sistema de Contratos AIFA, tabla de Pagos';

export const tituloReporte = (tipo: TipoReporte, anio: number) =>
  tipo === 'tabla' ? `Tabla de Pagos ${anio}` : `Resumen de pagos ${anio}`;

export const subtituloReporte = (tipo: TipoReporte) =>
  tipo === 'tabla' ? 'Reporte detallado de pagos por contrato' : 'Avance de pagos por servicio';

export const nombreArchivo = (tipo: TipoReporte, formato: FormatoReporte, r: ReportePagos) => {
  const d = r.generado;
  const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const base = tipo === 'tabla' ? `Tabla_de_Pagos_${r.anio}` : `Resumen_de_Pagos_${r.anio}`;
  const ext = formato === 'excel' ? 'xlsx' : formato === 'word' ? 'docx' : 'pdf';
  return `${base}_${fecha}.${ext}`;
};

export const SIN_VALOR = '–';

// ── Indicadores ────────────────────────────────────────────────────────────

export interface Indicador {
  etiqueta: string;
  valor: string;
  nota: string;
  /** El saldo va en ámbar, como en el tablero. */
  alerta?: boolean;
}

const ultimoMes = (r: ReportePagos) => {
  const i = ultimoMesConPago(r);
  return i >= 0 ? r.porMes[i].mes.toLowerCase() : 'la fecha';
};

/** Los mismos cuatro indicadores del tablero. */
export const indicadores = (r: ReportePagos): Indicador[] => {
  const t = r.totales;
  return [
    { etiqueta: 'Servicios', valor: String(t.servicios), nota: `${t.liquidados} pagados al 100% · ${t.sinPagos} sin pagos` },
    { etiqueta: 'Total pagado', valor: dinero(t.pagado), nota: `Pagos de enero a ${ultimoMes(r)}` },
    { etiqueta: 'Avance global', valor: porcentaje(t.avance), nota: `Meta total: ${dinero(t.montoMaximo)}` },
    { etiqueta: 'Saldo restante', valor: dinero(t.saldo), nota: `${porcentaje(t.montoMaximo > 0 ? 100 - t.avance : 0)} pendiente`, alerta: true },
  ];
};

export const leyendaCalidad = (r: ReportePagos) => {
  const malas = r.validaciones.filter((v) => !v.ok).length;
  return malas === 0
    ? `Se verificaron ${r.validaciones.length} controles y todas las cifras cuadran entre sí y con el tablero.`
    : `${malas} de ${r.validaciones.length} controles requieren revisión; el detalle está en la tabla.`;
};

// ── Tablas en texto (Word y PDF) ───────────────────────────────────────────

export type Alineacion = 'left' | 'center' | 'right';

export interface TablaTexto {
  titulo: string;
  descripcion?: string;
  encabezados: string[];
  /** Pesos relativos; cada formato los reparte en su ancho útil. */
  anchos: number[];
  alinear: Alineacion[];
  filas: string[][];
  total?: string[];
  /** Tamaño de letra del cuerpo, en puntos. */
  letra: number;
  /** Color de texto por celda (hex sin #), p. ej. saldo en ámbar o notas de crédito en rojo. */
  color?: (fila: number, col: number) => string | undefined;
  /** Columnas con números de contrato: se parten en "-" o "/", nunca a media clave. */
  codigos?: number[];
  /** Columna donde el PDF dibuja una barrita de avance (0–100). */
  barra?: { col: number; valores: number[] };
}

const D = (n: number) => (Math.abs(n) < 0.005 ? SIN_VALOR : dinero(n));
const I = (n: number) => (Math.abs(n) < 0.005 ? SIN_VALOR : importe(n));
const vigencia = (s: ServicioReporte) =>
  s.inicio || s.termino ? `${fechaCorta(s.inicio) || '¿?'} al ${fechaCorta(s.termino) || '¿?'}` : 'Sin fechas';
const avanceTexto = (s: ServicioReporte) => (s.montoMaximo > 0 ? porcentaje(s.avance) : 'Sin monto máx.');

export const COLOR_SALDO = 'B45309';
export const COLOR_NOTA = 'DC2626';
export const COLOR_OK = '047857';

const tablaContratos = (r: ReportePagos): TablaTexto => ({
  titulo: 'Contratos: datos generales y avance',
  descripcion: `${r.servicios.length} contratos registrados, en el orden de la tabla de Pagos.`,
  encabezados: ['ID', 'No. de contrato', 'Objeto del contrato', 'Proveedor', 'Tipo', 'Vigencia', 'Monto máximo', 'Total pagado', 'Saldo restante', 'Avance'],
  anchos: [3.2, 15.5, 28, 14.5, 6.5, 10, 10.5, 10.5, 10.5, 6.5],
  alinear: ['center', 'left', 'left', 'left', 'center', 'center', 'right', 'right', 'right', 'right'],
  filas: r.servicios.map((s) => [
    s.id, s.contrato || SIN_VALOR, s.servicio, s.proveedor || SIN_VALOR, s.tipoContrato || SIN_VALOR, vigencia(s),
    D(s.montoMaximo), D(s.pagado), s.montoMaximo > 0 ? D(s.saldo) : SIN_VALOR, avanceTexto(s),
  ]),
  total: ['', 'Total', `${r.servicios.length} contratos`, '', '', '',
    dinero(r.totales.montoMaximo), dinero(r.totales.pagado), dinero(sumar(r.servicios.map((s) => s.saldo))), porcentaje(r.totales.avance)],
  letra: 6.5,
  codigos: [1],
  color: (_f, c) => (c === 8 ? COLOR_SALDO : undefined),
});

const tablaMensual = (r: ReportePagos, porServicio: boolean): TablaTexto => {
  const lista = porServicio ? r.serviciosPorPagado : r.servicios;
  return {
    titulo: porServicio ? 'Pagos mensuales por servicio' : 'Pagos mensuales por contrato',
    descripcion: `Pago neto de cada mes en pesos (Preventivos + Correctivos − Nota de crédito).${porServicio ? ' Mismo orden que el resumen.' : ''}`,
    encabezados: [porServicio ? '#' : 'ID', porServicio ? 'Servicio' : 'No. de contrato', ...MESES_CORTOS, 'Total pagado'],
    // Pesos pensados en milímetros de la hoja carta horizontal: cada mes
    // cabe un importe de ocho cifras sin partirse.
    anchos: [5.5, 40, ...MESES_CORTOS.map(() => 16), 18.5],
    alinear: ['center', 'left', ...MESES_CORTOS.map(() => 'right' as const), 'right'],
    filas: lista.map((s, i) => [
      porServicio ? String(i + 1) : s.id,
      porServicio ? s.servicio : (s.contrato || SIN_VALOR),
      ...s.meses.map((m) => I(m.pago)),
      I(s.pagado),
    ]),
    total: ['', 'Total', ...r.porMes.map((m) => I(m.pago)), I(r.totales.pagado)],
    letra: 5.5,
    codigos: porServicio ? [] : [1],
  };
};

const tablaTotalesMes = (r: ReportePagos): TablaTexto => ({
  titulo: 'Totales por mes',
  descripcion: 'Composición del pago de cada mes y su avance acumulado contra el monto máximo total.',
  encabezados: ['Mes', 'Preventivos', 'Correctivos', 'Notas de crédito', 'Importe sin desglose', 'Pago del mes', 'Acumulado', '% acumulado', 'Contratos con pago'],
  anchos: [10, 13, 13, 12, 13, 13, 14, 8, 8],
  alinear: ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'center'],
  filas: r.porMes.map((m) => [
    m.mes, D(m.preventivos), D(m.correctivos), m.notaCredito ? `-${dinero(m.notaCredito)}` : SIN_VALOR, D(m.sinDesglose),
    D(m.pago), D(m.acumulado), r.totales.montoMaximo > 0 && m.pago > 0 ? porcentaje((m.acumulado / r.totales.montoMaximo) * 100) : SIN_VALOR,
    m.serviciosConPago ? String(m.serviciosConPago) : SIN_VALOR,
  ]),
  total: ['Total', dinero(r.totales.preventivos), dinero(r.totales.correctivos), `-${dinero(r.totales.notasCredito)}`,
    dinero(sumar(r.porMes.map((m) => m.sinDesglose))), dinero(r.totales.pagado), dinero(r.totales.pagado), porcentaje(r.totales.avance), ''],
  letra: 7,
  color: (_f, c) => (c === 3 ? COLOR_NOTA : undefined),
});

/** Renglones del desglose: un mes de un contrato con algo capturado. */
export const renglonesDesglose = (r: ReportePagos) => r.servicios.flatMap((s) =>
  s.meses
    .filter((m) => m.pago !== 0 || m.conDesglose || m.observacion || m.complemento !== null)
    .map((m) => ({ s, m })));

const siNo = (v: boolean | null) => (v === null ? SIN_VALOR : v ? 'Sí' : 'No');

const tablaDesglose = (r: ReportePagos): TablaTexto => {
  const renglones = renglonesDesglose(r);
  return {
    titulo: 'Desglose mensual por contrato',
    descripcion: `${renglones.length} meses con pagos o capturas. Cuando un mes no tiene desglose, el pago es el importe registrado en el mes.`,
    encabezados: ['ID', 'No. de contrato', 'Mes', 'Preventivos', 'Correctivos', 'Nota de crédito', 'Pago del mes', 'Origen', 'Complemento de pago', 'Observación del mes'],
    anchos: [3.5, 15, 7.5, 10.5, 10.5, 9.5, 10.5, 8, 7, 18],
    alinear: ['center', 'left', 'left', 'right', 'right', 'right', 'right', 'center', 'center', 'left'],
    filas: renglones.map(({ s, m }) => [
      s.id, s.contrato || SIN_VALOR, m.mes, D(m.preventivos), D(m.correctivos), m.notaCredito ? `-${dinero(m.notaCredito)}` : SIN_VALOR,
      D(m.pago), m.conDesglose ? 'Desglose' : 'Importe del mes', siNo(m.complemento), m.observacion || '',
    ]),
    total: ['', 'Total', '', dinero(r.totales.preventivos), dinero(r.totales.correctivos), `-${dinero(r.totales.notasCredito)}`, dinero(r.totales.pagado), '', '', ''],
    letra: 6.3,
    codigos: [1],
    color: (_f, c) => (c === 5 ? COLOR_NOTA : undefined),
  };
};

const tablaResumenServicios = (r: ReportePagos): TablaTexto => ({
  titulo: 'Resumen de pagos por servicio',
  descripcion: 'Ordenado de mayor a menor monto pagado, igual que en el tablero.',
  encabezados: ['#', 'Servicio', 'No. de contrato', 'Avance', 'Pagado', 'Saldo restante', 'Pendiente', 'Total (monto máximo)'],
  anchos: [3, 36, 17, 11, 11.5, 11.5, 6.5, 11.5],
  alinear: ['center', 'left', 'left', 'right', 'right', 'right', 'right', 'right'],
  filas: r.serviciosPorPagado.map((s, i) => [
    String(i + 1), s.servicio, s.contrato || SIN_VALOR, avanceTexto(s), dinero(s.pagado),
    s.montoMaximo > 0 ? dinero(s.saldo) : 'Sin monto máximo',
    s.montoMaximo > 0 ? porcentaje(Math.max(0, 100 - s.avance)) : SIN_VALOR, D(s.montoMaximo),
  ]),
  total: ['', `Total (${r.serviciosPorPagado.length} servicios)`, '', porcentaje(r.totales.avance), dinero(r.totales.pagado),
    dinero(sumar(r.servicios.map((s) => s.saldo))), porcentaje(r.totales.montoMaximo > 0 ? 100 - r.totales.avance : 0), dinero(r.totales.montoMaximo)],
  letra: 7,
  codigos: [2],
  color: (f, c) => {
    if (c !== 5) return undefined;
    const s = r.serviciosPorPagado[f];
    return s && s.montoMaximo > 0 && s.saldo <= 0 ? COLOR_OK : COLOR_SALDO;
  },
  barra: { col: 3, valores: r.serviciosPorPagado.map((s) => (s.montoMaximo > 0 ? s.avance : 0)) },
});

export const tablaRangos = (r: ReportePagos): TablaTexto => ({
  titulo: 'Contratos por rango de avance',
  encabezados: ['Rango de avance', 'Contratos', 'Monto máximo', 'Pagado'],
  anchos: [14, 8, 14, 14],
  alinear: ['left', 'center', 'right', 'right'],
  filas: r.rangos.map((x) => [x.etiqueta, String(x.servicios), D(x.monto), D(x.pagado)]),
  total: ['Total', String(r.rangos.reduce((n, x) => n + x.servicios, 0)), dinero(sumar(r.rangos.map((x) => x.monto))), dinero(sumar(r.rangos.map((x) => x.pagado)))],
  letra: 7.5,
});

const tablaObservaciones = (r: ReportePagos): TablaTexto | null => {
  const obs = observacionesRegistradas(r);
  if (!obs.length) return null;
  return {
    titulo: 'Observaciones registradas',
    descripcion: 'Notas capturadas en la tabla de Pagos, tal como están en el sistema.',
    encabezados: ['ID', 'No. de contrato', 'Mes', 'Observación'],
    anchos: [4, 18, 9, 69],
    alinear: ['center', 'left', 'left', 'left'],
    filas: obs.map((o) => [o.servicio.id, o.servicio.contrato || SIN_VALOR, o.mes, o.texto]),
    letra: 7,
    codigos: [1],
  };
};

export const tablaValidaciones = (r: ReportePagos): TablaTexto => ({
  titulo: 'Control de calidad de los datos',
  descripcion: leyendaCalidad(r),
  encabezados: ['Control', 'Resultado', 'Detalle'],
  anchos: [22, 10, 68],
  alinear: ['left', 'center', 'left'],
  filas: r.validaciones.map((v) => [v.concepto, v.ok ? 'Correcto' : 'Revisar', v.detalle]),
  letra: 7,
  color: (f, c) => (c === 1 ? (r.validaciones[f]?.ok ? COLOR_OK : COLOR_SALDO) : undefined),
});

// ── Secciones ──────────────────────────────────────────────────────────────

export interface GraficaConTitulo {
  titulo: string;
  nota: string;
  grafica: Grafica;
}

export type Seccion =
  | { tipo: 'indicadores' }
  | { tipo: 'graficas'; items: GraficaConTitulo[] }
  | { tipo: 'graficaYTabla'; item: GraficaConTitulo; tabla: TablaTexto }
  /** `nuevaPagina` fuerza salto; si no, la tabla sigue donde quepa. */
  | { tipo: 'tabla'; tabla: TablaTexto; nuevaPagina?: boolean }
  | { tipo: 'notas'; titulo: string; parrafos: string[] };

export const TITULOS_GRAFICAS = {
  mensual: (anio: number) => `Pagos por mes, ${anio}`,
  acumulado: 'Pago acumulado contra el monto máximo total',
  contratos: (n: number) => `Avance de los ${n} contratos de mayor monto máximo`,
  rangos: 'Contratos por rango de avance',
};

export const NOTAS_GRAFICAS = {
  mensual: 'Pago neto del mes de todos los contratos (Preventivos + Correctivos − Nota de crédito).',
  acumulado: 'Suma de los pagos desde enero; la línea punteada es la suma de los montos máximos.',
  contratos: 'La barra completa es el monto máximo del contrato; la parte oscura, lo pagado.',
  rangos: 'Número de contratos según su porcentaje pagado; debajo, la suma de sus montos máximos.',
};

export const graficasConTitulo = ({ reporte: r, graficas: g }: EntradaFormato) => ({
  mensual: { titulo: TITULOS_GRAFICAS.mensual(r.anio), nota: NOTAS_GRAFICAS.mensual, grafica: g.mensual },
  acumulado: { titulo: TITULOS_GRAFICAS.acumulado, nota: NOTAS_GRAFICAS.acumulado, grafica: g.acumulado },
  contratos: { titulo: TITULOS_GRAFICAS.contratos(g.nContratos), nota: NOTAS_GRAFICAS.contratos, grafica: g.contratos },
  rangos: { titulo: TITULOS_GRAFICAS.rangos, nota: NOTAS_GRAFICAS.rangos, grafica: g.rangos },
});

export const NOTAS = { titulo: 'Notas metodológicas', parrafos: NOTAS_METODOLOGICAS };

export const secciones = (e: EntradaFormato): Seccion[] => {
  const r = e.reporte;
  const g = graficasConTitulo(e);
  const calidad: Seccion[] = [
    { tipo: 'tabla', tabla: tablaValidaciones(r), nuevaPagina: true },
    { tipo: 'notas', ...NOTAS },
  ];

  if (e.tipo === 'tabla') {
    const obs = tablaObservaciones(r);
    return [
      { tipo: 'indicadores' },
      { tipo: 'graficas', items: [g.mensual, g.acumulado] },
      { tipo: 'tabla', tabla: tablaTotalesMes(r) },
      { tipo: 'tabla', tabla: tablaContratos(r) },
      { tipo: 'tabla', tabla: tablaMensual(r, false) },
      { tipo: 'tabla', tabla: tablaDesglose(r) },
      ...(obs ? [{ tipo: 'tabla' as const, tabla: obs }] : []),
      ...calidad,
    ];
  }
  return [
    { tipo: 'indicadores' },
    { tipo: 'graficas', items: [g.mensual, g.acumulado] },
    { tipo: 'graficas', items: [g.contratos] },
    { tipo: 'graficaYTabla', item: g.rangos, tabla: tablaRangos(r) },
    { tipo: 'tabla', tabla: tablaResumenServicios(r) },
    { tipo: 'tabla', tabla: tablaMensual(r, true) },
    ...calidad,
  ];
};

export { MESES };
