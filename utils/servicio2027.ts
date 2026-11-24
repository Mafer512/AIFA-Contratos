// Ficha de captura de un servicio o adquisición de 2027.
//
// En 2027 ya no se edita la tabla de Estatus servicios: cada servicio se da de
// alta y se edita con un formulario desde "Mis servicios". Aquí vive la lógica
// pura de ese formulario: qué campos tiene, en qué columna de estatus_2027 cae
// cada uno, cómo se pasa el valor de la tabla al campo y de vuelta, qué se
// valida y qué cambió. Las columnas son las mismas de siempre, así que
// Resumen, Gantt, calendario y reportes se siguen alimentando solos.

import { FASES, INDICE_ADJUDICADO, INDICE_CANCELADO, indiceEtapa } from './avanceFase.ts';
import { parseFechaFlexible } from './fichaServicio.ts';

export type TipoCampo =
  | 'texto'        // texto libre
  | 'alfanumerico' // claves y números de procedimiento/contrato
  | 'cucop'        // números y guiones
  | 'moneda'       // columna numeric
  | 'fecha'        // columna date
  | 'fechaTexto'   // columna text que guarda una fecha (histórico: cabía "N/A")
  | 'opciones'
  | 'responsable'
  | 'estatus'
  | 'tipoContratacion'
  | 'casilla'
  | 'notas';

export type SeccionFicha = 'identificacion' | 'estatus' | 'procedimiento' | 'contrato' | 'cronograma' | 'notas';

export interface CampoFicha {
  col: string;
  etiqueta: string;
  tipo: TipoCampo;
  seccion: SeccionFicha;
  opciones?: readonly string[];
  /** Sugerencias para escribir (datalist), sin obligar a elegir una. */
  sugerencias?: readonly string[];
  placeholder?: string;
  ancho?: 'completo';
  /** Otra columna que guarda el mismo dato y se mantiene igual. */
  espejo?: string;
  /** Fase del Gantt (0-8) a la que pertenece una fecha del cronograma. */
  fase?: number;
}

export const TIPOS_CONTRATACION = ['Adquisición', 'Servicio'] as const;
export type TipoContratacion = (typeof TIPOS_CONTRATACION)[number];

export const TIPOS_SERVICIO = ['Normativo', 'Ordinario - Alta', 'Ordinario - Media', 'Ordinario - Baja'] as const;

export const TIPOS_PROCEDIMIENTO = [
  'Licitación Pública Nacional',
  'Licitación Pública Internacional',
  'Invitación a cuando menos tres personas',
  'Adjudicación directa',
] as const;

/** Columnas que agrega la migración 20261123000000; sin ella no existen. */
export const COLUMNAS_NUEVAS_2027 = ['Tipo de contratación', 'No. GPYC', 'Tipo de procedimiento'] as const;

/** Columnas de los requisitos para liberar pago. */
export const GARANTIAS_2027 = [
  { col: 'Garantía de cumplimiento', etiqueta: 'Garantía de cumplimiento' },
  { col: 'Póliza de Responsabilidad Civil', etiqueta: 'Póliza de responsabilidad civil' },
  { col: 'Garantía de Calidad', etiqueta: 'Garantía de calidad' },
] as const;

// Nombres de las fechas del cronograma, tal como los usa el área.
const ETIQUETAS_CRONOGRAMA: Record<string, string> = {
  'Fecha inicio elaboración anexo técnico': 'Inicio de elaboración del anexo técnico',
  'Fecha término elaboración anexo técnico': 'Término de elaboración del anexo técnico',
  'Fecha remisión IM': 'Remisión IM',
  'Fecha recepción IM': 'Recepción IM',
  'Fecha recepción IM área técnica': 'Recepción IM área técnica',
  'Fecha remisión área técnica': 'Remisión área técnica',
  'Fecha inicio validación IM': 'Validación IM',
  'Fecha término validación IM': 'Término de validación IM',
  'Fecha recepción carpeta validada': 'Recepción de carpeta validada',
  'Fecha remisión carpeta RM': 'Remisión carpeta RM',
  'Fecha envío revisión DEFENSA': 'Remisión a revisión por SEDENA',
  'Fecha recepción revisión DEFENSA': 'Recepción de revisión por SEDENA',
  'Fecha inicio atención observaciones': 'Atención a observaciones',
  'Fecha remisión observaciones': 'Remisión de observaciones',
  'Fecha inicio documentación publicación': 'Inicio de documentación para publicación',
  'Fecha remisión documentación publicación': 'Remisión de documentación para publicación',
  'Fecha inicio publicación': 'Publicación',
  'Fecha fallo': 'Fallo',
};

