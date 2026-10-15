/**
 * Reporte de Pagos en Excel con ExcelJS.
 *
 * Los totales, saldos y avances son fórmulas (con su resultado ya guardado):
 * si alguien corrige una celda, el libro se recalcula solo y sigue cuadrando.
 * Los totales usan SUBTOTAL para que respeten los filtros.
 */
import ExcelJS from 'exceljs';
import { MESES, NOTAS_METODOLOGICAS, fechaHora, sumar, type ReportePagos } from './datos';
import type { Grafica } from './graficas';
import {
  INSTITUCION, FUENTE_DATOS, indicadores, graficasConTitulo, leyendaCalidad, renglonesDesglose,
  subtituloReporte, tituloReporte, type EntradaFormato, type GraficaConTitulo,
} from './comun';

type Hoja = ExcelJS.Worksheet;

const ARGB = (hex: string) => `FF${hex}`;
const C = {
  marca: '0F4C3A',
  serie: '1F6F54',
  tinta: '0F172A',
  texto: '334155',
  secundaria: '64748B',
  borde: 'E2E8F0',
  cebra: 'F8FAFC',
  pie: 'EAF3EE',
  saldo: 'B45309',
  nota: 'DC2626',
  ok: '047857',
  okFondo: 'D1FAE5',
  alertaFondo: 'FEF3C7',
};

const FMT = {
  dinero: '"$"#,##0.00;[Red]-"$"#,##0.00;"–"',
  porcentaje: '0.0%',
  fecha: 'dd/mm/yyyy',
  entero: '#,##0',
};

const PX_POR_PT = 96 / 72;
const FILA_ENCABEZADO = 5;

const fuente = (o: { tam?: number; negrita?: boolean; color?: string; cursiva?: boolean } = {}): Partial<ExcelJS.Font> => ({
  name: 'Arial', size: o.tam ?? 9, bold: o.negrita, italic: o.cursiva, color: { argb: ARGB(o.color ?? C.texto) },
});
const relleno = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB(hex) } });
const fina = (hex = C.borde): Partial<ExcelJS.Border> => ({ style: 'thin', color: { argb: ARGB(hex) } });

const letra = (n: number) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

/** Fecha sin hora (UTC), para que Excel no la mueva de día. */
const fechaExcel = (d: Date | null) => (d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) : null);

/** Alto de renglón para texto ajustado: Excel no lo calcula al abrir. */
const altoPara = (textos: Array<{ texto: string; ancho: number }>, tam = 9) => {
  const lineas = Math.max(1, ...textos.map(({ texto, ancho }) =>
    // Una unidad de ancho es un "0" de Calibri 11; en Arial 9 caben ~1.2 caracteres.
    String(texto ?? '').split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / Math.max(1, ancho * 1.2 - 2))), 0)));
  return Math.max(16, lineas * (tam + 2.6) + 4);
};

const configurarImpresion = (ws: Hoja, r: ReportePagos, titulo: string, filasTitulo?: string) => {
  ws.pageSetup = {
    paperSize: 1 as unknown as ExcelJS.PaperSize,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.65, bottom: 0.6, header: 0.3, footer: 0.3 },
    ...(filasTitulo ? { printTitlesRow: filasTitulo } : {}),
  };
  const e = (s: string) => s.replace(/&/g, '&&');
  ws.headerFooter = {
    oddHeader: `&L&"Arial,Bold"&8${e(INSTITUCION.toUpperCase())}&C&"Arial,Bold"&9${e(titulo)}&R&"Arial"&8Corte: ${e(fechaHora(r.generado))}`,
    oddFooter: `&L&"Arial"&7${e(`${FUENTE_DATOS} ${r.anio}. Generado por ${r.usuario}.`)}&R&"Arial"&8Página &P de &N`,
  };
};

const encabezadoHoja = (ws: Hoja, r: ReportePagos, titulo: string, subtitulo: string, columna = 1) => {
  const c1 = ws.getCell(1, columna);
  c1.value = INSTITUCION.toUpperCase();
  c1.font = fuente({ tam: 8, negrita: true, color: C.secundaria });
  const c2 = ws.getCell(2, columna);
  c2.value = titulo;
  c2.font = fuente({ tam: 16, negrita: true, color: C.marca });
  ws.getRow(2).height = 24;
  const c3 = ws.getCell(3, columna);
  c3.value = `${subtitulo} · Corte al ${fechaHora(r.generado)} · Importes en pesos (MXN)`;
  c3.font = fuente({ tam: 9, color: C.secundaria });
};

