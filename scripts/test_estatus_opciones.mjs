// Ejecutar con:  node --experimental-strip-types scripts/test_estatus_opciones.mjs
//
// Opciones de estatus que agrega el equipo: que el nombre se limpie, que no se
// repita una opción (fija o agregada) aunque cambien acentos o mayúsculas, y
// que el color sugerido no repita uno ya usado.
import { readFileSync } from 'node:fs';
import {
  PALETA_ESTATUS, limpiarNombreEstatus, validarNombreEstatus, buscarEstatusExistente, colorSugeridoEstatus,
} from '../utils/estatusOpciones.ts';

let fallos = 0;
const ok = (nombre, real, esperado) => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) fallos++;
  console.log(`${bien ? 'OK  ' : 'FALLA'} ${nombre.padEnd(62)} ${bien ? JSON.stringify(real) : `esperado ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)}`}`);
};

// Las 11 etapas tal como están en Dashboard, para no copiarlas a mano.
const dash = readFileSync(new URL('../components/Dashboard.tsx', import.meta.url), 'utf8');
const FIJAS = [...dash.match(/const ESTATUS_2026_OPTIONS = \[([\s\S]*?)\] as const;/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
ok('se leyeron las 11 etapas', FIJAS.length, 11);

console.log('\n=== Nombre ===');
ok('quita espacios de más', limpiarNombreEstatus('  En   espera  de suficiencia '), 'En espera de suficiencia');
ok('vacío → pide nombre', validarNombreEstatus('   '), 'Escribe el nombre de la opción.');
ok('una letra → pide nombre', validarNombreEstatus('a'), 'Escribe el nombre de la opción.');
ok('61 caracteres → muy largo', validarNombreEstatus('x'.repeat(61)), 'Máximo 60 caracteres.');
ok('60 caracteres → bien', validarNombreEstatus('x'.repeat(60)), null);
ok('"Sin estatus" está reservado', validarNombreEstatus('sin  ESTATUS') !== null, true);
ok('"Vacío" está reservado', validarNombreEstatus('Vacío') !== null, true);
ok('nombre normal → bien', validarNombreEstatus('Suspendido'), null);

console.log('\n=== No repetir ===');
const extras = [{ nombre: 'En espera de suficiencia' }, { nombre: 'Suspendido' }];
ok('etapa fija sin acentos ni mayúsculas', buscarEstatusExistente('en revision defensa', FIJAS, extras), 'En revisión DEFENSA');
ok('etapa fija con espacios de más', buscarEstatusExistente('  publicado   compras mx ', FIJAS, extras), 'Publicado Compras MX');
ok('agregada, otras mayúsculas', buscarEstatusExistente('SUSPENDIDO', FIJAS, extras), 'Suspendido');
ok('nueva de verdad', buscarEstatusExistente('Reprogramado', FIJAS, extras), null);
ok('parecida no cuenta como igual', buscarEstatusExistente('En IM 2', FIJAS, extras), null);
ok('vacío no encuentra nada', buscarEstatusExistente('  ', FIJAS, extras), null);

console.log('\n=== Color ===');
ok('sin agregadas → el primero', colorSugeridoEstatus([]), PALETA_ESTATUS[0]);
ok('salta los usados (sin importar mayúsculas)', colorSugeridoEstatus([{ color: PALETA_ESTATUS[0].toLowerCase() }, { color: PALETA_ESTATUS[1] }]), PALETA_ESTATUS[2]);
ok('todos usados → reparte en orden', colorSugeridoEstatus(PALETA_ESTATUS.map((color) => ({ color }))), PALETA_ESTATUS[0]);
ok('colores válidos para la base (#RRGGBB)', PALETA_ESTATUS.every((c) => /^#[0-9A-F]{6}$/.test(c)), true);
const mapaColores = dash.match(/const ESTATUS_2026_COLOR_MAP[^{]*\{([\s\S]*?)\};/)[1].toUpperCase();
ok('ninguno es color de una etapa', PALETA_ESTATUS.filter((c) => mapaColores.includes(c)), []);

console.log('\n=== La base pide lo mismo ===');
const sql = readFileSync(new URL('../supabase/migrations/20261109000000_estatus_opciones.sql', import.meta.url), 'utf8');
const enCheck = sql.slice(sql.indexOf('lower(nombre) not in'), sql.indexOf("'sin estatus'"));
ok('el CHECK reserva las 11 etapas (en minúsculas)', FIJAS.filter((f) => !enCheck.includes(`'${f.toLowerCase()}'`)), []);
const enTrigger = sql.slice(sql.indexOf('validar_estatus_servicio()'), sql.indexOf('raise exception \'El estatus'));
ok('el trigger de 2027 acepta las 11 etapas', FIJAS.filter((f) => !enTrigger.includes(`'${f}'`)), []);
ok('la base limita a 60 caracteres, igual que la app', /char_length\(nombre\) between 2 and 60/.test(sql), true);

console.log(fallos ? `\n${fallos} prueba(s) FALLARON` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
