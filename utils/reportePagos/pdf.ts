/**
 * Reporte de Pagos en PDF (carta horizontal) con jsPDF + AutoTable.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fechaHora } from './datos';
import {
  INSTITUCION, FUENTE_DATOS, SIN_VALOR, indicadores, secciones, subtituloReporte, tituloReporte,
  type EntradaFormato, type GraficaConTitulo, type TablaTexto,
} from './comun';

const PAGINA = { ancho: 279.4, alto: 215.9 };
const MARGEN = { izq: 12, der: 12, arriba: 25, abajo: 15 };
const UTIL = PAGINA.ancho - MARGEN.izq - MARGEN.der;
const LIMITE = PAGINA.alto - MARGEN.abajo;

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
const C = {
  marca: hex('0F4C3A'),
  serie: hex('1F6F54'),
  pista: hex('D3E5DB'),
  tinta: hex('0F172A'),
  texto: hex('334155'),
  secundaria: hex('64748B'),
  borde: hex('E2E8F0'),
  cebra: hex('F8FAFC'),
  pie: hex('EAF3EE'),
  saldo: hex('B45309'),
};

/**
 * Las fuentes estándar del PDF sólo traen Latin-1: los signos tipográficos
 * que no están ahí se cambian por su equivalente para que no salgan basura.
 */
const t = (s: string) => s
  .replace(/[−–—]/g, '-')
  .replace(/…/g, '...')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[^\x00-\xFF]/g, '');

/**
 * Parte una clave de contrato en renglones por "-", "/" o espacio, para que
 * nunca quede "…SVS-02 / 6/2026". Si un trozo solo no cabe, se deja entero.
 */
const partirCodigo = (doc: jsPDF, texto: string, ancho: number): string[] => {
  if (doc.getTextWidth(texto) <= ancho) return [texto];
  const trozos = texto.match(/[^-/\s]+[-/]?\s*/g) ?? [texto];
  const lineas: string[] = [];
  let actual = '';
  trozos.forEach((tz) => {
    if (actual && doc.getTextWidth((actual + tz).trimEnd()) > ancho) {
      lineas.push(actual.trimEnd());
      actual = tz;
    } else {
      actual += tz;
    }
  });
  if (actual.trim()) lineas.push(actual.trimEnd());
  return lineas;
};

const tituloSeccion = (doc: jsPDF, y: number, titulo: string, descripcion?: string) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...C.marca);
  doc.text(t(titulo), MARGEN.izq, y);
  if (!descripcion) return y + 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.secundaria);
  doc.text(t(descripcion), MARGEN.izq, y + 4.2, { maxWidth: UTIL });
  return y + 7.5;
};

const indicadoresPortada = (doc: jsPDF, e: EntradaFormato, y: number) => {
  const lista = indicadores(e.reporte);
  const hueco = 4;
  const w = (UTIL - hueco * (lista.length - 1)) / lista.length;
  const h = 23;
  lista.forEach((k, i) => {
    const x = MARGEN.izq + i * (w + hueco);
    doc.setDrawColor(...C.borde);
    doc.setFillColor(255, 255, 255);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, y, w, h, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.secundaria);
    doc.text(t(k.etiqueta.toUpperCase()), x + 4, y + 5.5, { charSpace: 0.25 });
    doc.setFontSize(15);
    doc.setTextColor(...(k.alerta ? C.saldo : C.tinta));
    doc.text(t(k.valor), x + 4, y + 13);
    if (k.etiqueta === 'Avance global') {
      const largo = w - 8;
      const avance = Math.max(0, Math.min(100, e.reporte.totales.avance));
      doc.setFillColor(...C.pista);
      doc.roundedRect(x + 4, y + 15.3, largo, 1.6, 0.8, 0.8, 'F');
      doc.setFillColor(...C.serie);
      if (avance > 0) doc.roundedRect(x + 4, y + 15.3, (largo * avance) / 100, 1.6, 0.8, 0.8, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...C.secundaria);
      doc.text(t(k.nota), x + 4, y + 20.5);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(...C.secundaria);
      doc.text(t(k.nota), x + 4, y + 18.5);
    }
  });
  return y + h + 7;
};

const grafica = (doc: jsPDF, g: GraficaConTitulo, x: number, y: number, w: number) => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...C.tinta);
  doc.text(t(g.titulo), x, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(...C.secundaria);
  doc.text(t(g.nota), x, y + 3.8, { maxWidth: w });
  const h = (w * g.grafica.alto) / g.grafica.ancho;
  doc.addImage(g.grafica.dataUrl, 'PNG', x, y + 6, w, h);
  return y + 6 + h;
};