interface ColumnaHoja {
  titulo: string;
  ancho: number;
  formato?: string;
  alinear?: 'left' | 'center' | 'right';
  ajustar?: boolean;
}

/**
 * Tabla con encabezado verde, cebra, filtros y renglón de totales.
 * `filas` trae valores ya listos (números, fechas, textos o fórmulas).
 */
const escribirTabla = (
  ws: Hoja,
  columnas: ColumnaHoja[],
  filas: ExcelJS.CellValue[][],
  opciones: {
    filaInicio?: number;
    total?: (filaPrimera: number, filaUltima: number) => ExcelJS.CellValue[];
    color?: (fila: number, col: number) => string | undefined;
    filtros?: boolean;
  } = {},
) => {
  const f0 = opciones.filaInicio ?? FILA_ENCABEZADO;
  columnas.forEach((c, i) => { ws.getColumn(i + 1).width = c.ancho; });

  const enc = ws.getRow(f0);
  columnas.forEach((c, i) => {
    const cell = enc.getCell(i + 1);
    cell.value = c.titulo;
    cell.font = fuente({ tam: 9, negrita: true, color: 'FFFFFF' });
    cell.fill = relleno(C.marca);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = { bottom: fina(C.marca) };
  });
  enc.height = 30;

  filas.forEach((valores, n) => {
    const row = ws.getRow(f0 + 1 + n);
    valores.forEach((v, i) => {
      const c = columnas[i];
      const cell = row.getCell(i + 1);
      cell.value = v ?? null;
      cell.font = fuente({ color: opciones.color?.(n, i) });
      if (c.formato) cell.numFmt = c.formato;
      cell.alignment = { vertical: 'middle', horizontal: c.alinear ?? (c.formato ? 'right' : 'left'), wrapText: !!c.ajustar };
      cell.border = { bottom: fina() };
      if (n % 2) cell.fill = relleno(C.cebra);
    });
    row.height = altoPara(columnas.map((c, i) => ({ texto: c.ajustar ? String(valores[i] ?? '') : '', ancho: c.ancho })));
  });

  const fPrimera = f0 + 1;
  const fUltima = f0 + filas.length;
  if (opciones.total) {
    const row = ws.getRow(fUltima + 1);
    opciones.total(fPrimera, fUltima).forEach((v, i) => {
      const c = columnas[i];
      const cell = row.getCell(i + 1);
      cell.value = v ?? null;
      cell.font = fuente({ negrita: true, color: C.tinta });
      if (c.formato) cell.numFmt = c.formato;
      cell.alignment = { vertical: 'middle', horizontal: c.alinear ?? (c.formato ? 'right' : 'left') };
      cell.fill = relleno(C.pie);
      cell.border = { top: { style: 'medium', color: { argb: ARGB(C.marca) } }, bottom: fina() };
    });
    row.height = 20;
  }
  if (opciones.filtros !== false && filas.length) {
    ws.autoFilter = { from: { row: f0, column: 1 }, to: { row: fUltima, column: columnas.length } };
  }
  return { fPrimera, fUltima };
};

const subtotal = (col: number, a: number, b: number, resultado: number) =>
  ({ formula: `SUBTOTAL(109,${letra(col)}${a}:${letra(col)}${b})`, result: resultado });

// ── Hojas de datos ─────────────────────────────────────────────────────────

const HOJA_CONTRATOS = 'Contratos';
const HOJA_DESGLOSE = 'Desglose mensual';

