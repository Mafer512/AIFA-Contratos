// Estructura orgánica de la Gerencia de Proyectos y Concursos.
//
// La jerarquía se guarda con `reportaA`, que apunta al catalogValue del jefe.
// Un árbol construido con referencias al padre —y no con listas de subordinados
// dentro de cada jefe— es el que aguanta la operación real: cuando alguien
// cambia de equipo se toca un solo campo, y no hay forma de que una persona
// acabe colgando de dos coordinadores a la vez.
//
// El color NO es decorativo: es el mismo código con el que el área lee su
// plantilla en Excel, donde cada coordinación tiene su banda. Se conserva para
// que quien ya conoce ese documento reconozca los equipos de un vistazo.

export type NivelOrganico = 'GERENTE' | 'COORDINADOR' | 'COLABORADOR';

export interface EquipoColor {
  /** Fondo de la tarjeta. */
  fondo: string;
  /** Borde y acentos. */
  borde: string;
  /** Texto sobre el fondo. */
  texto: string;
  /** Banda sólida del encabezado del equipo. */
  banda: string;
}

/** Paleta por coordinación, tomada de la plantilla en Excel del área. */
export const COLORES_EQUIPO: Record<string, EquipoColor> = {
  gerencia: { fondo: '#F8FAFC', borde: '#0F4C3A', texto: '#0F4C3A', banda: '#0F4C3A' },
  azul:     { fondo: '#DBEAFE', borde: '#93C5FD', texto: '#1E40AF', banda: '#2563EB' },
  verde:    { fondo: '#DCFCE7', borde: '#86EFAC', texto: '#166534', banda: '#16A34A' },
  durazno:  { fondo: '#FFE4D6', borde: '#FDBA8C', texto: '#9A3412', banda: '#EA580C' },
  sinEquipo:{ fondo: '#F1F5F9', borde: '#CBD5E1', texto: '#475569', banda: '#64748B' },
};

export type ClaveColor = keyof typeof COLORES_EQUIPO;

export interface DatosOrganicos {
  /** Número de partida en la plantilla oficial; define el orden dentro del equipo. */
  partida: number;
  puesto: string;
  nivelSalarial: string;
  nivelOrganico: NivelOrganico;
  /** catalogValue del jefe directo. null sólo para el gerente. */
  reportaA: string | null;
  /** Banda de color de su coordinación. */
  color: ClaveColor;
  /** false cuando la persona ya no está en el área, pero su historial se conserva. */
  activo: boolean;
}

/**
 * Datos orgánicos por persona, indexados por catalogValue.
 *
 * Es el respaldo que se usa cuando la tabla `responsables` de Supabase todavía
 * no existe o no tiene a alguien. En cuanto la tabla responde, lo que venga de
 * ahí manda: es lo que el área puede editar sin tocar código.
 */