export const etiquetaFecha2027 = (col: string): string | undefined => ETIQUETAS_CRONOGRAMA[col];

/**
 * Todas las fechas de 2027 que van al calendario de Seguimiento, con su
 * nombre. Antes el calendario adivinaba por palabras sueltas y, por ejemplo,
 * "Fecha inicio validación IM" salía como "Fecha de Inicio".
 */
export const ETIQUETAS_CALENDARIO_2027: Record<string, string> = {
  ...ETIQUETAS_CRONOGRAMA,
  'Publicación de Convocatoria': 'Publicación de convocatoria',
  'Visita a las instalaciones': 'Visita a las instalaciones',
  'Junta de Aclaraciones': 'Junta de aclaraciones',
  'Apertura de Proposiciones': 'Apertura de proposiciones',
  'Fallo': 'Fallo',
  'Diferimiento de fallo': 'Diferimiento del fallo',
  'Fecha de firma de contrato': 'Firma de contrato',
  'Vigencia de inicio': 'Inicio de vigencia',
  'Vigencia de Término': 'Término de vigencia',
  'Fecha de remisión de investigación de mercado': 'Remisión de investigación de mercado',
  'Fecha de recepción de investigación de mercado': 'Recepción de investigación de mercado',
  'Evaluación técnica': 'Evaluación técnica',
  'Validación por el área': 'Validación por el área',
};

export const CAMPOS_2027: readonly CampoFicha[] = [
  // Identificación
  { col: 'Tipo de contratación', etiqueta: '¿Qué es?', tipo: 'tipoContratacion', seccion: 'identificacion', ancho: 'completo' },
  { col: 'Nombre del Servicio.', etiqueta: 'Nombre del servicio', tipo: 'texto', seccion: 'identificacion', ancho: 'completo', placeholder: 'Servicio de mantenimiento a bardas perimetrales' },
  { col: 'No. GPYC', etiqueta: 'No. GPYC', tipo: 'alfanumerico', seccion: 'identificacion', placeholder: 'GPYC-027' },
  { col: 'Clave cucop', etiqueta: 'Clave CUCOP', tipo: 'cucop', seccion: 'identificacion', placeholder: '35102-0003' },
  { col: 'Responsable', etiqueta: 'Responsable GPYC', tipo: 'responsable', seccion: 'identificacion' },
  { col: 'Tipo_de_servicio', etiqueta: 'Tipo de servicio', tipo: 'opciones', seccion: 'identificacion', opciones: TIPOS_SERVICIO },
  { col: 'Subdirección', etiqueta: 'Subdirección', tipo: 'texto', seccion: 'identificacion' },
  { col: 'Gerencia', etiqueta: 'Gerencia', tipo: 'texto', seccion: 'identificacion' },
  { col: 'Administrador de Contrato', etiqueta: 'Administrador de contrato', tipo: 'texto', seccion: 'identificacion', ancho: 'completo', placeholder: 'Nombre completo' },
  // Estatus y montos
  { col: 'Estatus', etiqueta: 'Estatus', tipo: 'estatus', seccion: 'estatus', ancho: 'completo' },
  { col: 'Monto solicitado anteproyecto 2027', etiqueta: 'Monto solicitado anteproyecto 2027', tipo: 'moneda', seccion: 'estatus', placeholder: '1250000' },
  { col: 'Monto de Suficiencia presupuestal', etiqueta: 'Monto de suficiencia presupuestal', tipo: 'moneda', seccion: 'estatus', placeholder: '1250000' },
  // Procedimiento de contratación
  { col: 'Tipo de procedimiento', etiqueta: 'Tipo de procedimiento', tipo: 'texto', seccion: 'procedimiento', sugerencias: TIPOS_PROCEDIMIENTO },
  { col: 'No. de Procedimiento de contratación', etiqueta: 'Número de procedimiento de contratación', tipo: 'alfanumerico', seccion: 'procedimiento', placeholder: 'LA-08-KDN-008KDN001-N-12-2027' },
  { col: 'Publicación de Convocatoria', etiqueta: 'Publicación de convocatoria', tipo: 'fechaTexto', seccion: 'procedimiento' },
  { col: 'Visita a las instalaciones', etiqueta: 'Visita a las instalaciones', tipo: 'fechaTexto', seccion: 'procedimiento' },
  { col: 'Junta de Aclaraciones', etiqueta: 'Junta de aclaraciones', tipo: 'fechaTexto', seccion: 'procedimiento' },
  { col: 'Apertura de Proposiciones', etiqueta: 'Apertura de proposiciones', tipo: 'fechaTexto', seccion: 'procedimiento' },
  // El fallo es uno solo: es el fin de "Publicado" en el Gantt y la fecha del
  // procedimiento. Se guarda en las dos columnas para que nada se desfase.
  { col: 'Fecha fallo', etiqueta: 'Fallo', tipo: 'fecha', seccion: 'procedimiento', espejo: 'Fallo' },
  { col: 'Diferimiento de fallo', etiqueta: 'Diferimiento del fallo', tipo: 'fechaTexto', seccion: 'procedimiento' },
  // Contrato
  { col: 'Proveedor', etiqueta: 'Proveedor', tipo: 'texto', seccion: 'contrato', ancho: 'completo', placeholder: 'Razón social' },
  { col: 'No. de contrato', etiqueta: 'Número de contrato', tipo: 'alfanumerico', seccion: 'contrato', placeholder: 'AIFA-C-LPN-DO-SVS-015/2027' },
  { col: 'Fecha de firma de contrato', etiqueta: 'Fecha de firma de contrato', tipo: 'fecha', seccion: 'contrato' },
  { col: 'Vigencia de inicio', etiqueta: 'Vigencia: inicio', tipo: 'fechaTexto', seccion: 'contrato' },
  { col: 'Vigencia de Término', etiqueta: 'Vigencia: término', tipo: 'fechaTexto', seccion: 'contrato' },
  ...GARANTIAS_2027.map((g): CampoFicha => ({ col: g.col, etiqueta: g.etiqueta, tipo: 'casilla', seccion: 'contrato' })),
  // Cronograma del Gantt: las fechas que va dejando "Avanzar fase", por si hay
  // que corregir alguna. El fallo ya está arriba.
  ...FASES.flatMap((f, i): CampoFicha[] => [f.inicio, f.fin]
    .filter((col) => col !== 'Fecha fallo')
    .map((col) => ({ col, etiqueta: ETIQUETAS_CRONOGRAMA[col] ?? col, tipo: 'fecha', seccion: 'cronograma', fase: i }))),
  { col: 'Observación General del Servicio', etiqueta: 'Observación general del servicio', tipo: 'notas', seccion: 'notas', ancho: 'completo' },
];