const hojaContratos = (wb: ExcelJS.Workbook, r: ReportePagos, titulo: string) => {
  const ws = wb.addWorksheet(HOJA_CONTRATOS, {
    properties: { tabColor: { argb: ARGB(C.serie) } },
    views: [{ state: 'frozen', xSplit: 2, ySplit: FILA_ENCABEZADO, showGridLines: false }],
  });
  encabezadoHoja(ws, r, `${titulo} · Contratos`, `${r.servicios.length} contratos con sus pagos de enero a diciembre`);

  const cMax = 8; const cMes0 = 9; const cTotal = cMes0 + 12; const cSaldo = cTotal + 1; const cAvance = cSaldo + 1;
  const columnas: ColumnaHoja[] = [
    { titulo: 'ID', ancho: 6, alinear: 'center' },
    { titulo: 'No. de contrato', ancho: 26, ajustar: true },
    { titulo: 'Objeto del contrato', ancho: 52, ajustar: true },
    { titulo: 'Proveedor', ancho: 30, ajustar: true },
    { titulo: 'Tipo de contrato', ancho: 11, alinear: 'center' },
    { titulo: 'Fecha de inicio', ancho: 12, formato: FMT.fecha, alinear: 'center' },
    { titulo: 'Fecha de término', ancho: 12, formato: FMT.fecha, alinear: 'center' },
    { titulo: 'Monto máximo', ancho: 17, formato: FMT.dinero },
    ...MESES.map((m) => ({ titulo: m, ancho: 15, formato: FMT.dinero })),
    { titulo: 'Total pagado', ancho: 17, formato: FMT.dinero },
    { titulo: 'Saldo restante', ancho: 17, formato: FMT.dinero },
    { titulo: 'Avance', ancho: 10, formato: FMT.porcentaje },
    { titulo: 'Observaciones', ancho: 50, ajustar: true },
  ];
  const f = (n: number) => FILA_ENCABEZADO + 1 + n;
  const filas = r.servicios.map((s, n) => {
    const fila = f(n);
    return [
      Number.isFinite(Number(s.id)) ? Number(s.id) : s.id,
      s.contrato, s.servicio, s.proveedor, s.tipoContrato,
      fechaExcel(s.inicio), fechaExcel(s.termino),
      s.montoMaximo,
      ...s.meses.map((m) => m.pago),
      { formula: `SUM(${letra(cMes0)}${fila}:${letra(cMes0 + 11)}${fila})`, result: s.pagado },
      { formula: `MAX(0,${letra(cMax)}${fila}-${letra(cTotal)}${fila})`, result: s.saldo },
      { formula: `IF(${letra(cMax)}${fila}>0,${letra(cTotal)}${fila}/${letra(cMax)}${fila},"")`, result: s.montoMaximo > 0 ? s.pagado / s.montoMaximo : '' },
      s.observaciones,
    ] as ExcelJS.CellValue[];
  });
  const { fUltima } = escribirTabla(ws, columnas, filas, {
    total: (a, b) => [
      null, 'Total', `${r.servicios.length} contratos`, null, null, null, null,
      subtotal(cMax, a, b, r.totales.montoMaximo),
      ...r.porMes.map((m, i) => subtotal(cMes0 + i, a, b, m.pago)),
      subtotal(cTotal, a, b, r.totales.pagado),
      subtotal(cSaldo, a, b, sumar(r.servicios.map((s) => s.saldo))),
      { formula: `IF(${letra(cMax)}${b + 1}>0,${letra(cTotal)}${b + 1}/${letra(cMax)}${b + 1},"")`, result: r.totales.avance / 100 },
      null,
    ],
    color: (_n, c) => (c === cSaldo - 1 ? C.saldo : undefined),
  });
  barrasDeAvance(ws, `${letra(cAvance)}${FILA_ENCABEZADO + 1}:${letra(cAvance)}${fUltima}`);
  configurarImpresion(ws, r, `${titulo} · Contratos`, `${FILA_ENCABEZADO}:${FILA_ENCABEZADO}`);
  return { ws, cMax, cMes0, cTotal, fPrimera: FILA_ENCABEZADO + 1, fUltima };
};

const hojaDesglose = (wb: ExcelJS.Workbook, r: ReportePagos, titulo: string) => {
  const ws = wb.addWorksheet(HOJA_DESGLOSE, {
    properties: { tabColor: { argb: ARGB('3A8466') } },
    views: [{ state: 'frozen', xSplit: 3, ySplit: FILA_ENCABEZADO, showGridLines: false }],
  });
  const renglones = renglonesDesglose(r);
  encabezadoHoja(ws, r, `${titulo} · Desglose mensual`, `${renglones.length} meses con pagos o capturas; Pago del mes = Preventivos + Correctivos − Nota de crédito`);
  const columnas: ColumnaHoja[] = [
    { titulo: 'ID', ancho: 6, alinear: 'center' },
    { titulo: 'No. de contrato', ancho: 26, ajustar: true },
    { titulo: 'Mes', ancho: 12 },
    { titulo: 'Servicio', ancho: 48, ajustar: true },
    { titulo: 'Preventivos', ancho: 16, formato: FMT.dinero },
    { titulo: 'Correctivos', ancho: 16, formato: FMT.dinero },
    { titulo: 'Nota de crédito (se resta)', ancho: 16, formato: FMT.dinero },
    { titulo: 'Pago del mes', ancho: 16, formato: FMT.dinero },
    { titulo: 'Origen del pago', ancho: 15, alinear: 'center' },
    { titulo: 'Complemento de pago', ancho: 13, alinear: 'center' },
    { titulo: 'Observación del mes', ancho: 50, ajustar: true },
  ];
  const filas = renglones.map(({ s, m }) => [
    Number.isFinite(Number(s.id)) ? Number(s.id) : s.id,
    s.contrato, m.mes, s.servicio,
    m.preventivos || null, m.correctivos || null, m.notaCredito || null, m.pago,
    m.conDesglose ? 'Desglose' : 'Importe del mes',
    m.complemento === null ? '' : m.complemento ? 'Sí' : 'No',
    m.observacion,
  ] as ExcelJS.CellValue[]);
  const { fPrimera, fUltima } = escribirTabla(ws, columnas, filas, {
    total: (a, b) => [null, 'Total', null, null,
      subtotal(5, a, b, r.totales.preventivos), subtotal(6, a, b, r.totales.correctivos),
      subtotal(7, a, b, r.totales.notasCredito), subtotal(8, a, b, r.totales.pagado), null, null, null],
    color: (_n, c) => (c === 6 ? C.nota : undefined),
  });
  configurarImpresion(ws, r, `${titulo} · Desglose mensual`, `${FILA_ENCABEZADO}:${FILA_ENCABEZADO}`);
  return { ws, fPrimera, fUltima };
};

