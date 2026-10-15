/**
 * Reporte de Pagos en Word (carta horizontal) con la librería docx.
 */
import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, PageNumber, PageOrientation,
  Paragraph, ShadingType, Table, TableCell, TableLayoutType, TableRow, TabStopType, TextRun,
  VerticalAlign, WidthType, type IBorderOptions, type ParagraphChild,
} from 'docx';
import { fechaHora } from './datos';
import { graficaMedidor, type Grafica } from './graficas';
import {
  INSTITUCION, FUENTE_DATOS, SIN_VALOR, indicadores, secciones, subtituloReporte, tituloReporte,
  type EntradaFormato, type GraficaConTitulo, type TablaTexto,
} from './comun';

const FUENTE = 'Arial';
// Carta horizontal, márgenes de 0.5": 10" útiles, casi lo mismo que el PDF.
const TWIP = 1440;
const MARGEN = Math.round(0.5 * TWIP);
const UTIL_TWIP = 11 * TWIP - 2 * MARGEN;
const UTIL_PT = UTIL_TWIP / 20;
const PX = 96 / 72;

const C = {
  marca: '0F4C3A',
  tinta: '0F172A',
  texto: '334155',
  secundaria: '64748B',
  borde: 'E2E8F0',
  cebra: 'F8FAFC',
  pie: 'EAF3EE',
  saldo: 'B45309',
  blanco: 'FFFFFF',
};

const NADA: IBorderOptions = { style: BorderStyle.NIL, size: 0, color: 'auto' };
const SIN_BORDES = { top: NADA, bottom: NADA, left: NADA, right: NADA, insideHorizontal: NADA, insideVertical: NADA };
const linea = (color = C.borde, size = 4): IBorderOptions => ({ style: BorderStyle.SINGLE, size, color });

const run = (text: string, o: { tam?: number; negrita?: boolean; color?: string; espaciado?: number } = {}) =>
  new TextRun({ text, font: FUENTE, size: Math.round((o.tam ?? 9) * 2), bold: o.negrita, color: o.color ?? C.texto, characterSpacing: o.espaciado });

const parrafo = (
  hijos: ParagraphChild[] | string,
  o: { alinear?: (typeof AlignmentType)[keyof typeof AlignmentType]; antes?: number; despues?: number; conSiguiente?: boolean; saltoAntes?: boolean; tam?: number; color?: string; negrita?: boolean } = {},
) => new Paragraph({
  alignment: o.alinear,
  spacing: { before: o.antes ?? 0, after: o.despues ?? 0, line: 252 },
  keepNext: o.conSiguiente,
  pageBreakBefore: o.saltoAntes,
  children: typeof hijos === 'string' ? [run(hijos, { tam: o.tam, color: o.color, negrita: o.negrita })] : hijos,
});

const imagen = (g: Grafica, anchoPt: number) => new ImageRun({
  type: 'png',
  data: g.png,
  transformation: { width: Math.round(anchoPt * PX), height: Math.round((anchoPt * g.alto / g.ancho) * PX) },
});

const tituloSeccion = (titulo: string, descripcion?: string, saltoAntes = false) => [
  parrafo([run(titulo, { tam: 12, negrita: true, color: C.marca })], { antes: saltoAntes ? 0 : 240, despues: descripcion ? 40 : 100, conSiguiente: true, saltoAntes }),
  ...(descripcion ? [parrafo([run(descripcion, { tam: 8, color: C.secundaria })], { despues: 100, conSiguiente: true })] : []),
];

const ALINEAR = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT } as const;

