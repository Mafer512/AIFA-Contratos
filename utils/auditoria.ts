// Lógica del módulo de Auditoría que no depende de React: las letras, los
// conteos de cada renglón, qué meses caen en la vigencia del contrato y cómo
// se lee la hoja de Excel que ya lleva el área. Vive aparte para poder
// probarla sin navegador (scripts/test_auditoria.mjs).

// Con extensión: así también la carga Node en las pruebas.
import { claveContrato, vincularPagos } from './fichaServicio.ts';

// ── Letras ──────────────────────────────────────────────────────────────────

export type Estado = 'C' | 'R' | 'E' | 'N';

export const ESTADOS: Estado[] = ['C', 'R', 'E', 'N'];

export const ESTADO_INFO: Record<Estado, { etiqueta: string; corta: string }> = {
  C: { etiqueta: 'Completo', corta: 'Completo' },
  R: { etiqueta: 'Revisado', corta: 'Revisado' },
  E: { etiqueta: 'En revisión', corta: 'En rev.' },
  N: { etiqueta: 'No aplica', corta: 'No aplica' },
};

/**
 * La letra que quiso poner quien capturó: "C", "c", " Completo ", "en
 * revisión", "N/A"… Lo que no se reconoce regresa null.
 */
export const letraDe = (valor: unknown): Estado | null => {
  const t = String(valor ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toUpperCase();
  if (!t) return null;
  if (t === 'C' || t.startsWith('COMPLET')) return 'C';
  if (t === 'R' || t === 'REVISADO' || t === 'REVISADA') return 'R';
  if (t === 'E' || t.startsWith('EN REVISION') || t === 'EN PROCESO') return 'E';
  if (t === 'N' || t === 'N/A' || t === 'NA' || t.startsWith('NO APLICA')) return 'N';
  return null;
};

// ── Meses ───────────────────────────────────────────────────────────────────

export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** El número de mes (1-12) de un encabezado: "enero", "Ene.", "SEPT", "Setiembre". */
export const mesDeEncabezado = (valor: unknown): number | null => {
  const t = String(valor ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z]/g, '');
  if (t.length < 3) return null;
  if (t.startsWith('set')) return 9;
  const i = MESES.findIndex((m) => m === t || (t.length <= 5 && m.startsWith(t)));
  return i >= 0 ? i + 1 : null;
};

/**
 * Los meses (1-12) del año que caen dentro de la vigencia del contrato.
 * Sin fechas no se sabe: regresa null y la pantalla trata todo el año igual.
 */
export const mesesEnVigencia = (inicio: Date | null, fin: Date | null, anio: number): Set<number> | null => {
  if (!inicio && !fin) return null;
  const desde = inicio && inicio.getFullYear() === anio ? inicio.getMonth() + 1 : inicio && inicio.getFullYear() > anio ? 13 : 1;
  const hasta = fin && fin.getFullYear() === anio ? fin.getMonth() + 1 : fin && fin.getFullYear() < anio ? 0 : 12;
  const meses = new Set<number>();
  for (let m = desde; m <= hasta; m++) meses.add(m);
  return meses;
};

/**
 * Hasta qué mes ya "cerró" el año: el anterior al actual en el año en curso,
 * diciembre en un año pasado y ninguno en uno futuro. Un mes cerrado sin letra
 * es un mes por registrar.
 */
export const ultimoMesCerrado = (anio: number, hoy: Date = new Date()): number => {
  if (anio < hoy.getFullYear()) return 12;
  if (anio > hoy.getFullYear()) return 0;
  return hoy.getMonth(); // getMonth() es 0-based: en octubre (9) ya cerró septiembre (9).
};

// ── Conteos ─────────────────────────────────────────────────────────────────

export interface Conteo { C: number; R: number; E: number; N: number; total: number }

export const conteoVacio = (): Conteo => ({ C: 0, R: 0, E: 0, N: 0, total: 0 });

/** Cuántas celdas de cada letra hay entre las dadas. */
export const contar = (letras: Iterable<Estado | null | undefined>): Conteo => {
  const c = conteoVacio();
  for (const l of letras) {
    if (!l) continue;
    c[l]++;
    c.total++;
  }
  return c;
};

