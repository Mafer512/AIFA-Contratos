// Ejecutar con:  node scripts/test_orden_declaraciones.mjs
//
// Protege contra el fallo que dejaba la pantalla en blanco al escribir en un
// buscador por columna:
//
//   ReferenceError: Cannot access 'normalizeAnnualKey' before initialization
//
// normalizeAnnualKey estaba declarada como `const` DENTRO del componente, cerca
// de la línea 3900, pero el useMemo que filtra la tabla de estatus la llamaba
// desde la línea 3100. Un `const` no existe antes de su declaración (zona
// muerta temporal), así que al ejecutarse ese useMemo durante el render lanzaba
// y React desmontaba la aplicación entera.
//
// Sólo se disparaba al escribir en un buscador por columna, porque esa era la
// única rama del filtro que la llamaba tan pronto. Por eso pasó meses oculto.
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../components/Dashboard.tsx', import.meta.url), 'utf8');
const lines = src.split('\n');

let fallos = 0;
const ok = (nombre, bien, detalle = '') => {
  if (!bien) fallos++;
  console.log(`${bien ? 'OK   ' : 'FALLA'} ${nombre.padEnd(56)} ${detalle}`);
};

// Línea donde arranca el componente: todo lo declarado a partir de ahí, con dos
// espacios de sangría, vive dentro del render.
const inicioComponente = lines.findIndex(l => /^const Dashboard\b/.test(l));
ok('se localiza el componente Dashboard', inicioComponente !== -1, `linea ${inicioComponente + 1}`);

// Ayudantes puros que varios useMemo llaman durante el render. Todos tienen que
// estar en el ámbito del módulo (sangría cero) y ANTES del componente.
const ayudantesQueDebenSerDeModulo = [
  'normalizeAnnualKey',
  'rowMatchesFilter',
  'rowMatchesColumnFilters',
];

for (const nombre of ayudantesQueDebenSerDeModulo) {
  const decl = lines.findIndex(l => new RegExp(`^const ${nombre}\\b`).test(l));
  ok(`${nombre} esta en el ambito del modulo`, decl !== -1, decl !== -1 ? `linea ${decl + 1}` : 'NO ENCONTRADA a sangria cero');
  if (decl !== -1) {
    ok(`${nombre} se declara antes del componente`, decl < inicioComponente, `${decl + 1} < ${inicioComponente + 1}`);
  }
  // Y que no haya quedado una copia dentro del componente.
  const dentro = lines.findIndex(l => new RegExp(`^  const ${nombre}\\b`).test(l));
  ok(`${nombre} no esta duplicada dentro del componente`, dentro === -1,
     dentro === -1 ? '' : `⚠ tambien en la linea ${dentro + 1}`);
}

// El uso concreto que reventaba: el filtro por columna de la tabla de estatus.
const usoFiltro = lines.findIndex(l => l.includes("const isResponsable = normalizeAnnualKey(key) === 'responsable'"));
ok('sigue existiendo el filtro por columna de estatus', usoFiltro !== -1, `linea ${usoFiltro + 1}`);
if (usoFiltro !== -1) {
  const decl = lines.findIndex(l => /^const normalizeAnnualKey\b/.test(l));
  ok('ese filtro ve la funcion ya inicializada', decl < usoFiltro, `declarada en ${decl + 1}, usada en ${usoFiltro + 1}`);
}

// Los valores diferidos son del mismo tipo de riesgo: son `const` dentro del
// componente y varios useMemo los leen. Si alguien mueve su declaración por
// debajo de esos useMemo, vuelve el mismo ReferenceError.
for (const nombre of ['estatus2026ColumnSearchDiferido', 'estatus2026QueryDiferida']) {
  const decl = lines.findIndex(l => new RegExp(`^  const ${nombre}\\b`).test(l));
  const primerUso = lines.findIndex((l, i) => i !== decl && new RegExp(`\\b${nombre}\\b`).test(l));
  ok(`${nombre} existe`, decl !== -1, decl !== -1 ? `linea ${decl + 1}` : 'NO ENCONTRADA');
  if (decl !== -1 && primerUso !== -1) {
    ok(`${nombre} se declara antes de usarse`, decl < primerUso,
       `declarada en ${decl + 1}, primer uso en ${primerUso + 1}`);
  }
}

// El contenedor de las tablas debe limitar su altura, no fijarla: con h- fija
// quedaba un hueco blanco enorme al filtrar y dejar pocas filas.
const alturaFija = lines.filter(l => l.includes('h-[calc(100vh-280px)]') && !l.includes('max-h-')).length;
ok('ningun contenedor usa altura fija de viewport', alturaFija === 0,
   alturaFija === 0 ? '' : `⚠ ${alturaFija} contenedor(es) con h- fija`);

console.log('\n' + (fallos === 0 ? 'TODAS LAS PRUEBAS PASARON' : `${fallos} PRUEBA(S) FALLARON`));
process.exit(fallos === 0 ? 0 : 1);
