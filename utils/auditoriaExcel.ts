/**
 * La hoja de control de Auditoría en Excel, con el mismo acomodo que lleva el
 * área: contrato, descripción, proveedor, los doce meses con su letra y los
 * conteos por letra. Los conteos son fórmulas (CONTAR.SI): si alguien cambia
 * una letra en el archivo, se recalculan solos. Este mismo archivo se puede
 * volver a importar.
 */
import ExcelJS from 'exceljs';
import { ESTADOS, ESTADO_INFO, MESES, type Estado } from './auditoria';

export interface RenglonExcel {
  contrato: string;
  descripcion: string | null;
  proveedor: string | null;
  observacion: string | null;
  letras: Record<number, Estado | undefined>;
  /** Meses fuera de la vigencia del contrato (se sombrean). */
  fueraDeVigencia?: Set<number>;
}

const ARGB = (hex: string) => `FF${hex}`;
const relleno = (hex: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: ARGB(hex) } });
const fina = (hex = 'CBD5E1'): Partial<ExcelJS.Border> => ({ style: 'thin', color: { argb: ARGB(hex) } });
const bordes = { top: fina(), left: fina(), bottom: fina(), right: fina() };

// Los mismos colores que la leyenda de la hoja original, en tonos que se leen
// bien impresos.
export const COLOR_EXCEL: Record<Estado, { fondo: string; texto: string }> = {
  C: { fondo: 'C6EFCE', texto: '006100' },
  R: { fondo: 'BDE3F7', texto: '1F4E78' },
  E: { fondo: 'FFEB84', texto: '7F6000' },
  N: { fondo: 'FFC7CE', texto: '9C0006' },
};

const MARCA = '0F4C3A';
const AZUL = '0070C0';

