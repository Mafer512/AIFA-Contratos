// Lógica de la ficha del servicio que no depende de React: cómo se liga cada
// pago con su servicio, cómo se leen las fechas y cómo se juzga el ritmo de
// ejercicio. Vive aparte para poder probarla sin navegador
// (scripts/test_ficha_servicio.mjs).

// ── Número de contrato ──────────────────────────────────────────────────────

/**
 * La parte del número de contrato que identifica al contrato, sin adornos.
 *
 * El mismo contrato llega escrito de varias formas entre la tabla de estatus y
 * la de pagos: "AIFA-C-AD-DO-SVS-004/2026." con punto final, "…-067-2026" con
 * guion en vez de diagonal, "…-029/2026 Y SU CONVENIO MODIFICATORIO 001/2026".
 * Compararlos tal cual sólo ligaba 24 de 39 pagos; con esto se ligan todos.
 *
 * "AIFA-C-LPN-DO-SVS-029/2026 y su convenio…" → "LPN-DO-SVS-29-2026"
 */
export const claveContrato = (valor: unknown): string => {
  const t = String(valor ?? '').toUpperCase().replace(/\s+/g, '');
  const m = t.match(/([A-Z]{2,4})-([A-Z]{2,4})-([A-Z]{2,4})-0*(\d{1,4})[/-](\d{4})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}-${m[4]}-${m[5]}` : '';
};

// ── Nombre del servicio ─────────────────────────────────────────────────────

const PALABRAS_VACIAS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'a', 'y', 'en', 'al', 'para', 'con', 'e', 'o', 'por',
  'sus', 'su', 'aifa', 'servicio', 'servicios',
]);

const palabrasClave = (s: unknown): Set<string> => new Set(
  String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !PALABRAS_VACIAS.has(w)),
);

/**
 * Qué tanto se parecen dos nombres de servicio, de 0 a 1: la proporción de
 * palabras con significado del nombre más corto que aparecen en el otro.
 * Ignora mayúsculas, acentos, puntuación y palabras como "servicio de".
 */
export const parecidoNombres = (a: unknown, b: unknown): number => {
  const A = palabrasClave(a);
  const B = palabrasClave(b);
  if (!A.size || !B.size) return 0;
  let comunes = 0;
  A.forEach((w) => { if (B.has(w)) comunes++; });
  return comunes / Math.min(A.size, B.size);
};

/** Por debajo de esto dos nombres no se consideran el mismo servicio. */
export const UMBRAL_NOMBRE = 0.8;

/**
 * Liga cada pago con el servicio al que pertenece.
 *
 * Primero por número de contrato (lo más confiable). Si el pago no trae uno
 * reconocible o no aparece en la tabla de estatus, por nombre, y sólo si hay
 * un candidato claro: con un empate se deja sin ligar antes que adivinar.
 *
 * Devuelve, para cada servicio (por su índice), los pagos que le tocan. Un
 * servicio puede tener varios: dos contratos de una misma adquisición.
 */
export const vincularPagos = <P, S>(
  pagos: readonly P[],
  servicios: readonly S[],
  pago: { contrato: (p: P) => unknown; nombre: (p: P) => unknown },
  servicio: { contrato: (s: S) => unknown; nombre: (s: S) => unknown },
): Map<number, P[]> => {
  const porClave = new Map<string, number>();
  servicios.forEach((s, i) => {
    const k = claveContrato(servicio.contrato(s));
    if (k && !porClave.has(k)) porClave.set(k, i);
  });

  const resultado = new Map<number, P[]>();
  const agregar = (i: number, p: P) => {
    const lista = resultado.get(i);
    if (lista) lista.push(p); else resultado.set(i, [p]);
  };

  pagos.forEach((p) => {
    const k = claveContrato(pago.contrato(p));
    const directo = k ? porClave.get(k) : undefined;
    if (directo !== undefined) { agregar(directo, p); return; }

    const nombre = pago.nombre(p);
    let mejor = -1;
    let mejorPuntaje = 0;
    let empate = false;
    servicios.forEach((s, i) => {
      const puntaje = parecidoNombres(nombre, servicio.nombre(s));
      if (puntaje < UMBRAL_NOMBRE) return;
      if (puntaje > mejorPuntaje) { mejor = i; mejorPuntaje = puntaje; empate = false; }
      else if (puntaje === mejorPuntaje) empate = true;
    });
    if (mejor >= 0 && !empate) agregar(mejor, p);
  });

  return resultado;
};

// ── Fechas ──────────────────────────────────────────────────────────────────

const MESES: Record<string, number> = {
  ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2, abr: 3, abril: 3, may: 4, mayo: 4,
  jun: 5, junio: 5, jul: 6, julio: 6, ago: 7, agosto: 7, sep: 8, sept: 8, septiembre: 8, set: 8,
  oct: 9, octubre: 9, nov: 10, noviembre: 10, dic: 11, diciembre: 11,
};

const fechaValida = (y: number, m: number, d: number): Date | null => {
  if (y < 100) y += 2000;
  const f = new Date(y, m, d);
  return f.getFullYear() === y && f.getMonth() === m && f.getDate() === d ? f : null;
};

/**
 * Lee una fecha como la captura la gente, en la zona local y a medianoche.
 *
 * En la tabla conviven "2026-07-28" y "31/12/2026". new Date("31/12/2026") da
 * fecha inválida (lo lee como mes 31) y new Date("01/02/2026") da 2 de enero:
 * por eso la ficha mostraba la vigencia sin semáforo. Aquí el formato con
 * diagonales es siempre día/mes/año, como se escribe en México.
 */
export const parseFechaFlexible = (valor: unknown): Date | null => {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
  const t = String(valor ?? '').trim().toLowerCase();
  if (!t || /^(n\/?a|na|s\/?f|sin\b.*|-+|—|pendiente.*)$/.test(t)) return null;

  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return fechaValida(+m[1], +m[2] - 1, +m[3]);

  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) return fechaValida(+m[3], +m[2] - 1, +m[1]);

  m = t.normalize('NFD').replace(/[̀-ͯ]/g, '').match(/^(\d{1,2})\s*(?:de\s+)?([a-z]+)\.?\s*(?:de(?:l)?\s+)?(\d{4})$/);
  if (m && MESES[m[2]] !== undefined) return fechaValida(+m[3], MESES[m[2]], +m[1]);

  return null;
};

const DIA_MS = 86_400_000;

/** Días de `desde` a `hasta`, redondeados (negativo si `hasta` ya pasó). */
export const diasEntre = (desde: Date, hasta: Date): number =>
  Math.round((hasta.getTime() - desde.getTime()) / DIA_MS);

// ── Ritmo de ejercicio ──────────────────────────────────────────────────────

export type EstadoRitmo = 'sin-datos' | 'por-iniciar' | 'en-ritmo' | 'lento' | 'adelantado' | 'concluido';

export interface Ritmo {
  estado: EstadoRitmo;
  /** % del plazo de la vigencia que ya transcurrió (0–100). */
  pctTiempo: number;
  /** % del monto máximo ya ejercido. */
  pctEjercido: number;
  /** Puntos de diferencia: ejercido − tiempo. */
  diferencia: number;
}

/**
 * ¿El gasto va al paso del contrato?
 *
 * Compara el porcentaje ejercido con el porcentaje del plazo que ya pasó. Los
 * pagos llegan con un mes de retraso (se paga lo del mes anterior), así que
 * una diferencia de hasta 15 puntos se considera normal. Más abajo hay riesgo
 * de subejercicio; más arriba, de que el dinero se acabe antes del término.
 */
export const ritmoDeEjercicio = (
  inicio: Date | null,
  fin: Date | null,
  ejercido: number,
  maximo: number,
  hoy: Date = new Date(),
): Ritmo => {
  const pctEjercido = maximo > 0 ? (ejercido / maximo) * 100 : 0;
  if (!inicio || !fin || fin <= inicio || maximo <= 0) {
    return { estado: 'sin-datos', pctTiempo: 0, pctEjercido, diferencia: 0 };
  }
  const total = fin.getTime() - inicio.getTime();
  const pctTiempo = Math.max(0, Math.min(100, ((hoy.getTime() - inicio.getTime()) / total) * 100));
  const diferencia = pctEjercido - pctTiempo;

  const estado: EstadoRitmo =
    hoy < inicio ? 'por-iniciar'
      : hoy > fin ? 'concluido'
        : diferencia < -15 ? 'lento'
          : diferencia > 15 ? 'adelantado'
            : 'en-ritmo';

  return { estado, pctTiempo, pctEjercido, diferencia };
};