export const ORGANIGRAMA_BASE: Record<string, DatosOrganicos> = {
  // ── Gerencia ──────────────────────────────────────────────────────────────
  'SAMUEL GÓMEZ CERRADA': {
    partida: 1, puesto: 'Gerente de Proyectos y Concursos', nivelSalarial: 'N32',
    nivelOrganico: 'GERENTE', reportaA: null, color: 'gerencia', activo: true,
  },

  // ── Coordinación azul ─────────────────────────────────────────────────────
  'DANIELA ELIZABETH MERCADO ISLAS': {
    partida: 2, puesto: 'Coordinador de Área Técnica', nivelSalarial: 'N6',
    nivelOrganico: 'COORDINADOR', reportaA: 'SAMUEL GÓMEZ CERRADA', color: 'azul', activo: true,
  },
  'GILBERTO AYALA RAMÍREZ': {
    partida: 7, puesto: 'Especialista en Contrataciones y Adquisiciones Públicas', nivelSalarial: 'N5',
    nivelOrganico: 'COLABORADOR', reportaA: 'DANIELA ELIZABETH MERCADO ISLAS', color: 'azul', activo: true,
  },
  'MONSERRAT ALONSO MARTÍNEZ': {
    partida: 10, puesto: 'Profesional de Servicios Especializados Aeroportuarios', nivelSalarial: 'N4',
    nivelOrganico: 'COLABORADOR', reportaA: 'DANIELA ELIZABETH MERCADO ISLAS', color: 'azul', activo: true,
  },
  'IRMA KARINA VARGAS GARCÍA': {
    partida: 11, puesto: 'Profesional Ejecutivo Aeroportuario', nivelSalarial: 'N4',
    nivelOrganico: 'COLABORADOR', reportaA: 'DANIELA ELIZABETH MERCADO ISLAS', color: 'azul', activo: true,
  },

  // ── Coordinación verde ────────────────────────────────────────────────────
  'MARTHA CASTELÁN GARCÍA': {
    partida: 3, puesto: 'Coordinador de Área Técnica', nivelSalarial: 'N6',
    nivelOrganico: 'COORDINADOR', reportaA: 'SAMUEL GÓMEZ CERRADA', color: 'verde', activo: true,
  },
  'ADRIANA PÉREZ MALDONADO': {
    partida: 5, puesto: 'Profesional Ejecutivo en Contaduría Pública', nivelSalarial: 'N5',
    nivelOrganico: 'COLABORADOR', reportaA: 'MARTHA CASTELÁN GARCÍA', color: 'verde', activo: true,
  },
  'SAMMANTHA DELGADO SERRANO': {
    partida: 8, puesto: 'Supervisor de Seguridad Aeroportuaria', nivelSalarial: 'N5',
    nivelOrganico: 'COLABORADOR', reportaA: 'MARTHA CASTELÁN GARCÍA', color: 'verde', activo: true,
  },
  'DAYREN FLORICELA DE LEÓN GONZÁLEZ': {
    partida: 13, puesto: 'Profesional de Servicios Especializados Aeroportuarios', nivelSalarial: 'N4',
    nivelOrganico: 'COLABORADOR', reportaA: 'MARTHA CASTELÁN GARCÍA', color: 'verde', activo: true,
  },
  'MARI CARMEN ALVAREZ REYES': {
    partida: 14, puesto: 'Archivista', nivelSalarial: 'N4',
    nivelOrganico: 'COLABORADOR', reportaA: 'MARTHA CASTELÁN GARCÍA', color: 'verde', activo: true,
  },

  // ── Coordinación durazno ──────────────────────────────────────────────────
  'ARACELI ESMERALDA SÁNCHEZ TORRES': {
    partida: 4, puesto: 'Coordinador de Área Técnica', nivelSalarial: 'N6',
    nivelOrganico: 'COORDINADOR', reportaA: 'SAMUEL GÓMEZ CERRADA', color: 'durazno', activo: true,
  },
  'LILIAN ELIZABETH PÉREZ GONZÁLEZ': {
    partida: 6, puesto: 'Profesional Ejecutivo en Contaduría Pública', nivelSalarial: 'N5',
    nivelOrganico: 'COLABORADOR', reportaA: 'ARACELI ESMERALDA SÁNCHEZ TORRES', color: 'durazno', activo: true,
  },
  'ESMERALDA EMILY RODRÍGUEZ MARTÍNEZ': {
    partida: 9, puesto: 'Especialista en Contrataciones y Adquisiciones Públicas', nivelSalarial: 'N5',
    nivelOrganico: 'COLABORADOR', reportaA: 'ARACELI ESMERALDA SÁNCHEZ TORRES', color: 'durazno', activo: true,
  },
  'SANDY OSIRIS MENDOZA LEONIDEZ': {
    partida: 12, puesto: 'Profesional de Servicios Especializados Aeroportuarios', nivelSalarial: 'N4',
    nivelOrganico: 'COLABORADOR', reportaA: 'ARACELI ESMERALDA SÁNCHEZ TORRES', color: 'durazno', activo: true,
  },
};

/** Etiqueta legible de cada nivel, para insignias y formularios. */
export const ETIQUETA_NIVEL: Record<NivelOrganico, string> = {
  GERENTE: 'Gerente',
  COORDINADOR: 'Coordinador',
  COLABORADOR: 'Colaborador',
};

