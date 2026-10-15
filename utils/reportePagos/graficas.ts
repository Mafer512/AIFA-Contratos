/**
 * Gráficas del reporte de Pagos, dibujadas en un canvas y exportadas a PNG
 * para incrustarlas igual en Excel, Word y PDF.
 *
 * Se dibujan en puntos tipográficos (1 unidad = 1 pt al tamaño en que se
 * imprimen) y con escala 3 para que se vean nítidas al imprimir. Los
 * títulos van fuera de la imagen, como texto del documento.
 */
import { ReportePagos, ServicioReporte, MESES_CORTOS, dineroCompacto, porcentaje, ultimoMesConPago } from './datos';

export interface Grafica {
  png: Uint8Array;
  dataUrl: string;
  /** Tamaño de impresión, en puntos. */
  ancho: number;
  alto: number;
}

const ESCALA = 3;
const FUENTE = 'Arial, Helvetica, sans-serif';

export const COLORES = {
  marca: '#0F4C3A',
  serie: '#1F6F54',
  pista: '#D3E5DB',
  tinta: '#1E293B',
  secundaria: '#475569',
  tenue: '#94A3B8',
  reticula: '#E2E8F0',
  eje: '#CBD5E1',
  fondo: '#FFFFFF',
  /** Rampa ordinal (validada: un tono, claro → oscuro). */
  rampa: ['#8FBFA9', '#62A386', '#3A8466', '#1F664C', '#0F4C3A', '#08301F'],
};

const lienzo = (ancho: number, alto: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(ancho * ESCALA);
  canvas.height = Math.round(alto * ESCALA);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('El navegador no permite dibujar las gráficas.');
  ctx.scale(ESCALA, ESCALA);
  ctx.fillStyle = COLORES.fondo;
  ctx.fillRect(0, 0, ancho, alto);
  ctx.textBaseline = 'middle';
  return { canvas, ctx };
};

const terminar = (canvas: HTMLCanvasElement, ancho: number, alto: number): Grafica => {
  const dataUrl = canvas.toDataURL('image/png');
  const binario = atob(dataUrl.split(',')[1]);
  const png = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) png[i] = binario.charCodeAt(i);
  return { png, dataUrl, ancho, alto };
};

const fuente = (ctx: CanvasRenderingContext2D, tam: number, peso: 'normal' | 'bold' = 'normal') => {
  ctx.font = `${peso} ${tam}px ${FUENTE}`;
};

const recortar = (ctx: CanvasRenderingContext2D, texto: string, max: number) => {
  if (ctx.measureText(texto).width <= max) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
};

/** Escala "bonita": 0, 20 M, 40 M… con 4–6 marcas. */
const marcas = (maximo: number, objetivo = 5) => {
  if (maximo <= 0) return [0, 1];
  const crudo = maximo / objetivo;
  const potencia = 10 ** Math.floor(Math.log10(crudo));
  const paso = [1, 2, 2.5, 5, 10].map((f) => f * potencia).find((p) => maximo / p <= objetivo + 0.5) ?? 10 * potencia;
  const tope = Math.ceil(maximo / paso) * paso;
  const lista: number[] = [];
  for (let v = 0; v <= tope + paso / 1e6; v += paso) lista.push(v);
  return lista;
};

/** Columna con la punta redondeada (4 px) y la base recta. */
const columna = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
  if (h <= 0) return;
  const r = Math.min(2, w / 2, h);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  ctx.fill();
};

/** Barra horizontal con el extremo derecho redondeado. */
const barra = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
  if (w <= 0) return;
  const r = Math.min(2, h / 2, w);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
};

const lineaH = (ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, color: string) => {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(x1, Math.round(y * 2) / 2);
  ctx.lineTo(x2, Math.round(y * 2) / 2);
  ctx.stroke();
};