export type ValoresFicha = Record<string, string | boolean>;

// ── Tabla → formulario ──────────────────────────────────────────────────────

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "2027-03-15", "15/03/2027" o un Date → "2027-03-15"; lo demás → "". */
export const aFechaISO = (v: unknown): string => {
  const d = parseFechaFlexible(v);
  return d ? iso(d) : '';
};

const aNumeroTexto = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '';
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? String(n) : '';
};

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Adquisición o servicio: la columna si existe; si no, por cómo empieza el nombre. */
export const tipoContratacionDe = (row: Record<string, any>): TipoContratacion => {
  const t = normal(String(row['Tipo de contratación'] ?? ''));
  if (t.startsWith('adquisicion')) return 'Adquisición';
  if (t.startsWith('servicio')) return 'Servicio';
  return normal(String(row['Nombre del Servicio.'] ?? '')).startsWith('adquisicion') ? 'Adquisición' : 'Servicio';
};

/** Lo que trae la fila, como lo muestra cada campo. */
export const valorFormulario = (campo: CampoFicha, row: Record<string, any>): string | boolean => {
  const v = row[campo.col];
  switch (campo.tipo) {
    case 'casilla': return v === true;
    case 'fecha':
    case 'fechaTexto': return aFechaISO(v);
    case 'moneda': return aNumeroTexto(v);
    case 'tipoContratacion': return tipoContratacionDe(row);
    default: return v === null || v === undefined ? '' : String(v).trim();
  }
};

/** Un texto que no se pudo leer como fecha ("N/A", "por definir"), para avisarlo. */
export const textoNoFecha = (campo: CampoFicha, row: Record<string, any>): string | null => {
  if (campo.tipo !== 'fechaTexto' && campo.tipo !== 'fecha') return null;
  const t = String(row[campo.col] ?? '').trim();
  return t && !aFechaISO(t) ? t : null;
};

export const valoresIniciales = (row: Record<string, any>, campos: readonly CampoFicha[]): ValoresFicha =>
  Object.fromEntries(campos.map((c) => [c.col, valorFormulario(c, row)]));

// ── Formulario → tabla ──────────────────────────────────────────────────────

