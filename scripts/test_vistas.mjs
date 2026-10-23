// Ejecutar con:  node --experimental-strip-types scripts/test_vistas.mjs
//
// Vistas por persona (profiles.modulos): quién ve qué, a dónde se le manda
// cuando no puede ver lo que se abrió y cómo se guarda la lista.
import {
  TODAS_LAS_VISTAS, puedeVer, normalizarModulos, resumenModulos, vistaActual, destinoDeVista, primeraVista,
} from '../utils/vistas.ts';

let fallos = 0;
const ok = (nombre, real, esperado) => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) fallos++;
  console.log(`${bien ? 'OK  ' : 'FALLA'} ${nombre.padEnd(62)} ${bien ? JSON.stringify(real) : `esperado ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)}`}`);
};

console.log('=== Quién ve qué ===');
ok('sin lista (cuentas de antes): todo', ['2026.pagos', 'auditoria', 'reportes.paaas'].map((v) => puedeVer(null, v)), [true, true, true]);
ok('usuario de Auditoría: sólo Auditoría', ['auditoria', '2026.pagos', '2025.resumen'].map((v) => puedeVer(['auditoria'], v)), [true, false, false]);
ok('lista vacía: nada', puedeVer([], 'auditoria'), false);

console.log('\n=== Lo que se guarda ===');
ok('todas marcadas → null (incluye vistas futuras)', normalizarModulos([...TODAS_LAS_VISTAS].reverse()), null);
ok('sin repetidos, sin desconocidas, en orden del menú', normalizarModulos(['auditoria', '2026.pagos', 'x.y', '2026.pagos', '2025.resumen']), ['2025.resumen', '2026.pagos', 'auditoria']);
ok('vacía se queda vacía', normalizarModulos([]), []);
ok('resumen: todas', resumenModulos(null), 'Todas las vistas');
ok('resumen: una sola sin grupo', resumenModulos(['auditoria']), 'Sólo Auditoría');
ok('resumen: una dentro de un año', resumenModulos(['2026.pagos']), 'Sólo 2026 · Pagos 2026');
ok('resumen: varias', resumenModulos(['auditoria', '2026.pagos']), `2 de ${TODAS_LAS_VISTAS.length} vistas`);
ok('resumen: ninguna', resumenModulos([]), 'Ninguna vista');

console.log('\n=== Del tablero a la vista y de regreso ===');
ok('2025 Resumen', vistaActual('overview', 'resumen', 'gastoEfectuado'), '2025.resumen');
ok('2026 Pagos', vistaActual('2026', 'pagos', 'gastoEfectuado'), '2026.pagos');
ok('Reportes PAAAS', vistaActual('reportes', 'resumen', 'paaas'), 'reportes.paaas');
ok('Auditoría', vistaActual('auditoria', 'resumen', 'paaas'), 'auditoria');
ok('Historial y Accesos no se controlan aquí', [vistaActual('history', 'x', 'y'), vistaActual('accesos', 'x', 'y')], [null, null]);
ok('ida y vuelta de cada vista', TODAS_LAS_VISTAS.every((v) => {
  const d = destinoDeVista(v);
  return vistaActual(d.tab, d.anioView ?? 'resumen', d.reportesView ?? 'gastoEfectuado') === v;
}), true);

console.log('\n=== Primera pantalla ===');
ok('sin lista: 2025 Resumen, como antes', primeraVista(null), '2025.resumen');
ok('con responsable: Mis servicios 2026, como antes', primeraVista(null, ['2026.mis']), '2026.mis');
ok('usuario de Auditoría entra directo a Auditoría', primeraVista(['auditoria'], ['2026.mis']), 'auditoria');
ok('le quitaron Pagos: otra de 2026', primeraVista(['2025.resumen', '2026.gantt'], ['2026.mis', '2026.resumen', '2026.estatus', '2026.pagos', '2026.gantt']), '2026.gantt');
ok('sin vistas: ninguna', primeraVista([]), null);

console.log(fallos ? `\n${fallos} prueba(s) FALLARON` : '\nTodas las pruebas pasan');
process.exit(fallos ? 1 : 0);