const tabla = (tb: TablaTexto, anchoTwip = UTIL_TWIP, sePuedeJuntar = true) => {
  const suma = tb.anchos.reduce((a, b) => a + b, 0);
  const anchos = tb.anchos.map((a) => Math.floor((a / suma) * anchoTwip));
  // En las tablas de letra chica cada milímetro cuenta para que un importe no se parta.
  const lateral = tb.letra < 6.5 ? 30 : 70;
  const margenes = { top: 45, bottom: 45, left: lateral, right: lateral };
  // Una tabla corta no se parte entre páginas: cada renglón "se queda con el siguiente".
  const juntar = sePuedeJuntar && tb.filas.length <= 15;
  const celda = (texto: string, i: number, o: { fondo?: string; color?: string; negrita?: boolean; bordeArriba?: IBorderOptions; ultima?: boolean } = {}) => new TableCell({
    width: { size: anchos[i], type: WidthType.DXA },
    margins: margenes,
    verticalAlign: VerticalAlign.CENTER,
    shading: o.fondo ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fondo } : undefined,
    borders: { top: o.bordeArriba ?? NADA, left: NADA, right: NADA, bottom: linea() },
    children: String(texto).split('\n').map((l) => parrafo([run(l, { tam: tb.letra, negrita: o.negrita, color: o.color })], { alinear: ALINEAR[tb.alinear[i]], conSiguiente: juntar && !o.ultima })),
  });

  const filas = [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: tb.encabezados.map((h, i) => celda(h, i, { fondo: C.marca, color: C.blanco, negrita: true })),
    }),
    ...tb.filas.map((f, n) => new TableRow({
      cantSplit: true,
      children: f.map((v, i) => celda(v, i, {
        fondo: n % 2 ? C.cebra : undefined,
        color: v === SIN_VALOR ? undefined : tb.color?.(n, i),
        ultima: !tb.total && n === tb.filas.length - 1,
      })),
    })),
    ...(tb.total ? [new TableRow({
      cantSplit: true,
      children: tb.total.map((v, i) => celda(v, i, { fondo: C.pie, color: C.tinta, negrita: true, bordeArriba: linea(C.marca, 8), ultima: true })),
    })] : []),
  ];
  return new Table({
    width: { size: anchoTwip, type: WidthType.DXA },
    columnWidths: anchos,
    layout: TableLayoutType.FIXED,
    borders: SIN_BORDES,
    rows: filas,
  });
};

/**
 * Título, nota e imagen de una gráfica. Dentro de una tabla de acomodo no se
 * marca "conservar con el siguiente": Word lo aplicaría a todo el renglón y
 * arrastraría las gráficas a la página de la tabla que sigue.
 */
const bloqueGrafica = (g: GraficaConTitulo, anchoPt: number, enTabla = false) => [
  parrafo([run(g.titulo, { tam: 9.5, negrita: true, color: C.tinta })], { conSiguiente: !enTabla }),
  parrafo([run(g.nota, { tam: 7, color: C.secundaria })], { despues: 60, conSiguiente: !enTabla }),
  parrafo([imagen(g.grafica, anchoPt)]),
];

/** Fila de celdas sin bordes para acomodar cosas lado a lado. */
const lado = (columnas: Array<{ ancho: number; hijos: Array<Paragraph | Table> }>) => new Table({
  width: { size: UTIL_TWIP, type: WidthType.DXA },
  columnWidths: columnas.map((c) => c.ancho),
  layout: TableLayoutType.FIXED,
  borders: SIN_BORDES,
  rows: [new TableRow({
    cantSplit: true,
    children: columnas.map((c, i) => new TableCell({
      width: { size: c.ancho, type: WidthType.DXA },
      borders: { top: NADA, bottom: NADA, left: NADA, right: NADA },
      margins: { top: 0, bottom: 0, left: i === 0 ? 0 : 140, right: i === columnas.length - 1 ? 0 : 140 },
      children: c.hijos,
    })),
  })],
});

const indicadoresPortada = (e: EntradaFormato) => {
  const lista = indicadores(e.reporte);
  const hueco = 160;
  const ancho = Math.floor((UTIL_TWIP - hueco * (lista.length - 1)) / lista.length);
  const anchoPt = ancho / 20 - 16;
  const columnas: number[] = [];
  lista.forEach((_, i) => { columnas.push(ancho); if (i < lista.length - 1) columnas.push(hueco); });
  const caja = linea(C.borde, 6);
  return new Table({
    width: { size: UTIL_TWIP, type: WidthType.DXA },
    columnWidths: columnas,
    layout: TableLayoutType.FIXED,
    borders: SIN_BORDES,
    rows: [new TableRow({
      cantSplit: true,
      children: lista.flatMap((k, i) => {
        const tarjeta = new TableCell({
          width: { size: ancho, type: WidthType.DXA },
          margins: { top: 140, bottom: 140, left: 160, right: 160 },
          borders: { top: caja, bottom: caja, left: caja, right: caja },
          children: [
            parrafo([run(k.etiqueta.toUpperCase(), { tam: 7, negrita: true, color: C.secundaria, espaciado: 10 })], { despues: 60 }),
            parrafo([run(k.valor, { tam: 16, negrita: true, color: k.alerta ? C.saldo : C.tinta })], { despues: 60 }),
            ...(k.etiqueta === 'Avance global'
              ? [parrafo([imagen(graficaMedidor(e.reporte.totales.avance, anchoPt, 3.5), anchoPt)], { despues: 40 })]
              : []),
            parrafo([run(k.nota, { tam: 7.5, color: C.secundaria })]),
          ],
        });
        const separador = new TableCell({ width: { size: hueco, type: WidthType.DXA }, borders: { top: NADA, bottom: NADA, left: NADA, right: NADA }, children: [new Paragraph('')] });
        return i < lista.length - 1 ? [tarjeta, separador] : [tarjeta];
      }),
    })],
  });
};