/** Ejes Y con retícula fina; devuelve la función valor → y. */
const ejeY = (
  ctx: CanvasRenderingContext2D,
  area: { x: number; y: number; w: number; h: number },
  maximo: number,
  etiqueta: (v: number) => string,
) => {
  const lista = marcas(maximo);
  const tope = lista[lista.length - 1];
  const yDe = (v: number) => area.y + area.h - (v / tope) * area.h;
  fuente(ctx, 6.5);
  ctx.textAlign = 'right';
  lista.forEach((v) => {
    const y = yDe(v);
    lineaH(ctx, area.x, area.x + area.w, y, v === 0 ? COLORES.eje : COLORES.reticula);
    ctx.fillStyle = COLORES.secundaria;
    ctx.fillText(etiqueta(v), area.x - 5, y);
  });
  return { yDe, tope };
};

const leyenda = (ctx: CanvasRenderingContext2D, x: number, y: number, items: Array<{ color: string; texto: string; linea?: boolean }>) => {
  fuente(ctx, 7);
  ctx.textAlign = 'left';
  let cx = x;
  items.forEach((it) => {
    ctx.fillStyle = it.color;
    if (it.linea) {
      ctx.fillRect(cx, y - 0.75, 10, 1.5);
    } else {
      ctx.beginPath();
      ctx.roundRect(cx, y - 4, 8, 8, 1.5);
      ctx.fill();
    }
    ctx.fillStyle = COLORES.secundaria;
    const desde = cx + (it.linea ? 13 : 11);
    ctx.fillText(it.texto, desde, y);
    cx = desde + ctx.measureText(it.texto).width + 14;
  });
};

const ejeYDinero = (v: number) => (v === 0 ? '$0' : dineroCompacto(v));

// ── 1. Pagos por mes ───────────────────────────────────────────────────────

export const graficaPagosMensuales = (r: ReportePagos, ancho = 370, alto = 200): Grafica => {
  const { canvas, ctx } = lienzo(ancho, alto);
  const area = { x: 42, y: 16, w: ancho - 50, h: alto - 38 };
  const valores = r.porMes.map((m) => m.pago);
  const { yDe } = ejeY(ctx, area, Math.max(...valores, 1), ejeYDinero);

  const hueco = area.w / 12;
  const ancho1 = Math.min(18, hueco * 0.62);
  valores.forEach((v, i) => {
    const cx = area.x + hueco * i + hueco / 2;
    const y = yDe(v);
    columna(ctx, cx - ancho1 / 2, y, ancho1, area.y + area.h - y, COLORES.serie);
    if (v > 0) {
      fuente(ctx, 6, 'bold');
      ctx.fillStyle = COLORES.tinta;
      ctx.textAlign = 'center';
      ctx.fillText(dineroCompacto(v).replace(' M', 'M'), cx, y - 5);
    }
    fuente(ctx, 6.5);
    ctx.fillStyle = COLORES.secundaria;
    ctx.textAlign = 'center';
    ctx.fillText(MESES_CORTOS[i], cx, area.y + area.h + 9);
  });
  return terminar(canvas, ancho, alto);
};

// ── 2. Pago acumulado contra el monto máximo ───────────────────────────────