const altoGrafica = (g: GraficaConTitulo, w: number) => 6 + (w * g.grafica.alto) / g.grafica.ancho;

const tabla = (doc: jsPDF, tb: TablaTexto, y: number, opciones: { izq?: number; ancho?: number; sinTitulo?: boolean } = {}) => {
  const izq = opciones.izq ?? MARGEN.izq;
  const ancho = opciones.ancho ?? UTIL;
  const suma = tb.anchos.reduce((a, b) => a + b, 0);
  const anchos = tb.anchos.map((a) => (a / suma) * ancho);
  let inicio = y;
  if (!opciones.sinTitulo) inicio = tituloSeccion(doc, y, tb.titulo, tb.descripcion) + 1;

  autoTable(doc, {
    startY: inicio,
    margin: { left: izq, right: PAGINA.ancho - izq - ancho, top: MARGEN.arriba, bottom: MARGEN.abajo },
    tableWidth: ancho,
    head: [tb.encabezados.map(t)],
    body: tb.filas.map((f) => f.map(t)),
    foot: tb.total ? [tb.total.map(t)] : undefined,
    showHead: 'everyPage',
    showFoot: 'lastPage',
    rowPageBreak: 'avoid',
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: tb.letra,
      cellPadding: { top: 1.3, bottom: 1.3, left: 1.4, right: 1.4 },
      textColor: C.texto,
      lineColor: C.borde,
      lineWidth: { bottom: 0.15 },
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: { fillColor: C.marca, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: tb.letra, valign: 'middle', lineWidth: 0 },
    footStyles: { fillColor: C.pie, textColor: C.tinta, fontStyle: 'bold', lineWidth: { top: 0.3 }, lineColor: C.marca },
    alternateRowStyles: { fillColor: C.cebra },
    columnStyles: Object.fromEntries(anchos.map((w, i) => [i, { cellWidth: w, halign: tb.alinear[i] }])),
    didParseCell: (d) => {
      d.cell.styles.halign = tb.alinear[d.column.index];
      if (d.section === 'body' && tb.color && d.cell.raw !== t(SIN_VALOR)) {
        const c = tb.color(d.row.index, d.column.index);
        if (c) d.cell.styles.textColor = hex(c);
      }
      if (d.section === 'body' && tb.codigos?.includes(d.column.index)) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(tb.letra);
        const util = anchos[d.column.index] - 2.8 - 0.2;
        d.cell.text = partirCodigo(doc, String(d.cell.raw ?? ''), util);
      }
      if (d.section === 'body' && tb.barra && d.column.index === tb.barra.col) {
        d.cell.styles.cellPadding = { top: 1.3, bottom: 1.3, left: 15, right: 1.4 };
      }
    },
    didDrawCell: (d) => {
      if (d.section !== 'body' || !tb.barra || d.column.index !== tb.barra.col) return;
      const v = Math.max(0, Math.min(100, tb.barra.valores[d.row.index] ?? 0));
      const x = d.cell.x + 1.6;
      const yb = d.cell.y + d.cell.height / 2 - 0.7;
      const largo = 12;
      doc.setFillColor(...C.pista);
      doc.roundedRect(x, yb, largo, 1.4, 0.7, 0.7, 'F');
      if (v > 0) {
        doc.setFillColor(...C.serie);
        doc.roundedRect(x, yb, Math.max(1.4, (largo * v) / 100), 1.4, 0.7, 0.7, 'F');
      }
    },
  });
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
};

/** Alto aproximado de una tabla corta, para no partirla entre páginas. */
const altoTabla = (tb: TablaTexto) => 9 + (tb.filas.length + 1 + (tb.total ? 1 : 0)) * (tb.letra * 0.55 + 2.8);

const notas = (doc: jsPDF, titulo: string, parrafos: string[], y: number) => {
  let yy = tituloSeccion(doc, y, titulo) + 1.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...C.texto);
  parrafos.forEach((p) => {
    const lineas = doc.splitTextToSize(t(p), UTIL - 5) as string[];
    if (yy + lineas.length * 3.4 > LIMITE) { doc.addPage(); yy = MARGEN.arriba; }
    doc.setFillColor(...C.serie);
    doc.circle(MARGEN.izq + 1.2, yy - 1, 0.6, 'F');
    doc.text(lineas, MARGEN.izq + 4, yy);
    yy += lineas.length * 3.4 + 1.2;
  });
  return yy;
};

