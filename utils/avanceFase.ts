// Avanzar un servicio por su proceso de contratación, y decidir qué servicios
// piden atención. Sin React: se prueba con scripts/test_avance_fase.mjs.
//
// El proceso es una secuencia fija de 9 fases. Cada fase tiene una columna de
// inicio y otra de término en estatus_<año>, y su nombre es el valor de la
// columna "Estatus" mientras el servicio está en ella. Por eso "avanzar" es un
// solo hecho ("terminó En IM el 8 de octubre") que toca tres celdas: el
// término de la fase actual, el inicio de la siguiente y el estatus.

export interface FaseProceso {
  /** Valor de "Estatus" mientras el servicio está en esta fase. */
  estatus: string;
  /** Columna con la fecha en que empezó. */
  inicio: string;
  /** Columna con la fecha en que terminó. */
  fin: string;
  area: 'DO' | 'DA';
}

/** Mismo orden y mismas columnas que GANTT_DATE_GROUPS en Dashboard. */
export const FASES: readonly FaseProceso[] = [
  { estatus: 'Elaboración de anexo técnico, administrativo y apéndices', inicio: 'Fecha inicio elaboración anexo técnico', fin: 'Fecha término elaboración anexo técnico', area: 'DO' },
  { estatus: 'En IM', inicio: 'Fecha remisión IM', fin: 'Fecha recepción IM', area: 'DA' },
  { estatus: 'Recepción de IM', inicio: 'Fecha recepción IM área técnica', fin: 'Fecha remisión área técnica', area: 'DO' },
  { estatus: 'Validación de IM por el área técnica', inicio: 'Fecha inicio validación IM', fin: 'Fecha término validación IM', area: 'DO' },
  { estatus: 'Envío de carpeta validada a RM', inicio: 'Fecha recepción carpeta validada', fin: 'Fecha remisión carpeta RM', area: 'DO' },
  { estatus: 'En revisión DEFENSA', inicio: 'Fecha envío revisión DEFENSA', fin: 'Fecha recepción revisión DEFENSA', area: 'DA' },
  { estatus: 'Atención de observaciones DEFENSA', inicio: 'Fecha inicio atención observaciones', fin: 'Fecha remisión observaciones', area: 'DO' },
  { estatus: 'Documentación actualizada para publicación', inicio: 'Fecha inicio documentación publicación', fin: 'Fecha remisión documentación publicación', area: 'DO' },
  { estatus: 'Publicado Compras MX', inicio: 'Fecha inicio publicación', fin: 'Fecha fallo', area: 'DA' },
];

export const ESTATUS_ADJUDICADO = 'Adjudicado';
export const ESTATUS_CANCELADO = 'Cancelado';

/** Índice de la etapa: -1 sin iniciar, 0..8 en proceso, 9 adjudicado, 10 cancelado. */
export const INDICE_ADJUDICADO = FASES.length;
export const INDICE_CANCELADO = FASES.length + 1;

const plano = (s: unknown) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** En qué etapa está un servicio según su "Estatus" (tolera acentos y mayúsculas). */
export const indiceEtapa = (estatus: unknown): number => {
  const e = plano(estatus);
  if (!e) return -1;
  if (e.includes('adjudicad') || e.includes('contratad')) return INDICE_ADJUDICADO;
  if (e.includes('cancelad')) return INDICE_CANCELADO;
  const exacto = FASES.findIndex((f) => plano(f.estatus) === e);
  if (exacto >= 0) return exacto;
  // Variantes capturadas a mano ("Elaboración de anexo técnico" sin el resto).
  const parcial = FASES.findIndex((f) => plano(f.estatus).startsWith(e) || e.startsWith(plano(f.estatus)));
  return parcial;
};

// ── Fechas ──────────────────────────────────────────────────────────────────

/** "2026-10-08" en hora local. */
export const aISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Lee "AAAA-MM-DD" (lo que guarda la base) como fecha local. */
export const deISO = (v: unknown): Date | null => {
  const m = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? null : d;
};