export const graficaAcumulado = (r: ReportePagos, ancho = 370, alto = 200): Grafica => {
  const { canvas, ctx } = lienzo(ancho, alto);
  const area = { x: 42, y: 22, w: ancho - 50, h: alto - 44 };
  const meta = r.totales.montoMaximo;
  const { yDe } = ejeY(ctx, area, Math.max(meta, r.totales.pagado, 1), ejeYDinero);
  const hueco = area.w / 12;
  const xDe = (i: number) => area.x + hueco * i + hueco / 2;

  fuente(ctx, 6.5);
  ctx.fillStyle = COLORES.secundaria;
  ctx.textAlign = 'center';
  MESES_CORTOS.forEach((m, i) => ctx.fillText(m, xDe(i), area.y + area.h + 9));

  // Monto máximo total: línea de referencia.
  const yMeta = yDe(meta);
  ctx.strokeStyle = COLORES.secundaria;
  ctx.lineWidth = 0.75;
  ctx.setLineDash([3, 2]);
  ctx.beginPath();
  ctx.moveTo(area.x, yMeta);
  ctx.lineTo(area.x + area.w, yMeta);
  ctx.stroke();
  ctx.setLineDash([]);
  fuente(ctx, 6.5);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORES.secundaria;
  ctx.fillText(`Monto máximo total ${dineroCompacto(meta)}`, area.x + 2, yMeta - 6);

  const ultimo = ultimoMesConPago(r);
  if (ultimo >= 0) {
    const puntos = r.porMes.slice(0, ultimo + 1).map((m, i) => ({ x: xDe(i), y: yDe(m.acumulado) }));
    // Lavado del área (10 %).
    ctx.fillStyle = 'rgba(31,111,84,0.10)';
    ctx.beginPath();
    ctx.moveTo(puntos[0].x, yDe(0));
    puntos.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(puntos[puntos.length - 1].x, yDe(0));
    ctx.closePath();
    ctx.fill();
    // Línea de 2 px (1.5 pt).
    ctx.strokeStyle = COLORES.serie;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    puntos.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    // Marcadores con anillo blanco.
    puntos.forEach((p, i) => {
      const final = i === puntos.length - 1;
      ctx.fillStyle = COLORES.fondo;
      ctx.beginPath(); ctx.arc(p.x, p.y, final ? 3.6 : 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLORES.serie;
      ctx.beginPath(); ctx.arc(p.x, p.y, final ? 2.6 : 1.8, 0, Math.PI * 2); ctx.fill();
    });
    // Etiqueta sólo en el último punto.
    const fin = puntos[puntos.length - 1];
    const etiqueta = `${dineroCompacto(r.porMes[ultimo].acumulado)} · ${porcentaje(r.totales.avance)}`;
    fuente(ctx, 7, 'bold');
    ctx.fillStyle = COLORES.tinta;
    const w = ctx.measureText(etiqueta).width;
    const aDerecha = fin.x + 8 + w <= area.x + area.w;
    ctx.textAlign = aDerecha ? 'left' : 'right';
    ctx.fillText(etiqueta, aDerecha ? fin.x + 7 : fin.x - 7, fin.y - 9);
  }
  return terminar(canvas, ancho, alto);
};

// ── 3. Avance de los contratos de mayor monto ──────────────────────────────

export const graficaAvanceContratos = (servicios: ServicioReporte[], ancho = 730): Grafica => {
  const fila = 18;
  const alto = 26 + servicios.length * fila + 6;
  const { canvas, ctx } = lienzo(ancho, alto);
  const etiquetas = 250;
  const valores = 150;
  const x0 = etiquetas + 8;
  const largo = ancho - x0 - valores;
  const maximo = Math.max(...servicios.map((s) => Math.max(s.montoMaximo, s.pagado)), 1);

  leyenda(ctx, 0, 8, [
    { color: COLORES.serie, texto: 'Pagado' },
    { color: COLORES.pista, texto: 'Saldo restante (la barra completa es el monto máximo)' },
  ]);

  servicios.forEach((s, i) => {
    const y = 24 + i * fila;
    const centro = y + fila / 2;
    fuente(ctx, 7);
    ctx.fillStyle = COLORES.tinta;
    ctx.textAlign = 'left';
    ctx.fillText(recortar(ctx, s.servicio || 'Sin nombre', etiquetas), 0, centro - 4);
    fuente(ctx, 6);
    ctx.fillStyle = COLORES.tenue;
    ctx.fillText(recortar(ctx, s.contrato || `ID ${s.id}`, etiquetas), 0, centro + 4.5);

    const total = (Math.max(s.montoMaximo, s.pagado) / maximo) * largo;
    const pagado = (Math.min(s.pagado, Math.max(s.montoMaximo, s.pagado)) / maximo) * largo;
    const h = 8;
    barra(ctx, x0, centro - h / 2, total, h, COLORES.pista);
    if (pagado > 0) {
      // Hueco de superficie de 1.5 pt entre lo pagado y el saldo.
      const conHueco = pagado < total ? Math.max(0, pagado - 0.75) : pagado;
      barra(ctx, x0, centro - h / 2, conHueco, h, COLORES.serie);
      if (pagado < total) {
        ctx.fillStyle = COLORES.fondo;
        ctx.fillRect(x0 + conHueco, centro - h / 2, 1.5, h);
      }
    }
    fuente(ctx, 7, 'bold');
    ctx.fillStyle = COLORES.tinta;
    ctx.textAlign = 'left';
    const pct = porcentaje(s.avance);
    ctx.fillText(pct, x0 + total + 6, centro);
    const wPct = ctx.measureText(pct).width;
    fuente(ctx, 6.5);
    ctx.fillStyle = COLORES.secundaria;
    ctx.fillText(`${dineroCompacto(s.pagado)} de ${dineroCompacto(s.montoMaximo)}`, x0 + total + 6 + wPct + 5, centro);
  });
  return terminar(canvas, ancho, alto);
};

// ── 4. Contratos por rango de avance ───────────────────────────────────────

export const graficaRangos = (r: ReportePagos, ancho = 370, alto = 200): Grafica => {
  const { canvas, ctx } = lienzo(ancho, alto);
  const area = { x: 26, y: 14, w: ancho - 32, h: alto - 40 };
  const valores = r.rangos.map((x) => x.servicios);
  const { yDe } = ejeY(ctx, area, Math.max(...valores, 1), (v) => String(Math.round(v)));
  const hueco = area.w / valores.length;
  const ancho1 = Math.min(24, hueco * 0.5);
  valores.forEach((v, i) => {
    const cx = area.x + hueco * i + hueco / 2;
    const y = yDe(v);
    columna(ctx, cx - ancho1 / 2, y, ancho1, area.y + area.h - y, COLORES.rampa[i] ?? COLORES.serie);
    fuente(ctx, 7, 'bold');
    ctx.fillStyle = COLORES.tinta;
    ctx.textAlign = 'center';
    ctx.fillText(String(v), cx, y - 6);
    fuente(ctx, 6.5);
    ctx.fillStyle = COLORES.secundaria;
    ctx.fillText(r.rangos[i].etiqueta, cx, area.y + area.h + 9);
    ctx.fillStyle = COLORES.tenue;
    fuente(ctx, 6);
    ctx.fillText(dineroCompacto(r.rangos[i].monto), cx, area.y + area.h + 18);
  });
  return terminar(canvas, ancho, alto);
};

/** Barrita de avance para la tarjeta de "Avance global" (Word). */
export const graficaMedidor = (avance: number, ancho = 140, alto = 4): Grafica => {
  const { canvas, ctx } = lienzo(ancho, alto);
  const v = Math.max(0, Math.min(100, avance));
  ctx.fillStyle = COLORES.pista;
  ctx.beginPath(); ctx.roundRect(0, 0, ancho, alto, alto / 2); ctx.fill();
  if (v > 0) {
    ctx.fillStyle = COLORES.serie;
    ctx.beginPath(); ctx.roundRect(0, 0, Math.max(alto, (ancho * v) / 100), alto, alto / 2); ctx.fill();
  }
  return terminar(canvas, ancho, alto);
};

/** Los contratos que se grafican en "avance": los de mayor monto máximo. */
export const contratosDeMayorMonto = (r: ReportePagos, n = 12) =>
  [...r.servicios].filter((s) => s.montoMaximo > 0).sort((a, b) => b.montoMaximo - a.montoMaximo).slice(0, n);

export interface GraficasReporte {
  mensual: Grafica;
  acumulado: Grafica;
  rangos: Grafica;
  contratos: Grafica;
  /** Cuántos contratos entran en la gráfica de avance. */
  nContratos: number;
}

export const dibujarGraficas = (r: ReportePagos, anchoCompleto = 730): GraficasReporte => {
  const top = contratosDeMayorMonto(r);
  return {
    mensual: graficaPagosMensuales(r),
    acumulado: graficaAcumulado(r),
    rangos: graficaRangos(r, 370, 160),
    contratos: graficaAvanceContratos(top, anchoCompleto),
    nContratos: top.length,
  };
};