const hojaPorServicio = (wb: ExcelJS.Workbook, r: ReportePagos, titulo: string) => {
  const ws = wb.addWorksheet('Por servicio', {
    properties: { tabColor: { argb: ARGB(C.serie) } },
    views: [{ state: 'frozen', xSplit: 2, ySplit: FILA_ENCABEZADO, showGridLines: false }],
  });
  encabezadoHoja(ws, r, `${titulo} · Por servicio`, 'Ordenado de mayor a menor monto pagado, igual que en el tablero');
  const columnas: ColumnaHoja[] = [
    { titulo: '#', ancho: 5, alinear: 'center' },
    { titulo: 'Servicio', ancho: 60, ajustar: true },
    { titulo: 'No. de contrato', ancho: 26, ajustar: true },
    { titulo: 'Proveedor', ancho: 30, ajustar: true },
    { titulo: 'Total (monto máximo)', ancho: 18, formato: FMT.dinero },
    { titulo: 'Pagado', ancho: 18, formato: FMT.dinero },
    { titulo: 'Saldo restante', ancho: 18, formato: FMT.dinero },
    { titulo: 'Avance', ancho: 12, formato: FMT.porcentaje },
    { titulo: 'Pendiente', ancho: 11, formato: FMT.porcentaje },
  ];
  const filas = r.serviciosPorPagado.map((s, n) => {
    const f = FILA_ENCABEZADO + 1 + n;
    const conMax = s.montoMaximo > 0;
    return [
      n + 1, s.servicio, s.contrato, s.proveedor, s.montoMaximo, s.pagado,
      { formula: `IF(E${f}>0,MAX(0,E${f}-F${f}),"")`, result: conMax ? s.saldo : '' },
      { formula: `IF(E${f}>0,F${f}/E${f},"")`, result: conMax ? s.pagado / s.montoMaximo : '' },
      { formula: `IF(E${f}>0,MAX(0,1-F${f}/E${f}),"")`, result: conMax ? Math.max(0, 1 - s.pagado / s.montoMaximo) : '' },
    ] as ExcelJS.CellValue[];
  });
  const { fUltima } = escribirTabla(ws, columnas, filas, {
    total: (a, b) => [null, `Total (${r.serviciosPorPagado.length} servicios)`, null, null,
      subtotal(5, a, b, r.totales.montoMaximo), subtotal(6, a, b, r.totales.pagado),
      subtotal(7, a, b, sumar(r.servicios.map((s) => s.saldo))),
      { formula: `IF(E${b + 1}>0,F${b + 1}/E${b + 1},"")`, result: r.totales.avance / 100 },
      { formula: `IF(E${b + 1}>0,MAX(0,1-F${b + 1}/E${b + 1}),"")`, result: Math.max(0, 1 - r.totales.avance / 100) }],
    color: (n, c) => {
      if (c !== 6) return undefined;
      const s = r.serviciosPorPagado[n];
      return s.montoMaximo > 0 && s.saldo <= 0 ? C.ok : C.saldo;
    },
  });
  barrasDeAvance(ws, `H${FILA_ENCABEZADO + 1}:H${fUltima}`);
  configurarImpresion(ws, r, `${titulo} · Por servicio`, `${FILA_ENCABEZADO}:${FILA_ENCABEZADO}`);
  return ws;
};