/** Orden de los colores cuando hay que recorrer las coordinaciones. */
export const ORDEN_COLORES: ClaveColor[] = ['azul', 'verde', 'durazno', 'sinEquipo'];

/** Siguiente color libre, para cuando se da de alta una coordinación nueva. */
export const siguienteColorLibre = (usados: ClaveColor[]): ClaveColor =>
  ORDEN_COLORES.find((c) => c !== 'sinEquipo' && !usados.includes(c)) ?? 'sinEquipo';

// ── Construcción del árbol ──────────────────────────────────────────────────

/** Lo mínimo que necesita una persona para colocarse en la estructura. */
export interface PersonaOrganigrama {
  catalogValue: string;
  fullName: string;
  nivelOrganico?: NivelOrganico;
  reportaA?: string | null;
  partida?: number;
  color?: ClaveColor;
  activo?: boolean;
}

export interface NodoOrganigrama<T extends PersonaOrganigrama> {
  persona: T;
  equipo: T[];
}

export interface Estructura<T extends PersonaOrganigrama> {
  gerente: T | null;
  /** Un bloque por coordinación, con su gente ya ordenada. */
  coordinaciones: NodoOrganigrama<T>[];
  /** Quienes no cuelgan de nadie todavía: altas recientes sin jefe asignado. */
  sinAsignar: T[];
}

const porPartida = <T extends PersonaOrganigrama>(a: T, b: T) =>
  (a.partida ?? 9999) - (b.partida ?? 9999) || a.fullName.localeCompare(b.fullName, 'es');

/**
 * Ordena a las personas como se leen en la plantilla oficial: primero el
 * gerente, después cada coordinación con su gente debajo.
 *
 * Quien no tenga jefe asignado NO se descarta: aparece en `sinAsignar`. Una
 * persona que desaparece de la pantalla porque le falta un campo es peor que
 * una que se ve fuera de lugar, porque nadie se entera de que hay que
 * acomodarla.
 */
export const construirEstructura = <T extends PersonaOrganigrama>(personas: T[]): Estructura<T> => {
  const activas = personas.filter((p) => p.activo !== false);

  const gerente = activas.find((p) => p.nivelOrganico === 'GERENTE') ?? null;
  const coordinadores = activas.filter((p) => p.nivelOrganico === 'COORDINADOR').sort(porPartida);

  const normaliza = (v: unknown) =>
    String(v ?? '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

  // Se indexa por jefe para no recorrer la lista entera por cada coordinación.
  const porJefe = new Map<string, T[]>();
  activas.forEach((p) => {
    if (p.nivelOrganico === 'GERENTE' || p.nivelOrganico === 'COORDINADOR') return;
    const jefe = normaliza(p.reportaA);
    if (!jefe) return;
    const lista = porJefe.get(jefe) ?? [];
    lista.push(p);
    porJefe.set(jefe, lista);
  });

  const coordinaciones = coordinadores.map((coord) => ({
    persona: coord,
    equipo: (porJefe.get(normaliza(coord.catalogValue)) ?? []).sort(porPartida),
  }));

  const colocados = new Set<string>();
  if (gerente) colocados.add(normaliza(gerente.catalogValue));
  coordinaciones.forEach(({ persona, equipo }) => {
    colocados.add(normaliza(persona.catalogValue));
    equipo.forEach((p) => colocados.add(normaliza(p.catalogValue)));
  });

  const sinAsignar = activas
    .filter((p) => !colocados.has(normaliza(p.catalogValue)))
    .sort(porPartida);

  return { gerente, coordinaciones, sinAsignar };
};

/** Cuenta cuánta gente hay en la estructura, para los totales de la pantalla. */
export const contarPersonas = <T extends PersonaOrganigrama>(e: Estructura<T>): number =>
  (e.gerente ? 1 : 0) +
  e.coordinaciones.reduce((n, c) => n + 1 + c.equipo.length, 0) +
  e.sinAsignar.length;