const col = (n: number) => {
  let s = '';
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

export const generarExcelAuditoria = async (o: { anio: number; renglones: RenglonExcel[]; usuario: string }): Promise<Blob> => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AIFA Contratos';
  wb.created = new Date();
  const ws = wb.addWorksheet(`Auditoría ${o.anio}`, {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 1 as unknown as ExcelJS.PaperSize },
  });

  // Columnas: A contrato, B descripción, C proveedor, D-O meses, P-S letras,
  // T total, U observaciones.
  const primeraMes = 4;
  const primeraConteo = primeraMes + 12;
  const colTotal = primeraConteo + 4;
  const colObs = colTotal + 1;
  ws.columns = [
    { width: 30 }, { width: 44 }, { width: 34 },
    ...Array.from({ length: 12 }, () => ({ width: 5.2 })),
    ...ESTADOS.map(() => ({ width: 11 })),
    { width: 9 }, { width: 44 },
  ];

  // Renglón 1-2: título y fecha (no dicen "contrato" para que al importar el
  // encabezado se encuentre en el renglón 4).
  ws.mergeCells(1, 1, 1, colObs);
  const t = ws.getCell(1, 1);
  t.value = `Auditoría · Control de entregables ${o.anio}`;
  t.font = { name: 'Century Gothic', size: 14, bold: true, color: { argb: ARGB(MARCA) } };
  ws.mergeCells(2, 1, 2, colObs);
  const s = ws.getCell(2, 1);
  s.value = `Generado el ${new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })} por ${o.usuario}`;
  s.font = { name: 'Century Gothic', size: 9, italic: true, color: { argb: 'FF64748B' } };

  // Renglón 3: meses girados (como la hoja original) y nombres de las letras.
  const r3 = ws.getRow(3);
  r3.height = 70;
  MESES.forEach((m, i) => { r3.getCell(primeraMes + i).value = m; });
  ESTADOS.forEach((e, i) => { r3.getCell(primeraConteo + i).value = ESTADO_INFO[e].etiqueta; });
  for (let c = primeraMes; c <= colTotal; c++) {
    const celda = r3.getCell(c);
    celda.fill = relleno(AZUL);
    celda.font = { name: 'Century Gothic', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    celda.alignment = c < primeraConteo
      ? { textRotation: 90, vertical: 'bottom', horizontal: 'center' }
      : { vertical: 'middle', horizontal: 'center', wrapText: true };
    celda.border = bordes;
  }

  // Renglón 4: encabezado.
  const r4 = ws.getRow(4);
  r4.values = ['No. Contrato o Pedido', 'Descripción', 'Proveedor', ...Array(12).fill(''), ...ESTADOS, 'Total', 'Observaciones'];
  r4.height = 20;
  for (let c = 1; c <= colObs; c++) {
    const celda = r4.getCell(c);
    celda.fill = relleno(AZUL);
    celda.font = { name: 'Century Gothic', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    celda.alignment = { vertical: 'middle', horizontal: c <= 3 || c === colObs ? 'left' : 'center' };
    celda.border = bordes;
  }

  const primera = 5;
  o.renglones.forEach((r, i) => {
    const n = primera + i;
    const fila = ws.getRow(n);
    fila.getCell(1).value = r.contrato;
    fila.getCell(2).value = r.descripcion ?? '';
    fila.getCell(3).value = r.proveedor ?? '';
    for (let m = 1; m <= 12; m++) {
      const celda = fila.getCell(primeraMes + m - 1);
      const l = r.letras[m];
      celda.value = l ?? '';
      celda.alignment = { horizontal: 'center', vertical: 'middle' };
      if (l) {
        celda.fill = relleno(COLOR_EXCEL[l].fondo);
        celda.font = { name: 'Century Gothic', size: 10, bold: true, color: { argb: ARGB(COLOR_EXCEL[l].texto) } };
      } else if (r.fueraDeVigencia?.has(m)) {
        celda.fill = { type: 'pattern', pattern: 'lightUp', fgColor: { argb: 'FFCBD5E1' }, bgColor: { argb: 'FFF8FAFC' } };
      }
    }
    const rango = `${col(primeraMes)}${n}:${col(primeraMes + 11)}${n}`;
    ESTADOS.forEach((e, k) => {
      const celda = fila.getCell(primeraConteo + k);
      const valor = Object.values(r.letras).filter((x) => x === e).length;
      celda.value = { formula: `COUNTIF(${rango},"${e}")`, result: valor };
      celda.alignment = { horizontal: 'center' };
    });
    const total = Object.values(r.letras).filter(Boolean).length;
    fila.getCell(colTotal).value = { formula: `SUM(${col(primeraConteo)}${n}:${col(primeraConteo + 3)}${n})`, result: total };
    fila.getCell(colTotal).alignment = { horizontal: 'center' };
    fila.getCell(colTotal).font = { name: 'Century Gothic', size: 10, bold: true };
    fila.getCell(colObs).value = r.observacion ?? '';
    for (let c = 1; c <= colObs; c++) {
      const celda = fila.getCell(c);
      celda.border = bordes;
      if (!celda.font) celda.font = { name: 'Century Gothic', size: 10 };
      if (c <= 3 || c === colObs) celda.alignment = { vertical: 'middle', wrapText: false };
    }
  });

  const ultima = primera + Math.max(o.renglones.length, 1) - 1;

  // Barras de datos en los conteos, como en la hoja original.
  if (o.renglones.length) {
    const barras: Array<[number, string]> = [
      ...ESTADOS.map((e, k) => [primeraConteo + k, COLOR_EXCEL[e].texto] as [number, string]),
      [colTotal, '5B9BD5'],
    ];
    barras.forEach(([c, color]) => {
      ws.addConditionalFormatting({
        ref: `${col(c)}${primera}:${col(c)}${ultima}`,
        rules: [{
          type: 'dataBar',
          priority: 1,
          cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 12 }],
          color: { argb: ARGB(color) },
          gradient: true,
        } as unknown as ExcelJS.ConditionalFormattingRule],
      });
    });
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: ultima, column: colObs } };
  }

  // Leyenda.
  let n = ultima + 3;
  ESTADOS.forEach((e) => {
    const letra = ws.getCell(n, 1);
    letra.value = e;
    letra.alignment = { horizontal: 'center' };
    letra.font = { name: 'Century Gothic', size: 11, bold: true };
    const nombre = ws.getCell(n, 2);
    nombre.value = ESTADO_INFO[e].etiqueta;
    nombre.alignment = { horizontal: 'center' };
    nombre.fill = relleno(COLOR_EXCEL[e].fondo);
    nombre.font = { name: 'Century Gothic', size: 11, color: { argb: ARGB(COLOR_EXCEL[e].texto) } };
    nombre.border = bordes;
    n++;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
};

/** El libro de Excel como matriz de texto, hoja por hoja, para leerHojaAuditoria. */
export const leerLibro = async (archivo: ArrayBuffer): Promise<{ nombre: string; celdas: string[][] }[]> => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(archivo);
  return wb.worksheets.map((ws) => {
    const celdas: string[][] = [];
    const filas = Math.min(ws.rowCount, 2000);
    const columnas = Math.min(ws.columnCount, 60);
    for (let r = 1; r <= filas; r++) {
      const fila = ws.getRow(r);
      const valores: string[] = [];
      for (let c = 1; c <= columnas; c++) {
        let texto = '';
        try { texto = fila.getCell(c).text ?? ''; } catch { texto = ''; }
        valores.push(texto);
      }
      celdas.push(valores);
    }
    return { nombre: ws.name, celdas };
  });
};