/** Meses cerrados, en vigencia y sin letra. */
export const mesesPorRegistrar = (
  letras: Record<number, Estado | undefined>,
  vigencia: Set<number> | null,
  cerrado: number,
): number[] => {
  const faltan: number[] = [];
  for (let m = 1; m <= cerrado; m++) {
    if (vigencia && !vigencia.has(m)) continue;
    if (!letras[m]) faltan.push(m);
  }
  return faltan;
};

// ── Contratos ───────────────────────────────────────────────────────────────

/** Llave para reconocer el mismo contrato escrito distinto (punto final, "-" o "/"…). */
export const llaveContrato = (contrato: unknown): string =>
  claveContrato(contrato) || String(contrato ?? '').toUpperCase().replace(/\s+/g, '').replace(/\.+$/, '');

/** Quita el punto final y los espacios de más, como lo guarda la base. */
export const limpiarContrato = (contrato: unknown): string =>
  String(contrato ?? '').replace(/\s+/g, ' ').trim().replace(/\.+$/, '');

/** El año que dice el número de contrato ("…-139/2025" → 2025). */
export const anioDeContrato = (contrato: unknown): number | null => {
  const k = claveContrato(contrato);
  if (k) return Number(k.slice(-4));
  const m = String(contrato ?? '').match(/(20\d{2})\D*$/);
  return m ? Number(m[1]) : null;
};

/**
 * Orden "natural" de contratos: primero por tipo (SVS antes que ADQ, LPN
 * antes que AD) y luego por número, de modo que 9 vaya antes que 10.
 */
export const compararContratos = (a: string, b: string): number => {
  const ka = claveContrato(a);
  const kb = claveContrato(b);
  if (ka && kb) {
    const [pa, , ta, na] = ka.split('-');
    const [pb, , tb, nb] = kb.split('-');
    if (ta !== tb) return ta === 'SVS' ? -1 : tb === 'SVS' ? 1 : ta.localeCompare(tb);
    if (pa !== pb) return pa === 'LPN' ? -1 : pb === 'LPN' ? 1 : pa.localeCompare(pb);
    return Number(na) - Number(nb);
  }
  if (ka) return -1;
  if (kb) return 1;
  return a.localeCompare(b, 'es', { numeric: true });
};

// ── Importar la hoja de Excel ───────────────────────────────────────────────

export interface FilaImportada {
  contrato: string;
  descripcion: string | null;
  proveedor: string | null;
  observacion: string | null;
  letras: Record<number, Estado>;
  /** Renglón de la hoja (1-based), para avisar dónde está algo raro. */
  renglon: number;
}

export interface HojaLeida {
  filas: FilaImportada[];
  /** El año que dicen la mayoría de los contratos, si se puede saber. */
  anio: number | null;
  avisos: string[];
}

const norm = (v: unknown) =>
  String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const texto = (v: unknown): string | null => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  return t || null;
};

/**
 * Lee la hoja de control como la lleva el área (una matriz de celdas ya en
 * texto, renglón por renglón). No exige un formato exacto:
 *   · el encabezado es el renglón que dice "Contrato" o "Pedido" (puede haber
 *     títulos arriba);
 *   · los meses pueden estar en ese renglón o en el de arriba (en la hoja
 *     original van girados en un renglón aparte);
 *   · "Observaciones" puede tener encabezado o ser la columna de texto que va
 *     después de "Total" sin encabezado, como en la hoja original;
 *   · la leyenda de abajo (C Completo, R Revisado…) no se toma como servicio.
 */
