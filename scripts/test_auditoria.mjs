// Ejecutar con:  node --experimental-strip-types scripts/test_auditoria.mjs
//
// Módulo de Auditoría: leer las letras como se capturan, saber qué meses
// cuentan, leer la hoja de Excel del área y no pisar nada al importarla.
import {
  letraDe, mesDeEncabezado, mesesEnVigencia, ultimoMesCerrado, contar, mesesPorRegistrar,
  llaveContrato, limpiarContrato, anioDeContrato, compararContratos, leerHojaAuditoria,
  planearImportacion, leerPegado, fuentesDelAnio, pendientesDelAnio, fuenteDe,
} from '../utils/auditoria.ts';

let fallos = 0;
const ok = (nombre, real, esperado) => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) fallos++;
  console.log(`${bien ? 'OK  ' : 'FALLA'} ${nombre.padEnd(62)} ${bien ? JSON.stringify(real) : `esperado ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)}`}`);
};

console.log('=== Letras ===');
ok('C, R, E, N tal cual', ['C', 'R', 'E', 'N'].map(letraDe), ['C', 'R', 'E', 'N']);
ok('minúsculas y espacios', [' c', 'r ', 'e', 'n'].map(letraDe), ['C', 'R', 'E', 'N']);
ok('palabras completas', ['Completo', 'Revisado', 'En revisión', 'No aplica', 'N/A'].map(letraDe), ['C', 'R', 'E', 'N', 'N']);
ok('lo que no se entiende es null', ['X', '', null, '5', 'Pendiente'].map(letraDe), [null, null, null, null, null]);

console.log('\n=== Encabezados de mes ===');
ok('nombres completos', ['enero', 'Febrero', 'SEPTIEMBRE', 'diciembre'].map(mesDeEncabezado), [1, 2, 9, 12]);
ok('abreviados', ['Ene', 'feb.', 'Mar', 'May', 'Jun', 'Jul', 'Sept', 'Sep', 'Dic'].map(mesDeEncabezado), [1, 2, 3, 5, 6, 7, 9, 9, 12]);
ok('"Setiembre"', mesDeEncabezado('Setiembre'), 9);
ok('lo demás no es mes', ['Total', 'Completo', 'Proveedor', 'ma', ''].map(mesDeEncabezado), [null, null, null, null, null]);