const hojaMensualPorServicio = (wb: ExcelJS.Workbook, r: ReportePagos, titulo: string) => {
  const ws = wb.addWorksheet('Mensual por servicio', {
    properties: { tabColor: { argb: ARGB('3A8466') } },
    views: [{ state: 'frozen', xSplit: 3, ySplit: FILA_ENCABEZADO, showGridLines: false }],
  });
  encabezadoHoja(ws, r, `${titulo} · Pagos mensuales por servicio`, 'Pago neto de cada mes (Preventivos + Correctivos − Nota de crédito)');
  const columnas: ColumnaHoja[] = [
    { titulo: '#', ancho: 5, alinear: 'center' },
    { titulo: 'Servicio', ancho: 52, ajustar: true },
    { titulo: 'No. de contrato', ancho: 24, ajustar: true },
    ...MESES.map((m) => ({ titulo: m, ancho: 15, formato: FMT.dinero })),
    { titulo: 'Total pagado', ancho: 17, formato: FMT.dinero },
  ];
  const filas = r.serviciosPorPagado.map((s, n) => {
    const f = FILA_ENCABEZADO + 1 + n;
    return [n + 1, s.servicio, s.contrato, ...s.meses.map((m) => m.pago),
      { formula: `SUM(D${f}:O${f})`, result: s.pagado }] as ExcelJS.CellValue[];
  });
  escribirTabla(ws, columnas, filas, {
    total: (a, b) => [null, 'Total', null, ...r.porMes.map((m, i) => subtotal(4 + i, a, b, m.pago)), subtotal(16, a, b, r.totales.pagado)],
  });
  configurarImpresion(ws, r, `${titulo} · Pagos mensuales por servicio`, `${FILA_ENCABEZADO}:${FILA_ENCABEZADO}`);
  return ws;
};

const hojaCalidad = (wb: ExcelJS.Workbook, r: ReportePagos, titulo: string) => {
  const ws = wb.addWorksheet('Calidad de datos', {
    properties: { tabColor: { argb: ARGB(r.validaciones.every((v) => v.ok) ? C.ok : C.saldo) } },
    views: [{ showGridLines: false }],
  });
  encabezadoHoja(ws, r, `${titulo} · Control de calidad de los datos`, leyendaCalidad(r));
  const columnas: ColumnaHoja[] = [
    { titulo: 'Control', ancho: 36, ajustar: true },
    { titulo: 'Resultado', ancho: 13, alinear: 'center' },
    { titulo: 'Detalle', ancho: 110, ajustar: true },
  ];
  const { fUltima } = escribirTabla(ws, columnas, r.validaciones.map((v) => [v.concepto, v.ok ? 'Correcto' : 'Revisar', v.detalle]), {
    filtros: false,
  });
  r.validaciones.forEach((v, n) => {
    const cell = ws.getCell(FILA_ENCABEZADO + 1 + n, 2);
    cell.fill = relleno(v.ok ? C.okFondo : C.alertaFondo);
    cell.font = fuente({ negrita: true, color: v.ok ? C.ok : C.saldo });
  });
  let f = fUltima + 3;
  ws.getCell(f, 1).value = 'Notas metodológicas';
  ws.getCell(f, 1).font = fuente({ tam: 11, negrita: true, color: C.marca });
  NOTAS_METODOLOGICAS.forEach((n) => {
    f += 1;
    ws.mergeCells(f, 1, f, 3);
    const cell = ws.getCell(f, 1);
    cell.value = `•  ${n}`;
    cell.font = fuente();
    cell.alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(f).height = altoPara([{ texto: n, ancho: 150 }]);
  });
  configurarImpresion(ws, r, `${titulo} · Calidad de datos`);
  return ws;
};

// ── Hoja de resumen ────────────────────────────────────────────────────────

const caja = (ws: Hoja, f1: number, c1: number, f2: number, c2: number) => {
  for (let f = f1; f <= f2; f++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(f, c);
      cell.border = {
        top: f === f1 ? fina('CBD5E1') : undefined,
        bottom: f === f2 ? fina('CBD5E1') : undefined,
        left: c === c1 ? fina('CBD5E1') : undefined,
        right: c === c2 ? fina('CBD5E1') : undefined,
      };
    }
  }
};

