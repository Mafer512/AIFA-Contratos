// Opciones de estatus que agrega el equipo, además de las 11 etapas fijas del
// proceso (ESTATUS_2026_OPTIONS en Dashboard). Viven en la tabla
// estatus_opciones y valen para todos los años.
//
// Aquí sólo la lógica pura: limpiar y validar el nombre, encontrar si ya
// existe (sin importar acentos ni mayúsculas) y escoger un color.

export interface EstatusExtra {
  id: number;
  nombre: string;
  color: string;
}

export const MIN_NOMBRE_ESTATUS = 2;
export const MAX_NOMBRE_ESTATUS = 60;

/** Colores para escoger; ninguno se confunde con los amarillos de las etapas. */
export const PALETA_ESTATUS = ['#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#0EA5E9', '#84CC16', '#64748B'] as const;

/** Nombres que ya significan algo en las vistas y no pueden ser una opción. */
const RESERVADOS = ['sin estatus', 'vacio', 'sin asignar'];

/** Quita espacios de más: "  En   espera " → "En espera". */
export const limpiarNombreEstatus = (s: string) => s.replace(/\s+/g, ' ').trim();

const clave = (s: string) => limpiarNombreEstatus(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Si ya hay una opción con ese nombre (fija o agregada, sin importar acentos ni
 * mayúsculas), la devuelve tal como está escrita; si no, null.
 */
export const buscarEstatusExistente = (
  nombre: string,
  fijas: readonly string[],
  extras: readonly Pick<EstatusExtra, 'nombre'>[],
): string | null => {
  const k = clave(nombre);
  if (!k) return null;
  return fijas.find((f) => clave(f) === k) ?? extras.find((e) => clave(e.nombre) === k)?.nombre ?? null;
};

/** Mensaje para la persona si el nombre no sirve; null si está bien. */
export const validarNombreEstatus = (nombre: string): string | null => {
  const limpio = limpiarNombreEstatus(nombre);
  if (limpio.length < MIN_NOMBRE_ESTATUS) return 'Escribe el nombre de la opción.';
  if (limpio.length > MAX_NOMBRE_ESTATUS) return `Máximo ${MAX_NOMBRE_ESTATUS} caracteres.`;
  if (RESERVADOS.includes(clave(limpio))) return `"${limpio}" ya se usa para los servicios sin estatus. Escribe otro nombre.`;
  return null;
};

/** El primer color de la paleta que nadie usa todavía. */
export const colorSugeridoEstatus = (extras: readonly Pick<EstatusExtra, 'color'>[]): string => {
  const usados = new Set(extras.map((e) => e.color.toUpperCase()));
  return PALETA_ESTATUS.find((c) => !usados.has(c)) ?? PALETA_ESTATUS[extras.length % PALETA_ESTATUS.length];
};
