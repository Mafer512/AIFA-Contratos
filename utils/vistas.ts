// Qué vistas del tablero puede ver cada persona.
//
// profiles.modulos guarda la lista de llaves permitidas ("2026.pagos",
// "auditoria"…). null quiere decir "todas": así estaban todas las cuentas
// antes de que existiera el permiso y nadie pierde acceso al aplicarlo.
// Historial y Accesos no están aquí: siguen siendo sólo de administradores.
//
// Para agregar una vista nueva al tablero, agrégala también a GRUPOS_VISTAS;
// las cuentas con modulos = null la verán sola, las demás hasta que un
// administrador se la dé.

export interface Vista { id: string; etiqueta: string }
export interface GrupoVistas { id: string; etiqueta: string; detalle: string; vistas: Vista[] }

export const GRUPOS_VISTAS: GrupoVistas[] = [
  {
    id: '2025', etiqueta: '2025', detalle: 'Histórico',
    vistas: [
      { id: '2025.resumen', etiqueta: 'Resumen' },
      { id: '2025.estatus', etiqueta: 'Estatus servicios' },
      { id: '2025.contratos', etiqueta: 'Gestión Contratos' },
    ],
  },
  {
    id: '2026', etiqueta: '2026', detalle: 'Activo',
    vistas: [
      { id: '2026.mis', etiqueta: 'Mis servicios' },
      { id: '2026.resumen', etiqueta: 'Resumen' },
      { id: '2026.estatus', etiqueta: 'Estatus servicios' },
      { id: '2026.pagos', etiqueta: 'Pagos 2026' },
      { id: '2026.gantt', etiqueta: 'Diagrama Gantt' },
    ],
  },
  {
    id: '2027', etiqueta: '2027', detalle: 'Anteproyecto',
    vistas: [
      { id: '2027.mis', etiqueta: 'Mis servicios' },
      { id: '2027.resumen', etiqueta: 'Resumen' },
      { id: '2027.estatus', etiqueta: 'Estatus servicios' },
      { id: '2027.gantt', etiqueta: 'Diagrama Gantt' },
    ],
  },
  {
    id: 'reportes', etiqueta: 'Reportes', detalle: 'Consultas',
    vistas: [
      { id: 'reportes.gastoEfectuado', etiqueta: 'Gasto Efectuado 2026' },
      { id: 'reportes.historicoServicios', etiqueta: 'Histórico de Servicios' },
      { id: 'reportes.anteproyecto', etiqueta: 'Anteproyecto' },
      { id: 'reportes.paaas', etiqueta: 'PAAAS' },
      { id: 'reportes.deductivas', etiqueta: 'Deductivas' },
    ],
  },
  {
    id: 'auditoria', etiqueta: 'Auditoría', detalle: 'Control de entregables',
    vistas: [{ id: 'auditoria', etiqueta: 'Auditoría' }],
  },
];

export const TODAS_LAS_VISTAS: string[] = GRUPOS_VISTAS.flatMap((g) => g.vistas.map((v) => v.id));

export const puedeVer = (modulos: readonly string[] | null | undefined, vista: string): boolean =>
  !modulos || modulos.includes(vista);

/**
 * La lista que se guarda: sin repetidos ni llaves desconocidas, en el orden
 * del menú. Si quedan todas, null ("todas", incluidas las que se agreguen
 * después).
 */
export const normalizarModulos = (modulos: readonly string[] | null | undefined): string[] | null => {
  if (!modulos) return null;
  const set = new Set(modulos);
  const lista = TODAS_LAS_VISTAS.filter((v) => set.has(v));
  return lista.length === TODAS_LAS_VISTAS.length ? null : lista;
};

/** "Todas", "Ninguna", "Sólo Auditoría", "3 de 18 vistas". */
export const resumenModulos = (modulos: readonly string[] | null | undefined): string => {
  const n = normalizarModulos(modulos);
  if (!n) return 'Todas las vistas';
  if (!n.length) return 'Ninguna vista';
  if (n.length === 1) {
    const v = GRUPOS_VISTAS.flatMap((g) => g.vistas.map((x) => ({ g, x }))).find(({ x }) => x.id === n[0]);
    return v ? `Sólo ${v.g.vistas.length > 1 ? `${v.g.etiqueta} · ` : ''}${v.x.etiqueta}` : '1 vista';
  }
  return `${n.length} de ${TODAS_LAS_VISTAS.length} vistas`;
};

// ── Del estado del tablero a la llave de la vista ───────────────────────────

const TAB_2025: Record<string, string> = { overview: '2025.resumen', serviciosStatus: '2025.estatus', contracts: '2025.contratos' };

/**
 * La vista que el tablero está mostrando. null = una pantalla que no se
 * controla por aquí (Historial, Accesos).
 */
export const vistaActual = (activeTab: string, anioView: string, reportesView: string): string | null => {
  if (TAB_2025[activeTab]) return TAB_2025[activeTab];
  if (activeTab === '2026' || activeTab === '2027') return `${activeTab}.${anioView}`;
  if (activeTab === 'reportes') return `reportes.${reportesView}`;
  if (activeTab === 'auditoria') return 'auditoria';
  return null;
};

/** Cómo llegar a una vista: el estado que hay que poner en el tablero. */
export const destinoDeVista = (vista: string): { tab: string; anioView?: string; reportesView?: string } => {
  const de2025 = Object.entries(TAB_2025).find(([, v]) => v === vista);
  if (de2025) return { tab: de2025[0] };
  const [grupo, sub] = vista.split('.');
  if (grupo === '2026' || grupo === '2027') return { tab: grupo, anioView: sub };
  if (grupo === 'reportes') return { tab: 'reportes', reportesView: sub };
  return { tab: vista };
};

/**
 * La primera vista que puede ver, prefiriendo la que se pide (p. ej. "Mis
 * servicios" para quien tiene responsable). null si no tiene ninguna.
 */
export const primeraVista = (modulos: readonly string[] | null | undefined, preferidas: string[] = []): string | null =>
  [...preferidas, ...TODAS_LAS_VISTAS].find((v) => TODAS_LAS_VISTAS.includes(v) && puedeVer(modulos, v)) ?? null;