export const leerHojaAuditoria = (celdas: unknown[][]): HojaLeida => {
  const avisos: string[] = [];
  const limite = Math.min(celdas.length, 25);

  let filaEnc = -1;
  let colContrato = -1;
  for (let r = 0; r < limite && filaEnc < 0; r++) {
    const fila = celdas[r] ?? [];
    for (let c = 0; c < fila.length; c++) {
      const t = norm(fila[c]);
      if (/contrato|pedido/.test(t) && t.length <= 40) { filaEnc = r; colContrato = c; break; }
    }
  }
  if (filaEnc < 0) {
    return { filas: [], anio: null, avisos: ['No encontré la columna "No. Contrato o Pedido". Revisa que sea la hoja de control de Auditoría.'] };
  }

  const enc = celdas[filaEnc] ?? [];
  const arriba = filaEnc > 0 ? (celdas[filaEnc - 1] ?? []) : [];
  const ancho = Math.max(enc.length, arriba.length);
  const buscar = (re: RegExp) => {
    for (let c = 0; c < ancho; c++) if (c !== colContrato && re.test(norm(enc[c]))) return c;
    return -1;
  };
  const colDescripcion = buscar(/descrip|objeto|concepto/);
  const colProveedor = buscar(/proveedor|empresa|razon social/);

  const colMes: Record<number, number> = {};
  for (let c = 0; c < ancho; c++) {
    const m = mesDeEncabezado(enc[c]) ?? mesDeEncabezado(arriba[c]);
    if (m && colMes[m] === undefined && c !== colContrato && c !== colDescripcion && c !== colProveedor) colMes[m] = c;
  }
  const mesesHallados = Object.keys(colMes).length;
  if (mesesHallados === 0) avisos.push('No encontré las columnas de los meses: sólo se leerán los servicios, sin letras.');
  else if (mesesHallados < 12) avisos.push(`Sólo encontré ${mesesHallados} de 12 meses en el encabezado.`);

  let colObservacion = buscar(/observ|nota|comentario/);
  if (colObservacion < 0) {
    const colTotal = buscar(/^total$/);
    if (colTotal >= 0) colObservacion = colTotal + 1;
  }

  const filas: FilaImportada[] = [];
  const vistos = new Map<string, number>();
  const conteoAnios = new Map<number, number>();
  let raras = 0;

  for (let r = filaEnc + 1; r < celdas.length; r++) {
    const fila = celdas[r] ?? [];
    const contrato = limpiarContrato(fila[colContrato]);
    if (!contrato) continue;
    // La leyenda de abajo: "C | Completo", "R | Revisado"… no son contratos.
    if (contrato.length <= 2 && !/\d/.test(contrato)) continue;
    if (!/\d/.test(contrato)) continue;

    const llave = llaveContrato(contrato);
    if (vistos.has(llave)) {
      avisos.push(`El contrato ${contrato} viene dos veces (renglones ${vistos.get(llave)} y ${r + 1}); se toma el primero.`);
      continue;
    }
    vistos.set(llave, r + 1);

    const letras: Record<number, Estado> = {};
    for (const [m, c] of Object.entries(colMes)) {
      const bruto = fila[c];
      const l = letraDe(bruto);
      if (l) letras[Number(m)] = l;
      else if (texto(bruto)) raras++;
    }
    const anio = anioDeContrato(contrato);
    if (anio) conteoAnios.set(anio, (conteoAnios.get(anio) ?? 0) + 1);

    filas.push({
      contrato,
      descripcion: colDescripcion >= 0 ? texto(fila[colDescripcion]) : null,
      proveedor: colProveedor >= 0 ? texto(fila[colProveedor]) : null,
      observacion: colObservacion >= 0 ? texto(fila[colObservacion]) : null,
      letras,
      renglon: r + 1,
    });
  }

  if (raras) avisos.push(`${raras} celda${raras !== 1 ? 's' : ''} de mes con algo distinto de C, R, E o N se ignoraron.`);
  if (!filas.length) avisos.push('La hoja no trae ningún contrato debajo del encabezado.');

  let anio: number | null = null;
  let mas = 0;
  conteoAnios.forEach((n, a) => { if (n > mas) { mas = n; anio = a; } });

  return { filas, anio, avisos };
};

// ── Qué cambiaría una importación ───────────────────────────────────────────

export interface ServicioExistente {
  id: number;
  /** null = aún sin contrato: la hoja de Excel no lo puede reconocer. */
  contrato: string | null;
  descripcion: string | null;
  proveedor: string | null;
  observacion: string | null;
  orden: number | null;
}

export interface PlanImportacion {
  nuevos: FilaImportada[];
  actualizados: { id: number; fila: FilaImportada; cambios: Partial<ServicioExistente> }[];
  /** Letras a escribir, ya ligadas: servicioId es null si el servicio es nuevo. */
  letras: { servicioId: number | null; contrato: string; mes: number; estado: Estado; antes: Estado | null }[];
  letrasNuevas: number;
  letrasQueCambian: number;
  letrasIguales: number;
}