export const generarWord = async (e: EntradaFormato): Promise<Blob> => {
  const r = e.reporte;
  const titulo = tituloReporte(e.tipo, r.anio);
  const cuerpo: Array<Paragraph | Table> = [
    parrafo([run(titulo, { tam: 22, negrita: true, color: C.tinta })], { despues: 40 }),
    parrafo([run(`${subtituloReporte(e.tipo)} · Corte al ${fechaHora(r.generado)}`, { tam: 10, color: C.secundaria })], { despues: 200 }),
  ];

  for (const s of secciones(e)) {
    if (s.tipo === 'indicadores') {
      cuerpo.push(indicadoresPortada(e), parrafo('', { despues: 120 }));
    } else if (s.tipo === 'graficas') {
      if (s.items.length === 1) {
        cuerpo.push(parrafo('', { antes: 120 }), ...bloqueGrafica(s.items[0], UTIL_PT));
      } else {
        const ancho = Math.floor(UTIL_TWIP / s.items.length);
        cuerpo.push(parrafo('', { antes: 120 }), lado(s.items.map((g) => ({ ancho, hijos: bloqueGrafica(g, ancho / 20 - 14, true) }))));
      }
    } else if (s.tipo === 'graficaYTabla') {
      const ancho = Math.floor(UTIL_TWIP / 2);
      cuerpo.push(parrafo('', { antes: 240 }), lado([
        { ancho, hijos: bloqueGrafica(s.item, ancho / 20 - 14, true) },
        { ancho, hijos: [parrafo([run(s.tabla.titulo, { tam: 9.5, negrita: true, color: C.tinta })], { despues: 120 }), tabla(s.tabla, ancho - 140, false), new Paragraph('')] },
      ]));
    } else if (s.tipo === 'tabla') {
      cuerpo.push(...tituloSeccion(s.tabla.titulo, s.tabla.descripcion, s.nuevaPagina), tabla(s.tabla));
    } else {
      cuerpo.push(...tituloSeccion(s.titulo));
      s.parrafos.forEach((p) => cuerpo.push(new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 60, line: 264 },
        children: [run(p, { tam: 8.5 })],
      })));
    }
  }

  const encabezado = new Header({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: UTIL_TWIP }],
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.borde, space: 4 } },
        spacing: { after: 0 },
        children: [
          ...(e.logo ? [new ImageRun({ type: 'png', data: e.logo.png, transformation: { width: 30, height: 30 } }), run('  ')] : []),
          run(INSTITUCION.toUpperCase(), { tam: 7, negrita: true, color: C.secundaria, espaciado: 10 }),
          run('   '),
          run(`${titulo} · ${subtituloReporte(e.tipo)}`, { tam: 8.5, negrita: true, color: C.tinta }),
          run(`\tCorte: ${fechaHora(r.generado)} · Importes en MXN`, { tam: 7.5, color: C.secundaria }),
        ],
      }),
    ],
  });

  const pie = new Footer({
    children: [
      new Paragraph({
        tabStops: [{ type: TabStopType.RIGHT, position: UTIL_TWIP }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.borde, space: 4 } },
        children: [
          run(`${FUENTE_DATOS} ${r.anio}. Generado por ${r.usuario} el ${fechaHora(r.generado)}.`, { tam: 7, color: C.secundaria }),
          new TextRun({ font: FUENTE, size: 14, color: C.secundaria, children: ['\tPágina ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES] }),
        ],
      }),
    ],
  });

  const doc = new Document({
    creator: r.usuario,
    title: titulo,
    description: subtituloReporte(e.tipo),
    styles: { default: { document: { run: { font: FUENTE, size: 18, color: C.texto } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 8.5 * TWIP, height: 11 * TWIP, orientation: PageOrientation.LANDSCAPE },
          margin: { top: Math.round(0.85 * TWIP), bottom: Math.round(0.7 * TWIP), left: MARGEN, right: MARGEN, header: Math.round(0.35 * TWIP), footer: Math.round(0.35 * TWIP) },
        },
      },
      headers: { default: encabezado },
      footers: { default: pie },
      children: cuerpo,
    }],
  });
  return Packer.toBlob(doc);
};
