// Emparejar a un usuario con su ficha del organigrama por el nombre.
//
// Los nombres de las cuentas los escribió cada quien al registrarse y no
// coinciden letra por letra con la plantilla: "Adriana Pérez" contra "Adriana
// Pérez Maldonado", "Emily Esmeralda…" contra "Esmeralda Emily…", y errores de
// dedo como "Florricela" o "Carrada". Comparar cadenas completas dejaría a la
// mitad sin foto; esto compara palabra por palabra.
//
// Regla: todas las palabras del nombre más corto deben estar en el más largo
// (en cualquier orden), aceptando una letra de diferencia en palabras de cinco
// letras o más. Con una sola palabra no se intenta: "Daniela" sola le
// quedaría a cualquiera. Y si le quedan dos fichas, no se elige ninguna: más
// vale sin foto que con la de otra persona.

/** "Martha Castelán García " → ["MARTHA", "CASTELAN", "GARCIA"] */
export const palabrasDeNombre = (nombre: string | null | undefined): string[] =>
  String(nombre ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Distancia de edición, cortando en cuanto pasa de 1 (no hace falta más). */
const aUnaLetra = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let cambios = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++cambios > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return cambios + (a.length - i) + (b.length - j) <= 1;
};

const mismaPalabra = (a: string, b: string): boolean =>
  a === b || (a.length >= 5 && b.length >= 5 && aUnaLetra(a, b));

/** ¿Cada palabra de `corto` tiene su pareja (distinta) en `largo`? */
const contenidoEn = (corto: string[], largo: string[]): boolean => {
  const usadas = new Set<number>();
  return corto.every((palabra) => {
    const k = largo.findIndex((otra, idx) => !usadas.has(idx) && mismaPalabra(palabra, otra));
    if (k < 0) return false;
    usadas.add(k);
    return true;
  });
};

export const mismoNombre = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const pa = palabrasDeNombre(a);
  const pb = palabrasDeNombre(b);
  const [corto, largo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  if (corto.length < 2) return false;
  return contenidoEn(corto, largo);
};

/**
 * La única ficha que corresponde a `nombre`, o null si no hay ninguna o hay
 * más de una. `nombresDe` da los nombres por los que se conoce a cada ficha
 * (nombre completo, valor de catálogo, alias).
 */
export const buscarPorNombre = <T,>(
  nombre: string | null | undefined,
  candidatos: readonly T[],
  nombresDe: (candidato: T) => (string | null | undefined)[],
): T | null => {
  const hallados = candidatos.filter((c) => nombresDe(c).some((n) => mismoNombre(nombre, n)));
  return hallados.length === 1 ? hallados[0] : null;
};