const DIA = 86_400_000;
export const diasEntre = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DIA);

const sinHora = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// ── Avanzar ─────────────────────────────────────────────────────────────────

export interface PlanAvance {
  /** Celdas a escribir: columna → valor. */
  cambios: Record<string, string | null>;
  /** Estatus al que pasa el servicio. */
  siguiente: string;
  /** Si pasa a Adjudicado, hay que pedir los datos del contrato. */
  pideAdjudicacion: boolean;
}

export type ResultadoAvance = { ok: true; plan: PlanAvance } | { ok: false; error: string };

/**
 * Qué hay que escribir para avanzar un servicio a la siguiente fase.
 *
 * @param fecha  Cuándo pasó (por omisión hoy).
 * @param inicioActual  Si la fase actual no tiene fecha de inicio capturada,
 *   la que diga la persona. Sin ella el Gantt dibujaría la fase sin principio.
 */
export const planAvanzar = (
  row: Record<string, any>,
  columnaEstatus: string,
  fecha: Date,
  hoy: Date = new Date(),
  inicioActual?: Date | null,
): ResultadoAvance => {
  const f = sinHora(fecha);
  if (f > sinHora(hoy)) return { ok: false, error: 'La fecha no puede ser futura: registra lo que ya pasó.' };

  const i = indiceEtapa(row[columnaEstatus]);
  if (i === INDICE_ADJUDICADO) return { ok: false, error: 'El servicio ya está adjudicado.' };
  if (i === INDICE_CANCELADO) return { ok: false, error: 'El servicio está cancelado.' };

  // Sin estatus: empieza la primera fase.
  if (i < 0) {
    return {
      ok: true,
      plan: {
        cambios: { [FASES[0].inicio]: aISO(f), [columnaEstatus]: FASES[0].estatus },
        siguiente: FASES[0].estatus,
        pideAdjudicacion: false,
      },
    };
  }

  const actual = FASES[i];
  const inicio = deISO(row[actual.inicio]) ?? (inicioActual ? sinHora(inicioActual) : null);
  if (inicio && f < inicio) {
    return { ok: false, error: `No puede terminar antes de que empezara (${inicio.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}).` };
  }

  const cambios: Record<string, string | null> = { [actual.fin]: aISO(f) };
  if (!deISO(row[actual.inicio]) && inicioActual) cambios[actual.inicio] = aISO(sinHora(inicioActual));

  if (i === FASES.length - 1) {
    // Publicado → Adjudicado: el término de la publicación es la fecha del fallo.
    cambios[columnaEstatus] = ESTATUS_ADJUDICADO;
    return { ok: true, plan: { cambios, siguiente: ESTATUS_ADJUDICADO, pideAdjudicacion: true } };
  }

  const siguiente = FASES[i + 1];
  cambios[siguiente.inicio] = aISO(f);
  cambios[columnaEstatus] = siguiente.estatus;
  return { ok: true, plan: { cambios, siguiente: siguiente.estatus, pideAdjudicacion: false } };
};

/** Lo que tenían las celdas antes de un cambio, para poder deshacerlo. */
export const valoresPrevios = (row: Record<string, any>, cambios: Record<string, unknown>) =>
  Object.fromEntries(Object.keys(cambios).map((k) => [k, row[k] ?? null]));

// ── Atención ────────────────────────────────────────────────────────────────

/** Días típicos de cada fase: la mediana de las fases ya terminadas. */
export const duracionesTipicas = (rows: readonly Record<string, any>[]): number[] =>
  FASES.map((f) => {
    const dias = rows
      .map((r) => {
        const a = deISO(r[f.inicio]);
        const b = deISO(r[f.fin]);
        return a && b && b >= a ? diasEntre(a, b) : null;
      })
      .filter((d): d is number => d !== null)
      .sort((x, y) => x - y);
    if (!dias.length) return 0;
    const m = Math.floor(dias.length / 2);
    return dias.length % 2 ? dias[m] : Math.round((dias[m - 1] + dias[m]) / 2);
  });