const encabezadosYPies = (doc: jsPDF, e: EntradaFormato) => {
  const r = e.reporte;
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFillColor(...C.marca);
    doc.rect(0, 0, PAGINA.ancho, 1.6, 'F');
    let x = MARGEN.izq;
    if (e.logo) {
      doc.addImage(e.logo.dataUrl, 'PNG', MARGEN.izq, 5.2, 11, 11, 'logo-aifa');
      x += 13.5;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.secundaria);
    doc.text(t(INSTITUCION.toUpperCase()), x, 9.6, { charSpace: 0.3 });
    doc.setFontSize(9);
    doc.setTextColor(...C.tinta);
    doc.text(t(`${tituloReporte(e.tipo, r.anio)} · ${subtituloReporte(e.tipo)}`), x, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.secundaria);
    doc.text(t(`Corte: ${fechaHora(r.generado)}`), PAGINA.ancho - MARGEN.der, 9.6, { align: 'right' });
    doc.text(t('Importes en pesos mexicanos (MXN)'), PAGINA.ancho - MARGEN.der, 14, { align: 'right' });
    doc.setDrawColor(...C.borde);
    doc.setLineWidth(0.3);
    doc.line(MARGEN.izq, 18.5, PAGINA.ancho - MARGEN.der, 18.5);

    const yPie = PAGINA.alto - 8;
    doc.line(MARGEN.izq, yPie - 4, PAGINA.ancho - MARGEN.der, yPie - 4);
    doc.setFontSize(6.8);
    doc.text(t(`${FUENTE_DATOS} ${r.anio}. Generado por ${r.usuario} el ${fechaHora(r.generado)}.`), MARGEN.izq, yPie);
    doc.text(`Página ${i} de ${total}`, PAGINA.ancho - MARGEN.der, yPie, { align: 'right' });
  }
};

export const generarPdf = async (e: EntradaFormato): Promise<Blob> => {
  const r = e.reporte;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter', compress: true });
  doc.setProperties({
    title: tituloReporte(e.tipo, r.anio),
    subject: subtituloReporte(e.tipo),
    author: r.usuario,
    creator: 'Sistema de Contratos AIFA',
    keywords: 'pagos, contratos, AIFA',
  });

  // Portada: título, indicadores y lo demás a continuación.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...C.tinta);
  doc.text(t(tituloReporte(e.tipo, r.anio)), MARGEN.izq, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...C.secundaria);
  doc.text(t(`${subtituloReporte(e.tipo)} · Corte al ${fechaHora(r.generado)}`), MARGEN.izq, 36);
  let y = 41;

  const espacio = (alto: number) => {
    if (y + alto > LIMITE) { doc.addPage(); y = MARGEN.arriba; }
  };

  for (const s of secciones(e)) {
    if (s.tipo === 'indicadores') {
      y = indicadoresPortada(doc, e, y);
    } else if (s.tipo === 'graficas') {
      const hueco = 8;
      const w = s.items.length === 1 ? UTIL : (UTIL - hueco) / 2;
      espacio(Math.max(...s.items.map((g) => altoGrafica(g, w))) + 4);
      const fin = s.items.map((g, i) => grafica(doc, g, MARGEN.izq + i * (w + hueco), y + 3, w));
      y = Math.max(...fin) + 8;
    } else if (s.tipo === 'graficaYTabla') {
      const hueco = 10;
      const w = (UTIL - hueco) / 2;
      espacio(Math.max(altoGrafica(s.item, w), altoTabla(s.tabla)) + 4);
      const finG = grafica(doc, s.item, MARGEN.izq, y + 3, w);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.tinta);
      doc.text(t(s.tabla.titulo), MARGEN.izq + w + hueco, y + 3);
      const finT = tabla(doc, s.tabla, y + 9, { izq: MARGEN.izq + w + hueco, ancho: w, sinTitulo: true });
      y = Math.max(finG, finT) + 8;
    } else if (s.tipo === 'tabla') {
      const alto = altoTabla(s.tabla);
      if (s.nuevaPagina && y > MARGEN.arriba + 1) { doc.addPage(); y = MARGEN.arriba; }
      else if (alto < LIMITE - MARGEN.arriba) espacio(alto);
      // Una tabla larga empieza donde haya lugar para el título y unos renglones.
      else espacio(55);
      y = tabla(doc, s.tabla, y + 3) + 8;
    } else {
      espacio(30);
      y = notas(doc, s.titulo, s.parrafos, y + 3) + 4;
    }
  }

  encabezadosYPies(doc, e);
  return doc.output('blob');
};
