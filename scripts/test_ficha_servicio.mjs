// Ejecutar con:  node --experimental-strip-types scripts/test_ficha_servicio.mjs
//
// La lógica de la ficha del servicio: ligar pagos con servicios aunque el
// contrato o el nombre vengan escritos distinto, leer las fechas como se
// capturan y juzgar si el gasto va al paso del contrato.
import {
  claveContrato, parecidoNombres, vincularPagos, parseFechaFlexible, ritmoDeEjercicio, diasEntre,
} from '../utils/fichaServicio.ts';

let fallos = 0;
const ok = (nombre, real, esperado) => {
  const bien = real === esperado;
  if (!bien) fallos++;
  console.log(`${bien ? 'OK  ' : 'FALLA'} ${nombre.padEnd(60)} ${bien ? real : `esperado "${esperado}", dio "${real}"`}`);
};
const iso = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);

console.log('=== Número de contrato ===');
const base = claveContrato('AIFA-C-AD-DO-SVS-004/2026');
ok('el normal', base, 'AD-DO-SVS-4-2026');
ok('con punto final', claveContrato('AIFA-C-AD-DO-SVS-004/2026.'), base);
ok('con espacios', claveContrato(' aifa-c-ad-do-svs-004 / 2026 '), base);
ok('guion en vez de diagonal', claveContrato('AIFA-C-AD-DO-SVS-067-2026'), 'AD-DO-SVS-67-2026');
ok('con su convenio modificatorio', claveContrato('AIFA-C-LPN-DO-SVS-029/2026 Y SU CONVENIO MODIFICATORIO 001/2026'), 'LPN-DO-SVS-29-2026');
ok('adquisición (ADQ)', claveContrato('AIFA-C-LPN-DO-ADQ-051/2026'), 'LPN-DO-ADQ-51-2026');
ok('N/A no es contrato', claveContrato('N/A'), '');
ok('vacío', claveContrato(null), '');

console.log('\n=== Nombre del servicio ===');
ok('mayúsculas, acentos y punto final', parecidoNombres(
  'Servicio de Mantenimiento y Conservación a Equipos Electrógenos (Plantas de Emergencia).',
  'Servicio de Mantenimiento y conservación a Equipos Electrógenos (plantas de emergencia)'), 1);
ok('"Servicios de" contra "Servicio de"', parecidoNombres(
  'Servicios de mantenimientos preventivos, correctivos y conservación',
  'Servicio de Mantenimientos preventivos, correctivos y Conservación'), 1);
ok('servicios distintos no se parecen', parecidoNombres(
  'Servicio de Control por riesgo de Fauna nociva',
  'Servicio de mantenimiento y recarga de extintores') < 0.8, true);

console.log('\n=== Ligar pagos con servicios ===');
const servicios = [
  { c: 'AIFA-C-AD-DO-SVS-004/2026.', n: 'Servicio de limpieza de edificios' },
  { c: 'N/A', n: 'Servicio de mantenimiento a estacionamientos' },
  { c: 'N/A', n: 'Adquisición de químicos para agua helada, caliente y enfriamiento' },
  { c: 'N/A', n: 'Servicio de jardinería zona norte' },
  { c: 'N/A', n: 'Servicio de jardinería zona sur' },
];
const pagos = [
  { c: 'AIFA-C-AD-DO-SVS-004/2026', n: 'Limpieza' },                                   // por contrato
  { c: 'AIFA-C-LPN-DO-SVS-089/2026', n: 'Servicio de mantenimiento a estacionamientos.' }, // por nombre
  { c: 'AIFA-C-LPN-DO-ADQ-051/2026', n: 'Adquisición de químicos para agua  helada, caliente y enfriamiento' },
  { c: 'AIFA-C-LPN-DO-ADQ-052/2026', n: 'ADQUISICIÓN DE QUÍMICOS PARA AGUA HELADA, CALIENTE Y ENFRIAMIENTO' },
  { c: '', n: 'Servicio de jardinería' },                                               // empate norte/sur
];
const ligados = vincularPagos(pagos, servicios, { contrato: (p) => p.c, nombre: (p) => p.n }, { contrato: (s) => s.c, nombre: (s) => s.n });
ok('por contrato aunque cambie el nombre', ligados.get(0)?.[0]?.n, 'Limpieza');
ok('por nombre cuando el contrato no casa', ligados.get(1)?.length, 1);
ok('dos contratos de una misma adquisición', ligados.get(2)?.length, 2);
ok('con empate no adivina (norte)', ligados.get(3), undefined);
ok('con empate no adivina (sur)', ligados.get(4), undefined);

console.log('\n=== Fechas ===');
ok('ISO', iso(parseFechaFlexible('2026-07-28')), '2026-07-28');
ok('ISO con hora', iso(parseFechaFlexible('2026-07-28T00:00:00')), '2026-07-28');
ok('día/mes/año', iso(parseFechaFlexible('31/12/2026')), '2026-12-31');
ok('01/02/2026 es 1 de febrero, no 2 de enero', iso(parseFechaFlexible('01/02/2026')), '2026-02-01');
ok('con guiones', iso(parseFechaFlexible('15-03-2026')), '2026-03-15');
ok('año corto', iso(parseFechaFlexible('1/1/26')), '2026-01-01');
ok('en palabras', iso(parseFechaFlexible('31 de diciembre de 2026')), '2026-12-31');
ok('mes abreviado', iso(parseFechaFlexible('5 sept 2026')), '2026-09-05');
ok('N/A', parseFechaFlexible('N/A'), null);
ok('vacía', parseFechaFlexible(''), null);
ok('fecha imposible (31 de febrero)', parseFechaFlexible('31/02/2026'), null);
ok('texto suelto', parseFechaFlexible('por definir'), null);
ok('días entre 1 y 31 de enero', diasEntre(parseFechaFlexible('01/01/2026'), parseFechaFlexible('31/01/2026')), 30);

console.log('\n=== Ritmo de ejercicio ===');
const ini = parseFechaFlexible('01/01/2026');
const fin = parseFechaFlexible('31/12/2026');
const julio = parseFechaFlexible('02/07/2026'); // ~50 % del año
ok('a la mitad del año con 45 % ejercido: en ritmo', ritmoDeEjercicio(ini, fin, 45, 100, julio).estado, 'en-ritmo');
ok('a la mitad del año con 20 % ejercido: lento', ritmoDeEjercicio(ini, fin, 20, 100, julio).estado, 'lento');
ok('a la mitad del año con 80 % ejercido: adelantado', ritmoDeEjercicio(ini, fin, 80, 100, julio).estado, 'adelantado');
ok('antes de iniciar', ritmoDeEjercicio(ini, fin, 0, 100, parseFechaFlexible('15/12/2025')).estado, 'por-iniciar');
ok('después del término', ritmoDeEjercicio(ini, fin, 90, 100, parseFechaFlexible('15/01/2027')).estado, 'concluido');
ok('sin monto máximo', ritmoDeEjercicio(ini, fin, 10, 0, julio).estado, 'sin-datos');
ok('sin fechas', ritmoDeEjercicio(null, fin, 10, 100, julio).estado, 'sin-datos');
ok('tiempo transcurrido ~50 %', Math.round(ritmoDeEjercicio(ini, fin, 45, 100, julio).pctTiempo), 50);

console.log(`\n${fallos === 0 ? 'TODO BIEN' : `${fallos} FALLA(S)`}`);
process.exitCode = fallos ? 1 : 0;