/** Lo que se guarda en la columna. */
export const valorGuardar = (campo: CampoFicha, v: string | boolean | undefined): string | number | boolean | null => {
  if (campo.tipo === 'casilla') return v === true;
  const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  if (!t) return null;
  if (campo.tipo === 'moneda') {
    const n = Number(t.replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return t;
};

/** Sólo los campos cuya columna existe en la tabla. */
export const camposDisponibles = (columnas: readonly string[], campos: readonly CampoFicha[] = CAMPOS_2027): CampoFicha[] => {
  if (!columnas.length) return campos.filter((c) => !(COLUMNAS_NUEVAS_2027 as readonly string[]).includes(c.col));
  const set = new Set(columnas);
  return campos.filter((c) => set.has(c.col));
};

/** Columnas nuevas que la tabla todavía no tiene (falta la migración). */
export const columnasFaltantes = (columnas: readonly string[]): string[] =>
  columnas.length ? COLUMNAS_NUEVAS_2027.filter((c) => !columnas.includes(c)) : [];

/**
 * Lo que cambió, columna por columna. Se compara contra lo que el formulario
 * mostró al abrir (no contra el valor crudo) para que "15/03/2027" que se
 * muestra como 2027-03-15 sin tocarse no cuente como cambio.
 */
export const cambiosFicha = (
  campos: readonly CampoFicha[],
  inicial: ValoresFicha,
  actual: ValoresFicha,
  columnas: readonly string[],
): Record<string, string | number | boolean | null> => {
  const cambios: Record<string, string | number | boolean | null> = {};
  for (const c of campos) {
    const antes = valorGuardar(c, inicial[c.col]);
    const ahora = valorGuardar(c, actual[c.col]);
    if (antes === ahora) continue;
    cambios[c.col] = ahora;
    if (c.espejo && columnas.includes(c.espejo)) cambios[c.espejo] = ahora;
  }
  return cambios;
};

/** El registro para dar de alta: sólo lo que se llenó. */
export const registroNuevo = (
  campos: readonly CampoFicha[],
  valores: ValoresFicha,
  columnas: readonly string[],
): Record<string, string | number | boolean | null> => {
  const r: Record<string, string | number | boolean | null> = {};
  for (const c of campos) {
    const v = valorGuardar(c, valores[c.col]);
    if (v === null || v === false) continue;
    r[c.col] = v;
    if (c.espejo && columnas.includes(c.espejo)) r[c.espejo] = v;
  }
  return r;
};

// ── Validación ──────────────────────────────────────────────────────────────

/** Errores por columna, en palabras. Vacío si todo está bien. */
export const validarFicha = (campos: readonly CampoFicha[], v: ValoresFicha): Record<string, string> => {
  const e: Record<string, string> = {};
  const txt = (col: string) => (typeof v[col] === 'string' ? (v[col] as string).trim() : '');
  const hay = (col: string) => campos.some((c) => c.col === col);

  if (hay('Nombre del Servicio.') && txt('Nombre del Servicio.').length < 3) e['Nombre del Servicio.'] = 'Escribe el nombre del servicio.';
  if (hay('Clave cucop') && txt('Clave cucop') && !/^\d[\d-]*$/.test(txt('Clave cucop'))) e['Clave cucop'] = 'La clave CUCOP lleva sólo números (y guiones).';

  for (const c of campos) {
    if (c.tipo === 'moneda' && txt(c.col)) {
      const n = Number(txt(c.col).replace(/[$,\s]/g, ''));
      if (!Number.isFinite(n) || n < 0) e[c.col] = 'Escribe sólo el número, sin letras.';
    }
  }

  const despues = (ini: string, fin: string, mensaje: string) => {
    if (hay(ini) && hay(fin) && txt(ini) && txt(fin) && txt(fin) < txt(ini)) e[fin] = mensaje;
  };
  despues('Vigencia de inicio', 'Vigencia de Término', 'El término no puede ser antes del inicio.');
  FASES.forEach((f) => despues(f.inicio, f.fin, 'No puede ser antes del inicio de esta fase.'));
  return e;
};

// ── Estado general ──────────────────────────────────────────────────────────

export type EstatusGeneral = 'Adjudicado' | 'En proceso' | 'Cancelado' | 'Sin estatus';

/** Adjudicado / En proceso / Cancelado, a partir del estatus detallado. */
export const estatusGeneral = (estatus: unknown): EstatusGeneral => {
  if (!String(estatus ?? '').trim()) return 'Sin estatus';
  const i = indiceEtapa(estatus);
  if (i === INDICE_ADJUDICADO) return 'Adjudicado';
  if (i === INDICE_CANCELADO) return 'Cancelado';
  return 'En proceso';
};
