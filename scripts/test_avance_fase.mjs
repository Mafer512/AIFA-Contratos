// Ejecutar con:  node --experimental-strip-types scripts/test_avance_fase.mjs
//
// "Avanzar fase" y la bandeja de "Mis servicios": qué celdas se escriben al
// avanzar, qué se rechaza y qué servicios piden atención.
import {
  FASES, indiceEtapa, planAvanzar, valoresPrevios, duracionesTipicas, estadoServicio,
  INDICE_ADJUDICADO, INDICE_CANCELADO, deISO,
} from '../utils/avanceFase.ts';

let fallos = 0;
const ok = (nombre, real, esperado) => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) fallos++;
  console.log(`${bien ? 'OK  ' : 'FALLA'} ${nombre.padEnd(62)} ${bien ? JSON.stringify(real) : `esperado ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)}`}`);
};
const E = 'Estatus';
const hoy = new Date(2026, 9, 8); // 8 oct 2026
const d = (s) => deISO(s);

console.log('=== En qué etapa está ===');
ok('sin estatus', indiceEtapa(''), -1);
ok('exacto', indiceEtapa('En IM'), 1);
ok('sin acentos ni mayúsculas', indiceEtapa('en revision defensa'), 5);
ok('capturado incompleto', indiceEtapa('Elaboración de anexo técnico'), 0);
ok('adjudicado', indiceEtapa('Adjudicado'), INDICE_ADJUDICADO);
ok('cancelado', indiceEtapa('CANCELADO'), INDICE_CANCELADO);
ok('9 fases, en orden', FASES.length, 9);

console.log('\n=== Avanzar ===');
const enIM = { [E]: 'En IM', 'Fecha remisión IM': '2026-09-15' };
let r = planAvanzar(enIM, E, d('2026-10-08'), hoy);
ok('En IM → escribe término, inicio de la siguiente y estatus', r.ok && r.plan.cambios, {
  'Fecha recepción IM': '2026-10-08', 'Fecha recepción IM área técnica': '2026-10-08', Estatus: 'Recepción de IM',
});
ok('no pide adjudicación', r.ok && r.plan.pideAdjudicacion, false);

r = planAvanzar({ [E]: '' }, E, d('2026-10-01'), hoy);
ok('sin estatus → inicia la primera fase', r.ok && r.plan.cambios, {
  'Fecha inicio elaboración anexo técnico': '2026-10-01', Estatus: FASES[0].estatus,
});

r = planAvanzar({ [E]: 'Publicado Compras MX', 'Fecha inicio publicación': '2026-08-01' }, E, d('2026-09-20'), hoy);
ok('Publicado → Adjudicado con fecha de fallo', r.ok && r.plan.cambios, { 'Fecha fallo': '2026-09-20', Estatus: 'Adjudicado' });
ok('… y pide los datos del contrato', r.ok && r.plan.pideAdjudicacion, true);

r = planAvanzar({ [E]: 'En IM' }, E, d('2026-10-08'), hoy, d('2026-09-01'));
ok('sin inicio capturado: guarda el que diga la persona', r.ok && r.plan.cambios['Fecha remisión IM'], '2026-09-01');

console.log('\n=== Lo que rechaza ===');
r = planAvanzar(enIM, E, d('2026-10-09'), hoy);
ok('fecha futura', r.ok ? 'aceptó' : r.error.startsWith('La fecha no puede ser futura'), true);
r = planAvanzar(enIM, E, d('2026-09-01'), hoy);
ok('antes de que empezara la fase', r.ok ? 'aceptó' : r.error.startsWith('No puede terminar antes'), true);
r = planAvanzar({ [E]: 'Adjudicado' }, E, hoy, hoy);
ok('ya adjudicado', r.ok ? 'aceptó' : r.error, 'El servicio ya está adjudicado.');
r = planAvanzar({ [E]: 'Cancelado' }, E, hoy, hoy);
ok('cancelado', r.ok ? 'aceptó' : r.error, 'El servicio está cancelado.');

console.log('\n=== Deshacer ===');
r = planAvanzar(enIM, E, d('2026-10-08'), hoy);
ok('guarda lo que había antes en cada celda', valoresPrevios(enIM, r.plan.cambios), {
  'Fecha recepción IM': null, 'Fecha recepción IM área técnica': null, Estatus: 'En IM',
});

console.log('\n=== Atención ===');
const historicos = [10, 12, 14, 30].map((dias, k) => ({
  'Fecha remisión IM': '2026-01-01',
  'Fecha recepción IM': `2026-01-${String(1 + dias).padStart(2, '0')}`,
  ID: k,
}));
const tipicas = duracionesTipicas(historicos);
ok('duración típica de En IM = mediana (13 días)', tipicas[1], 13);
ok('fase sin historia = 0', tipicas[0], 0);

const largo = estadoServicio({ [E]: 'En IM', 'Fecha remisión IM': '2026-09-01' }, { columnaEstatus: E, hoy, tipicas });
ok('37 días en una fase de 13 → "fase larga"', largo.alertas.map((a) => a.tipo), ['fase-larga']);
ok('días en la fase', largo.diasEnFase, 37);

const normal = estadoServicio({ [E]: 'En IM', 'Fecha remisión IM': '2026-09-28' }, { columnaEstatus: E, hoy, tipicas });
ok('10 días en una fase de 13 → sin alerta', normal.alertas, []);

const quieto = estadoServicio({ [E]: 'En IM', 'Fecha remisión IM': '2026-09-28' }, { columnaEstatus: E, hoy, tipicas, actualizado: d('2026-09-10') });
ok('28 días sin tocarse → "sin movimiento"', quieto.alertas.map((a) => a.tipo), ['sin-movimiento']);

const adj = estadoServicio({ [E]: 'Adjudicado' }, {
  columnaEstatus: E, hoy, tipicas, vigenciaTermino: d('2026-10-20'), garantiasFaltantes: 1,
  datosFaltantes: ['administrador'], actualizado: d('2026-05-01'),
});
ok('adjudicado: vence pronto, garantía y datos (no "sin movimiento")', adj.alertas.map((a) => a.tipo), ['vence', 'garantias', 'datos-contrato']);

const vencido = estadoServicio({ [E]: 'Adjudicado' }, { columnaEstatus: E, hoy, tipicas, vigenciaTermino: d('2026-09-30') });
ok('adjudicado vencido', vencido.alertas, [{ tipo: 'vencido', dias: 8 }]);
ok('lo vencido pesa más que lo que vence', vencido.puntaje > adj.alertas.filter((a) => a.tipo === 'vence').length * 60 - 1, true);

const cancel = estadoServicio({ [E]: 'Cancelado' }, { columnaEstatus: E, hoy, tipicas, actualizado: d('2026-01-01') });
ok('cancelado: sin alertas y al fondo de la bandeja', [cancel.alertas.length, cancel.puntaje < 0], [0, true]);

console.log(`\n${fallos === 0 ? 'TODO BIEN' : `${fallos} FALLA(S)`}`);
process.exitCode = fallos ? 1 : 0;