/**
 * Compara la hoja con lo que ya hay en el año. Nunca borra: una celda vacía
 * en el archivo deja la letra que ya estaba en el sistema, y una descripción
 * vacía no borra la que ya hay.
 */
export const planearImportacion = (
  filas: FilaImportada[],
  existentes: ServicioExistente[],
  letrasActuales: (servicioId: number, mes: number) => Estado | null,
): PlanImportacion => {
  const porLlave = new Map(existentes.filter((s) => s.contrato).map((s) => [llaveContrato(s.contrato), s]));
  const plan: PlanImportacion = { nuevos: [], actualizados: [], letras: [], letrasNuevas: 0, letrasQueCambian: 0, letrasIguales: 0 };

  filas.forEach((fila, i) => {
    const orden = i + 1;
    const existe = porLlave.get(llaveContrato(fila.contrato));
    if (!existe) {
      plan.nuevos.push(fila);
    } else {
      const cambios: Partial<ServicioExistente> = {};
      if (fila.descripcion && fila.descripcion !== existe.descripcion) cambios.descripcion = fila.descripcion;
      if (fila.proveedor && fila.proveedor !== existe.proveedor) cambios.proveedor = fila.proveedor;
      if (fila.observacion && fila.observacion !== existe.observacion) cambios.observacion = fila.observacion;
      if (existe.orden !== orden) cambios.orden = orden;
      if (Object.keys(cambios).length) plan.actualizados.push({ id: existe.id, fila, cambios });
    }
    for (const [m, estado] of Object.entries(fila.letras)) {
      const mes = Number(m);
      const antes = existe ? letrasActuales(existe.id, mes) : null;
      if (antes === estado) { plan.letrasIguales++; continue; }
      if (antes) plan.letrasQueCambian++; else plan.letrasNuevas++;
      plan.letras.push({ servicioId: existe?.id ?? null, contrato: fila.contrato, mes, estado, antes });
    }
  });
  return plan;
};

// ── Pegar desde Excel ───────────────────────────────────────────────────────

/**
 * Lo que trae el portapapeles al copiar un bloque de celdas en Excel: texto
 * separado por tabuladores y saltos de línea. Cada celda queda como letra,
 * null (vacía, borra) o undefined (no se entiende: no toca esa celda).
 */
export const leerPegado = (textoPegado: string): (Estado | null | undefined)[][] => {
  const lineas = textoPegado.replace(/\r\n?/g, '\n').split('\n');
  if (lineas.length > 1 && lineas[lineas.length - 1] === '') lineas.pop();
  return lineas.map((linea) => linea.split('\t').map((celda) => {
    if (!celda.trim()) return null;
    return letraDe(celda) ?? undefined;
  }));
};

// ── Servicios del año: Estatus + Pagos ──────────────────────────────────────

/**
 * Un servicio que podría auditarse, ya juntando lo que dice Estatus <año> (los
 * servicios del año, contratados o todavía en proceso) con lo que dice Pagos
 * (los contratos firmados). Un servicio de Estatus ligado a su pago es uno
 * solo: con el número de contrato y las fechas del pago.
 */
export interface FuenteServicio {
  contrato: string | null;
  descripcion: string | null;
  proveedor: string | null;
  inicio: Date | null;
  fin: Date | null;
  /** "ID" de estatus_<anio>; null si sólo viene de Pagos. */
  estatusId: number | null;
  /** Estatus del proceso en Estatus <año> ("En IM", "Adjudicado"…). */
  fase: string | null;
  cancelado: boolean;
  origen: 'estatus' | 'pagos' | 'ambos';
}

export interface EstatusEntrada {
  id: number;
  nombre: string | null;
  contrato: string | null;
  proveedor: string | null;
  inicio: Date | null;
  fin: Date | null;
  fase: string | null;
}

export interface PagoEntrada {
  contrato: string;
  descripcion: string | null;
  proveedor: string | null;
  inicio: Date | null;
  fin: Date | null;
}

const textoONulo = (v: unknown): string | null => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  return t && !/^(n\/?a|-+|—|sin contrato|pendiente)$/i.test(t) ? t : null;
};