const ANCHO_COL_RESUMEN = 16;
/** Ancho aproximado en píxeles de una columna de Excel con ese ancho en caracteres. */
const pxColumna = (ancho: number) => Math.round(ancho * 7 + 5);

const ponerImagen = (wb: ExcelJS.Workbook, ws: Hoja, g: Grafica, fila: number, col: number, anchoPx: number) => {
  const id = wb.addImage({ base64: g.dataUrl, extension: 'png' });
  const altoPx = Math.round((anchoPx * g.alto) / g.ancho);
  ws.addImage(id, { tl: { col: col - 1 + 0.05, row: fila - 1 }, ext: { width: anchoPx, height: altoPx }, editAs: 'oneCell' });
  return Math.ceil(altoPx / 20) + 1;
};

const bloqueGrafica = (wb: ExcelJS.Workbook, ws: Hoja, g: GraficaConTitulo, fila: number, col: number, anchoPx: number) => {
  ws.getCell(fila, col).value = g.titulo;
  ws.getCell(fila, col).font = fuente({ tam: 10, negrita: true, color: C.tinta });
  ws.getCell(fila + 1, col).value = g.nota;
  ws.getCell(fila + 1, col).font = fuente({ tam: 8, color: C.secundaria });
  return 2 + ponerImagen(wb, ws, g.grafica, fila + 2, col, anchoPx);
};

const tituloEnHoja = (ws: Hoja, fila: number, col: number, titulo: string, descripcion?: string) => {
  ws.getCell(fila, col).value = titulo;
  ws.getCell(fila, col).font = fuente({ tam: 11, negrita: true, color: C.marca });
  if (descripcion) {
    ws.getCell(fila + 1, col).value = descripcion;
    ws.getCell(fila + 1, col).font = fuente({ tam: 8, color: C.secundaria });
  }
  return fila + (descripcion ? 2 : 1);
};

