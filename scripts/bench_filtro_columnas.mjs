// Ejecutar con:  node scripts/bench_filtro_columnas.mjs
//
// Mide el coste de filtrar la tabla de estatus por una búsqueda de columna,
// comparando cómo estaba antes y cómo quedó.
//
// ANTES: normalizeAnnualKey(key) y normalizeResponsableKey(term) se calculaban
// DENTRO del bucle de filas, aunque sólo dependen de la columna y del texto
// escrito. Con 500 servicios eso eran 500 repeticiones idénticas por tecla.
//
// AHORA: se resuelven una sola vez, antes del bucle.

const normalizeAnnualKey = (key) => key
  .toString().trim().toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ')
  .replace(/[()]/g, '')
  .replace(/[\.\-_]/g, ' ')
  .replace(/\s+/g, ' ')
  .replace(/[º°#]/g, '')
  .trim();

const normalizeResponsableKey = (value) =>
  String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Datos parecidos a los reales: nombres largos, con acentos y paréntesis.
const N_FILAS = 500;
const filas = Array.from({ length: N_FILAS }, (_, i) => ({
  'Nombre del Servicio.': `Servicio de Mantenimiento y Conservación a Equipos Electrógenos (Planta ${i}).`,
  'Responsable': i % 3 === 0 ? 'DANIELA ELIZABETH MERCADO ISLAS' : 'MONSERRAT ALONSO MARTÍNEZ',
  'Clave cucop': `357010${i}`,
}));

const busquedas = [['Nombre del Servicio.', 'mantenimiento']];

// ── Versión anterior ──────────────────────────────────────────────────────
const filtrarAntes = (datos) => datos.filter((row) => {
  for (const [key, term] of busquedas) {
    const isResponsable = normalizeAnnualKey(key) === 'responsable';   // por fila
    const val = isResponsable
      ? normalizeResponsableKey(row[key])
      : String(row[key] ?? '').toLowerCase();
    const expected = isResponsable
      ? normalizeResponsableKey(term)                                   // por fila
      : term;
    if (!val.includes(expected)) return false;
  }
  return true;
});

// ── Versión actual ────────────────────────────────────────────────────────
const prepararBusquedas = () => busquedas.map(([key, term]) => {
  const isResponsable = normalizeAnnualKey(key) === 'responsable';      // una vez
  return {
    key,
    isResponsable,
    expected: isResponsable ? normalizeResponsableKey(term) : term.toLowerCase(),
  };
});

const filtrarAhora = (datos) => {
  const activas = prepararBusquedas();
  return datos.filter((row) => {
    for (const { key, isResponsable, expected } of activas) {
      const val = isResponsable
        ? normalizeResponsableKey(row[key])
        : String(row[key] ?? '').toLowerCase();
      if (!val.includes(expected)) return false;
    }
    return true;
  });
};

// Mismo resultado: la optimización no puede cambiar lo que se ve.
const a = filtrarAntes(filas);
const b = filtrarAhora(filas);
const mismoResultado = a.length === b.length && a.every((r, i) => r === b[i]);
console.log(`Resultados identicos: ${mismoResultado ? 'SI' : 'NO ⚠'} (${a.length}/${N_FILAS} filas)`);
if (!mismoResultado) process.exit(1);

// Una pulsación de tecla = un filtrado completo. Se simula escribir una palabra.
const PULSACIONES = 200;
const medir = (fn) => {
  fn(filas); // calentar
  const t0 = performance.now();
  for (let i = 0; i < PULSACIONES; i++) fn(filas);
  return performance.now() - t0;
};

const tAntes = medir(filtrarAntes);
const tAhora = medir(filtrarAhora);

console.log(`\n${N_FILAS} filas × ${PULSACIONES} pulsaciones:`);
console.log(`  antes : ${tAntes.toFixed(1)} ms  (${(tAntes / PULSACIONES).toFixed(2)} ms por tecla)`);
console.log(`  ahora : ${tAhora.toFixed(1)} ms  (${(tAhora / PULSACIONES).toFixed(2)} ms por tecla)`);
console.log(`  mejora: ${(tAntes / tAhora).toFixed(1)}× mas rapido`);

console.log(`\nNota: esto mide SOLO el filtrado. La mejora que mas se nota al`);
console.log(`teclear viene de useDeferredValue, que impide que el repintado de`);
console.log(`la tabla bloquee al teclado.`);