console.log('\n=== Vigencia ===');
const d = (s) => new Date(`${s}T12:00:00`);
ok('todo el año', [...mesesEnVigencia(d('2026-01-01'), d('2026-12-31'), 2026)], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
ok('julio a diciembre', [...mesesEnVigencia(d('2026-07-15'), d('2026-12-31'), 2026)], [7, 8, 9, 10, 11, 12]);
ok('cruza de año', [...mesesEnVigencia(d('2025-10-01'), d('2026-03-31'), 2026)], [1, 2, 3]);
ok('de otro año: ningún mes', [...mesesEnVigencia(d('2027-01-01'), d('2027-12-31'), 2026)], []);
ok('sin fechas: no se sabe', mesesEnVigencia(null, null, 2026), null);

console.log('\n=== Meses cerrados y por registrar ===');
ok('en octubre ya cerró septiembre', ultimoMesCerrado(2026, d('2026-10-21')), 9);
ok('año pasado: todo cerrado', ultimoMesCerrado(2025, d('2026-10-21')), 12);
ok('año que viene: nada cerrado', ultimoMesCerrado(2027, d('2026-10-21')), 0);
ok('faltan los meses sin letra', mesesPorRegistrar({ 1: 'C', 2: 'C', 4: 'E' }, null, 5), [3, 5]);
ok('fuera de vigencia no falta', mesesPorRegistrar({ 7: 'C' }, new Set([7, 8, 9, 10, 11, 12]), 9), [8, 9]);
ok('conteo', contar(['C', 'C', 'R', null, 'E', 'N', 'C']), { C: 3, R: 1, E: 1, N: 1, total: 6 });

console.log('\n=== Contratos ===');
ok('punto final y espacios', limpiarContrato(' AIFA-C-LPN-DO-SVS-086/2025. '), 'AIFA-C-LPN-DO-SVS-086/2025');
ok('misma llave con "-" o "/"', llaveContrato('AIFA-C-LPN-DO-ADQ-110-2025') === llaveContrato('AIFA-C-LPN-DO-ADQ-110/2025.'), true);
ok('año del contrato', [anioDeContrato('AIFA-C-LPN-DO-SVS-139/2025'), anioDeContrato('AIFA-C-AD-DO-ADQ-080-2025'), anioDeContrato('sin año')], [2025, 2025, null]);
const orden = ['AIFA-C-AD-DO-ADQ-057-2025', 'AIFA-C-LPN-DO-SVS-139/2025', 'AIFA-C-LPN-DO-SVS-010/2025', 'AIFA-C-AD-DO-SVS-005/2025', 'AIFA-C-LPN-DO-SVS-9/2025'].sort(compararContratos);
ok('SVS antes que ADQ, LPN antes que AD, 9 antes que 10', orden, [
  'AIFA-C-LPN-DO-SVS-9/2025', 'AIFA-C-LPN-DO-SVS-010/2025', 'AIFA-C-LPN-DO-SVS-139/2025', 'AIFA-C-AD-DO-SVS-005/2025', 'AIFA-C-AD-DO-ADQ-057-2025',
]);

console.log('\n=== Leer la hoja como la lleva el área ===');
// Igual que la hoja original: meses girados en un renglón arriba del
// encabezado, observación sin encabezado después de "Total" y la leyenda abajo.
const M = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const hoja = [
  ['', '', '', ...M, 'Completo', 'Revisado', 'En revisión', 'No Aplica', ''],
  ['No. Contrato o Pedido', 'Descripción', 'Proveedor', ...Array(12).fill(''), 'C', 'R', 'E', 'N', 'Total'],
  ['AIFA-C-LPN-DO-SVS-139/2025', 'Servicio de mantenimiento', 'Promex Extintores, S.A.', 'C', 'C', 'C', 'C', 'C', 'C', '', '', '', '', '', '', 6, 0, 0, 0, 6, 'Realiza entregas de forma semanal'],
  ['AIFA-C-LPN-DO-SVS-087/2025', 'Servicio de mantenimiento', 'Tekton Grupo Empresarial', 'C', 'c', 'C', 'C', 'C', 'R', 'C', '', '', '', '', '', 6, 1, 0, 0, 7, ''],
  ['AIFA-C-LPN-DO-SVS-086/2025.', 'Servicio de Mantenimiento', 'SEA Desarrollo', 'C', 'C', 'C', 'C', 'C', 'R', 'C', '', '', '', '', '', 6, 1, 0, 0, 7],
  ['AIFA-C-LPN-DO-SVS-067/2025', 'Servicio de mantenimiento', 'Alfredo Franco Huerta', 'N', 'C', 'C', 'N', 'N', 'N', 'N', 'C', 'C', 'C', 'N', 'N', 5, 0, 0, 7, 12],
  ['AIFA-C-LPN-DO-SVS-007/2025', 'Servicio de descontaminación', 'Javac', 'N', 'N', 'R', 'x?'],
  ['AIFA-C-AD-DO-ADQ-057-2025', 'Adquisición de herramientas', 'Comercializadora FJD AÉREO'],
  ['AIFA-C-LPN-DO-SVS-139/2025', 'repetido'],
  [],
  ['', 'C', 'Completo'],
  ['C', 'Completo'],
  ['R', 'Revisado'],
];
const leida = leerHojaAuditoria(hoja);
ok('seis contratos (sin el repetido ni la leyenda)', leida.filas.map((f) => f.contrato), [
  'AIFA-C-LPN-DO-SVS-139/2025', 'AIFA-C-LPN-DO-SVS-087/2025', 'AIFA-C-LPN-DO-SVS-086/2025',
  'AIFA-C-LPN-DO-SVS-067/2025', 'AIFA-C-LPN-DO-SVS-007/2025', 'AIFA-C-AD-DO-ADQ-057-2025',
]);
ok('año detectado', leida.anio, 2025);
ok('letras de un renglón', leida.filas[1].letras, { 1: 'C', 2: 'C', 3: 'C', 4: 'C', 5: 'C', 6: 'R', 7: 'C' });
ok('los doce meses del renglón con N', Object.keys(leida.filas[3].letras).length, 12);
ok('observación sin encabezado', leida.filas[0].observacion, 'Realiza entregas de forma semanal');
ok('proveedor', leida.filas[2].proveedor, 'SEA Desarrollo');
ok('sin letras, igual se lee', leida.filas[5].letras, {});
ok('avisa del repetido y de la celda rara', leida.avisos.length, 2);

const conTitulo = leerHojaAuditoria([['Control de entregables 2026'], ['Generado: hoy'], ['No. Contrato', 'Descripción', 'Proveedor', 'Ene', 'Feb', 'Mar', 'Observaciones'], ['AIFA-C-AD-DO-SVS-004/2026', 'x', 'Segman', 'C', 'E', '', 'nota']]);
ok('con títulos arriba y meses abreviados', [conTitulo.filas.length, conTitulo.filas[0].letras, conTitulo.filas[0].observacion], [1, { 1: 'C', 2: 'E' }, 'nota']);
ok('hoja que no es: avisa', leerHojaAuditoria([['Nombre', 'Puesto'], ['Ana', 'Jefa']]).filas.length, 0);

console.log('\n=== Planear la importación (nunca borra) ===');
const existentes = [
  { id: 10, contrato: 'AIFA-C-LPN-DO-SVS-139/2025', descripcion: 'Servicio de mantenimiento', proveedor: 'Promex Extintores, S.A.', observacion: null, orden: 1 },
  { id: 11, contrato: 'AIFA-C-LPN-DO-SVS-086/2025', descripcion: 'Descripción larga capturada', proveedor: null, observacion: 'ya había', orden: null },
];
const actuales = { '10-1': 'C', '10-2': 'E', '10-12': 'C', '11-1': 'C' };
const plan = planearImportacion(leida.filas, existentes, (id, mes) => actuales[`${id}-${mes}`] ?? null);
ok('nuevos: los que no existían', plan.nuevos.map((f) => f.contrato), [
  'AIFA-C-LPN-DO-SVS-087/2025', 'AIFA-C-LPN-DO-SVS-067/2025', 'AIFA-C-LPN-DO-SVS-007/2025', 'AIFA-C-AD-DO-ADQ-057-2025',
]);
ok('086 con punto se reconoce como existente', plan.actualizados.some((a) => a.id === 11), true);
ok('139: sólo cambia la observación', plan.actualizados.find((a) => a.id === 10)?.cambios, { observacion: 'Realiza entregas de forma semanal' });
const a11 = plan.actualizados.find((a) => a.id === 11)?.cambios;
ok('086: la descripción del archivo reemplaza, la observación vacía no borra', [a11?.descripcion, a11?.observacion, a11?.proveedor, a11?.orden], ['Servicio de Mantenimiento', undefined, 'SEA Desarrollo', 3]);
ok('E→C cuenta como cambio; C=C como igual', [plan.letrasQueCambian, plan.letrasIguales], [1, 2]);
ok('diciembre de 139 (vacío en el archivo) no se toca', plan.letras.some((l) => l.servicioId === 10 && l.mes === 12), false);

console.log('\n=== Pegar desde Excel ===');
ok('bloque de 2×3', leerPegado('C\tR\tE\r\nN\t\tc\r\n'), [['C', 'R', 'E'], ['N', null, 'C']]);
ok('lo que no se entiende no se toca', leerPegado('C\t?'), [['C', undefined]]);

console.log('\n=== Servicios del año: Estatus + Pagos ===');
const f = (s) => new Date(`${s}T12:00:00`);
const estatus27 = [
  { id: 1, nombre: 'Servicio de mantenimiento a elevadores', contrato: null, proveedor: null, inicio: null, fin: null, fase: 'En IM' },
  { id: 2, nombre: 'Servicio de limpieza', contrato: 'N/A', proveedor: '', inicio: null, fin: null, fase: 'Recepción de IM' },
  { id: 3, nombre: 'Servicio cancelado', contrato: null, proveedor: null, inicio: null, fin: null, fase: 'Cancelado' },
  { id: 4, nombre: null, contrato: null, proveedor: null, inicio: null, fin: null, fase: null },
];
const solo27 = fuentesDelAnio([], estatus27);
ok('2027: los servicios de Estatus aunque no tengan contrato', solo27.map((x) => [x.estatusId, x.contrato, x.fase]), [[1, null, 'En IM'], [2, null, 'Recepción de IM'], [3, null, 'Cancelado']]);
ok('"N/A" no es contrato', solo27[1].contrato, null);
ok('cancelado se marca', solo27.map((x) => x.cancelado), [false, false, true]);

const estatus26 = [
  { id: 10, nombre: 'Servicio de Control por riesgo de Fauna nociva', contrato: 'AIFA-C-LPN-DO-SVS-015/2026', proveedor: 'Fumigación', inicio: null, fin: null, fase: 'Adjudicado' },
  { id: 11, nombre: 'Servicio Médico en el Aeropuerto', contrato: null, proveedor: null, inicio: f('2026-03-01'), fin: f('2026-12-31'), fase: 'Publicado' },
  { id: 12, nombre: 'Servicio de jardinería', contrato: null, proveedor: null, inicio: null, fin: null, fase: 'En IM' },
];
const pagos26 = [
  { contrato: 'AIFA-C-LPN-DO-SVS-015/2026.', descripcion: 'Servicio de Control por riesgo de Fauna nociva', proveedor: 'Fumigación y Control Aviar', inicio: f('2026-01-01'), fin: f('2026-12-31') },
  { contrato: 'AIFA-C-LPN-DO-SVS-037/2026', descripcion: 'Servicio Médico en el Aeropuerto Internacional', proveedor: 'Jet Medical', inicio: f('2026-03-01'), fin: f('2026-12-31') },
  { contrato: 'AIFA-C-AD-DO-ADQ-093/2026', descripcion: 'Adquisición de consumibles ferreteros', proveedor: 'Fine Image', inicio: null, fin: null },
];
const de26 = fuentesDelAnio(pagos26, estatus26);
ok('por contrato: un solo renglón, contrato y fechas del pago', [de26[0].origen, de26[0].contrato, de26[0].proveedor, de26[0].inicio?.getMonth()], ['ambos', 'AIFA-C-LPN-DO-SVS-015/2026', 'Fumigación y Control Aviar', 0]);
ok('por nombre: Estatus sin contrato gana el de Pagos', [de26[1].origen, de26[1].contrato], ['ambos', 'AIFA-C-LPN-DO-SVS-037/2026']);
ok('en proceso: sigue sin contrato', [de26[2].origen, de26[2].contrato], ['estatus', null]);
ok('pago sin servicio en Estatus: entra aparte', [de26.length, de26[3].origen, de26[3].estatusId], [4, 'pagos', null]);

const yaAuditados = [
  { id: 100, contrato: 'AIFA-C-LPN-DO-SVS-015/2026', proveedor: 'Fumigación', estatus_id: null },
  { id: 101, contrato: null, proveedor: null, estatus_id: 11 },
];
const pend = pendientesDelAnio(de26, yaAuditados);
ok('nuevos: sólo los que no están', pend.nuevos.map((x) => x.estatusId ?? x.contrato), [12, 'AIFA-C-AD-DO-ADQ-093/2026']);
ok('se liga a Estatus el que ya estaba por contrato', pend.actualizar.find((a) => a.id === 100)?.cambios, { estatus_id: 10 });
ok('el que estaba sin contrato lo gana', pend.actualizar.find((a) => a.id === 101), { id: 101, cambios: { contrato: 'AIFA-C-LPN-DO-SVS-037/2026', proveedor: 'Jet Medical' }, ganaContrato: true });
ok('volver a traer no repite nada', pendientesDelAnio(de26, [
  ...yaAuditados.map((x) => ({ ...x, ...(pend.actualizar.find((a) => a.id === x.id)?.cambios ?? {}) })),
  { id: 102, contrato: null, proveedor: null, estatus_id: 12 },
  { id: 103, contrato: 'AIFA-C-AD-DO-ADQ-093/2026', proveedor: 'Fine Image', estatus_id: null },
]), { nuevos: [], actualizar: [] });
ok('fuenteDe: por liga o por contrato', [fuenteDe(yaAuditados[1], de26)?.estatusId, fuenteDe(yaAuditados[0], de26)?.estatusId], [11, 10]);

console.log(fallos ? `\n${fallos} prueba(s) FALLARON` : '\nTodas las pruebas pasan');
process.exit(fallos ? 1 : 0);