/** Una tablita dentro de la hoja de resumen, a partir de la columna `col`. */
const tablaEnResumen = (
  ws: Hoja,
  fila: number,
  col: number,
  encabezados: string[],
  formatos: Array<string | undefined>,
  filas: ExcelJS.CellValue[][],
  total: ExcelJS.CellValue[] | null,
  color?: (n: number, i: number) => string | undefined,
) => {
  encabezados.forEach((h, i) => {
    const cell = ws.getCell(fila, col + i);
    cell.value = h;
    cell.font = fuente({ tam: 8.5, negrita: true, color: 'FFFFFF' });
    cell.fill = relleno(C.marca);
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  ws.getRow(fila).height = 28;
  filas.forEach((valores, n) => {
    valores.forEach((v, i) => {
      const cell = ws.getCell(fila + 1 + n, col + i);
      cell.value = v ?? null;
      cell.font = fuente({ tam: 8.5, color: color?.(n, i) });
      if (formatos[i]) cell.numFmt = formatos[i]!;
      cell.alignment = { vertical: 'middle', horizontal: formatos[i] ? 'right' : 'left' };
      cell.border = { bottom: fina() };
      if (n % 2) cell.fill = relleno(C.cebra);
    });
  });
  let fin = fila + filas.length;
  if (total) {
    fin += 1;
    total.forEach((v, i) => {
      const cell = ws.getCell(fin, col + i);
      cell.value = v ?? null;
      cell.font = fuente({ tam: 8.5, negrita: true, color: C.tinta });
      if (formatos[i]) cell.numFmt = formatos[i]!;
      cell.alignment = { vertical: 'middle', horizontal: formatos[i] ? 'right' : 'left' };
      cell.fill = relleno(C.pie);
      cell.border = { top: { style: 'medium', color: { argb: ARGB(C.marca) } } };
    });
  }
  return fin;
};

interface RefContratos { cMax: number; cMes0: number; cTotal: number; fPrimera: number; fUltima: number }

const nuevaHojaResumen = (wb: ExcelJS.Workbook) => wb.addWorksheet('Resumen', {
  properties: { tabColor: { argb: ARGB(C.marca) } },
  views: [{ showGridLines: false }],
});

const llenarResumen = (wb: ExcelJS.Workbook, ws: Hoja, e: EntradaFormato, titulo: string, ref: RefContratos | null) => {
  const r = e.reporte;
  ws.getColumn(1).width = 2;
  for (let c = 2; c <= 10; c++) ws.getColumn(c).width = ANCHO_COL_RESUMEN;
  encabezadoHoja(ws, r, titulo, subtituloReporte(e.tipo), 2);
  if (e.logo) {
    const id = wb.addImage({ base64: e.logo.dataUrl, extension: 'png' });
    ws.addImage(id, { tl: { col: 9.35, row: 0.1 }, ext: { width: 58, height: 58 }, editAs: 'oneCell' });
  }

  // Indicadores: cuatro tarjetas de dos columnas cada una.
  const k = indicadores(r);
  const hoja = ref ? `'${HOJA_CONTRATOS}'!` : null;
  const rango = (col: number) => (ref && hoja ? `${hoja}${letra(col)}${ref.fPrimera}:${letra(col)}${ref.fUltima}` : '');
  const formulas: Array<ExcelJS.CellValue> = ref ? [
    { formula: `COUNTA(${hoja}A${ref.fPrimera}:A${ref.fUltima})`, result: r.totales.servicios },
    { formula: `SUM(${rango(ref.cTotal)})`, result: r.totales.pagado },
    { formula: `IF(SUM(${rango(ref.cMax)})>0,SUM(${rango(ref.cTotal)})/SUM(${rango(ref.cMax)}),0)`, result: r.totales.avance / 100 },
    { formula: `SUM(${rango(ref.cMax)})-SUM(${rango(ref.cTotal)})`, result: r.totales.saldo },
  ] : [r.totales.servicios, r.totales.pagado, r.totales.avance / 100, r.totales.saldo];
  const formatos = [FMT.entero, FMT.dinero, FMT.porcentaje, FMT.dinero];
  k.forEach((ind, i) => {
    const c = 2 + i * 2;
    ws.mergeCells(6, c, 6, c + 1);
    ws.mergeCells(7, c, 7, c + 1);
    ws.mergeCells(8, c, 8, c + 1);
    const et = ws.getCell(6, c);
    et.value = ind.etiqueta.toUpperCase();
    et.font = fuente({ tam: 8, negrita: true, color: C.secundaria });
    et.alignment = { indent: 1, vertical: 'bottom' };
    const val = ws.getCell(7, c);
    val.value = formulas[i];
    val.numFmt = formatos[i];
    val.font = fuente({ tam: 16, negrita: true, color: ind.alerta ? C.saldo : C.tinta });
    val.alignment = { indent: 1, horizontal: 'left', vertical: 'middle' };
    const nota = ws.getCell(8, c);
    nota.value = ind.nota;
    nota.font = fuente({ tam: 8, color: C.secundaria });
    nota.alignment = { indent: 1, vertical: 'top' };
    caja(ws, 6, c, 8, c + 1);
  });
  ws.getRow(6).height = 20;
  ws.getRow(7).height = 28;
  ws.getRow(8).height = 20;

  let fila = 11;
  const g = graficasConTitulo(e);
  const medio = pxColumna(ANCHO_COL_RESUMEN) * 4 - 10;

  // Totales por mes (con fórmulas contra la hoja de Contratos si existe).
  fila = tituloEnHoja(ws, fila, 2, 'Totales por mes', 'Composición del pago de cada mes y su avance acumulado contra el monto máximo total.');
  const des = `'${HOJA_DESGLOSE}'!`;
  const filaTabla = fila;
  const filasMes = r.porMes.map((m, i) => {
    const f = filaTabla + 1 + i;
    const sumif = (col: string, valor: number) => (ref
      ? { formula: `SUMIFS(${des}${col}:${col},${des}C:C,"${m.mes}")`, result: valor }
      : valor);
    return [
      m.mes,
      sumif('E', m.preventivos),
      sumif('F', m.correctivos),
      sumif('G', m.notaCredito),
      ref ? { formula: `SUMIFS(${des}H:H,${des}C:C,"${m.mes}",${des}I:I,"Importe del mes")`, result: m.sinDesglose } : m.sinDesglose,
      ref ? { formula: `SUM(${hoja}${letra(ref.cMes0 + i)}${ref.fPrimera}:${letra(ref.cMes0 + i)}${ref.fUltima})`, result: m.pago } : m.pago,
      { formula: i === 0 ? `G${f}` : `H${f - 1}+G${f}`, result: m.acumulado },
      r.totales.montoMaximo > 0
        ? (ref ? { formula: `H${f}/SUM(${rango(ref.cMax)})`, result: m.acumulado / r.totales.montoMaximo } : m.acumulado / r.totales.montoMaximo)
        : null,
      m.serviciosConPago,
    ] as ExcelJS.CellValue[];
  });
  const fa = filaTabla + 1; const fb = filaTabla + 12;
  fila = tablaEnResumen(ws, filaTabla, 2,
    ['Mes', 'Preventivos', 'Correctivos', 'Notas de crédito (se restan)', 'Importe sin desglose', 'Pago del mes', 'Acumulado', '% acumulado del monto máximo', 'Contratos con pago'],
    [undefined, FMT.dinero, FMT.dinero, FMT.dinero, FMT.dinero, FMT.dinero, FMT.dinero, FMT.porcentaje, FMT.entero],
    filasMes,
    ['Total',
      { formula: `SUM(C${fa}:C${fb})`, result: r.totales.preventivos },
      { formula: `SUM(D${fa}:D${fb})`, result: r.totales.correctivos },
      { formula: `SUM(E${fa}:E${fb})`, result: r.totales.notasCredito },
      { formula: `SUM(F${fa}:F${fb})`, result: sumar(r.porMes.map((m) => m.sinDesglose)) },
      { formula: `SUM(G${fa}:G${fb})`, result: r.totales.pagado },
      null, null, null],
    (_n, i) => (i === 3 ? C.nota : undefined),
  ) + 3;

  // Al imprimir, las gráficas empiezan en hoja nueva en vez de partirse.
  ws.getRow(fila - 1).addPageBreak();
  const inicioGraficas = fila;
  fila = inicioGraficas + Math.max(
    bloqueGrafica(wb, ws, g.mensual, inicioGraficas, 2, medio),
    bloqueGrafica(wb, ws, g.acumulado, inicioGraficas, 6, medio),
  ) + 1;

  if (e.tipo === 'resumen') {
    const inicio = fila;
    const alto = bloqueGrafica(wb, ws, g.rangos, fila, 2, medio);
    let ft = tituloEnHoja(ws, inicio, 6, 'Contratos por rango de avance');
    ft = tablaEnResumen(ws, ft + 1, 6, ['Rango de avance', 'Contratos', 'Monto máximo', 'Pagado'],
      [undefined, FMT.entero, FMT.dinero, FMT.dinero],
      r.rangos.map((x) => [x.etiqueta, x.servicios, x.monto, x.pagado]),
      ['Total', r.rangos.reduce((n, x) => n + x.servicios, 0), sumar(r.rangos.map((x) => x.monto)), sumar(r.rangos.map((x) => x.pagado))]);
    fila = Math.max(inicio + alto, ft + 1) + 1;
    ws.getRow(fila - 1).addPageBreak();
    fila += bloqueGrafica(wb, ws, g.contratos, fila, 2, pxColumna(ANCHO_COL_RESUMEN) * 9 - 20) + 1;
  }

  configurarImpresion(ws, r, `${titulo} · Resumen`);
  ws.pageSetup.fitToHeight = 0;
  return ws;
};

export const generarExcel = async (e: EntradaFormato): Promise<Blob> => {
  const r = e.reporte;
  const titulo = tituloReporte(e.tipo, r.anio);
  const wb = new ExcelJS.Workbook();
  wb.creator = r.usuario;
  wb.lastModifiedBy = r.usuario;
  wb.created = r.generado;
  wb.modified = r.generado;
  wb.title = titulo;
  wb.subject = subtituloReporte(e.tipo);
  wb.company = INSTITUCION;

  // El resumen va primero; en la Tabla sus fórmulas apuntan a las hojas de
  // datos, así que se llena al final.
  const resumen = nuevaHojaResumen(wb);
  if (e.tipo === 'tabla') {
    const contratos = hojaContratos(wb, r, titulo);
    hojaDesglose(wb, r, titulo);
    hojaCalidad(wb, r, titulo);
    llenarResumen(wb, resumen, e, titulo, contratos);
  } else {
    llenarResumen(wb, resumen, e, titulo, null);
    hojaPorServicio(wb, r, titulo);
    hojaMensualPorServicio(wb, r, titulo);
    hojaCalidad(wb, r, titulo);
  }
  wb.views = [{ x: 0, y: 0, width: 28000, height: 16000, firstSheet: 0, activeTab: 0, visibility: 'visible' }];

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

/** Barras de datos verdes en la columna de avance (0 % a 100 %). */
const barrasDeAvance = (ws: Hoja, ref: string) => {
  ws.addConditionalFormatting({
    ref,
    rules: [{
      type: 'dataBar',
      priority: 1,
      minLength: 0,
      maxLength: 100,
      gradient: false,
      border: false,
      showValue: true,
      cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }],
      color: { argb: ARGB('8FBFA9') },
    } as unknown as ExcelJS.ConditionalFormattingRule],
  });
};