export const fuentesDelAnio = (pagos: readonly PagoEntrada[], estatusTodos: readonly EstatusEntrada[]): FuenteServicio[] => {
  // Renglones en blanco de Estatus (sin nombre ni contrato) no son servicios.
  const estatus = estatusTodos.filter((e) => textoONulo(e.nombre) || textoONulo(e.contrato));
  const ligados = vincularPagos(
    pagos, estatus,
    { contrato: (p) => p.contrato, nombre: (p) => p.descripcion },
    { contrato: (e) => e.contrato, nombre: (e) => e.nombre },
  );
  const usados = new Set<PagoEntrada>();
  const fuentes: FuenteServicio[] = estatus.map((e, i) => {
    // Con dos contratos para un mismo servicio, el primero se queda con el
    // renglón de Estatus y los demás entran aparte (de Pagos).
    const p = ligados.get(i)?.[0];
    if (p) usados.add(p);
    const fase = textoONulo(e.fase);
    return {
      contrato: p ? limpiarContrato(p.contrato) : (textoONulo(e.contrato) ? limpiarContrato(e.contrato) : null),
      descripcion: textoONulo(e.nombre) ?? p?.descripcion ?? null,
      proveedor: p?.proveedor ?? textoONulo(e.proveedor),
      inicio: p?.inicio ?? e.inicio,
      fin: p?.fin ?? e.fin,
      estatusId: e.id,
      fase,
      cancelado: /cancel/i.test(fase ?? ''),
      origen: p ? 'ambos' : 'estatus',
    };
  });
  pagos.forEach((p) => {
    if (usados.has(p)) return;
    fuentes.push({
      contrato: limpiarContrato(p.contrato), descripcion: p.descripcion, proveedor: p.proveedor,
      inicio: p.inicio, fin: p.fin, estatusId: null, fase: null, cancelado: false, origen: 'pagos',
    });
  });
  return fuentes;
};

export interface ServicioAuditado {
  id: number;
  contrato: string | null;
  proveedor: string | null;
  estatus_id: number | null;
}

/** La fuente que corresponde a un servicio ya auditado: por su liga a Estatus o por contrato. */
export const fuenteDe = (s: ServicioAuditado, fuentes: readonly FuenteServicio[]): FuenteServicio | undefined => {
  if (s.estatus_id != null) {
    const f = fuentes.find((x) => x.estatusId === s.estatus_id);
    if (f) return f;
  }
  const k = s.contrato ? llaveContrato(s.contrato) : '';
  return k ? fuentes.find((x) => x.contrato && llaveContrato(x.contrato) === k) : undefined;
};

export interface PendientesDelAnio {
  /** Servicios del año que todavía no están en Auditoría. */
  nuevos: FuenteServicio[];
  /** Servicios ya auditados que ganaron contrato (o la liga a Estatus). */
  actualizar: { id: number; cambios: { contrato?: string; proveedor?: string; estatus_id?: number }; ganaContrato: boolean }[];
}

export const pendientesDelAnio = (fuentes: readonly FuenteServicio[], existentes: readonly ServicioAuditado[]): PendientesDelAnio => {
  const nuevos: FuenteServicio[] = [];
  const actualizar: PendientesDelAnio['actualizar'] = [];
  const tomados = new Set<number>();
  fuentes.forEach((f) => {
    const k = f.contrato ? llaveContrato(f.contrato) : '';
    const e = existentes.find((x) => !tomados.has(x.id) && (
      (f.estatusId != null && x.estatus_id === f.estatusId) || (!!k && !!x.contrato && llaveContrato(x.contrato) === k)));
    if (!e) { nuevos.push(f); return; }
    tomados.add(e.id);
    const cambios: PendientesDelAnio['actualizar'][number]['cambios'] = {};
    if (!e.contrato && f.contrato) cambios.contrato = f.contrato;
    if (!e.proveedor && f.proveedor) cambios.proveedor = f.proveedor;
    if (e.estatus_id == null && f.estatusId != null) cambios.estatus_id = f.estatusId;
    if (Object.keys(cambios).length) actualizar.push({ id: e.id, cambios, ganaContrato: !!cambios.contrato });
  });
  return { nuevos, actualizar };
};