export type Alerta =
  | { tipo: 'sin-iniciar' }
  | { tipo: 'fase-larga'; dias: number; tipica: number }
  | { tipo: 'sin-movimiento'; dias: number }
  | { tipo: 'vence'; dias: number }
  | { tipo: 'vencido'; dias: number }
  | { tipo: 'garantias'; faltan: number }
  | { tipo: 'datos-contrato'; faltan: string[] };

/** Peso para ordenar la bandeja: lo urgente primero. */
const PESO: Record<Alerta['tipo'], number> = {
  vencido: 90, 'fase-larga': 70, vence: 60, garantias: 55, 'datos-contrato': 50, 'sin-movimiento': 40, 'sin-iniciar': 20,
};

export interface EstadoServicio {
  indice: number;
  /** Días que lleva en la fase actual (si tiene fecha de inicio). */
  diasEnFase: number | null;
  inicioFase: Date | null;
  alertas: Alerta[];
  puntaje: number;
}

export interface OpcionesEstado {
  columnaEstatus: string;
  hoy?: Date;
  /** Mediana de días por fase (duracionesTipicas). */
  tipicas: number[];
  /** Última vez que se tocó el servicio. */
  actualizado?: Date | null;
  vigenciaTermino?: Date | null;
  garantiasFaltantes?: number;
  /** Datos del contrato que faltan, ya en palabras ("número de contrato"). */
  datosFaltantes?: string[];
}

/** Dónde está el servicio y qué de él pide atención. */
export const estadoServicio = (row: Record<string, any>, o: OpcionesEstado): EstadoServicio => {
  const hoy = sinHora(o.hoy ?? new Date());
  const indice = indiceEtapa(row[o.columnaEstatus]);
  const alertas: Alerta[] = [];
  let diasEnFase: number | null = null;
  let inicioFase: Date | null = null;

  if (indice < 0) alertas.push({ tipo: 'sin-iniciar' });

  if (indice >= 0 && indice < FASES.length) {
    inicioFase = deISO(row[FASES[indice].inicio]);
    if (inicioFase) {
      diasEnFase = Math.max(0, diasEntre(inicioFase, hoy));
      const tipica = o.tipicas[indice] ?? 0;
      // "Más de lo normal": al menos una semana y media vez más que lo típico.
      if (tipica > 0 && diasEnFase > Math.max(tipica * 1.5, tipica + 7)) {
        alertas.push({ tipo: 'fase-larga', dias: diasEnFase, tipica });
      }
    }
  }

  if (indice === INDICE_ADJUDICADO) {
    if (o.vigenciaTermino) {
      const d = diasEntre(hoy, sinHora(o.vigenciaTermino));
      if (d < 0) alertas.push({ tipo: 'vencido', dias: -d });
      else if (d <= 30) alertas.push({ tipo: 'vence', dias: d });
    }
    if (o.garantiasFaltantes) alertas.push({ tipo: 'garantias', faltan: o.garantiasFaltantes });
    if (o.datosFaltantes?.length) alertas.push({ tipo: 'datos-contrato', faltan: o.datosFaltantes });
  }

  if (indice !== INDICE_CANCELADO && o.actualizado) {
    const d = diasEntre(sinHora(o.actualizado), hoy);
    // Un adjudicado vigente puede pasar meses sin cambios y está bien.
    if (d >= 15 && indice < INDICE_ADJUDICADO) alertas.push({ tipo: 'sin-movimiento', dias: d });
  }

  const puntaje = alertas.reduce((n, a) => n + PESO[a.tipo], 0) + (indice === INDICE_CANCELADO ? -100 : 0);
  return { indice, diasEnFase, inicioFase, alertas, puntaje };
};
