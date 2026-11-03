// Ejecutar con:  node --experimental-strip-types scripts/test_ayuda.mjs
//
// Asistente de ayuda: que cada respuesta apunte a pantallas que existen, que
// cada persona vea sólo lo que puede hacer y que el buscador encuentre la
// pregunta correcta con las palabras que usaría la gente.
import {
  TEMAS, DETALLES_DESTINO, temasPara, buscarPreguntas, elegirPorNumero, temaDeVista, nombreVista,
  destinoPara, vistaConocida, normalizar, palabras,
} from '../utils/ayuda.ts';

let fallos = 0;
const ok = (nombre, real, esperado) => {
  const bien = JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) fallos++;
  console.log(`${bien ? 'OK  ' : 'FALLA'} ${nombre.padEnd(66)} ${bien ? JSON.stringify(real) : `esperado ${JSON.stringify(esperado)}, dio ${JSON.stringify(real)}`}`);
};

const ADMIN = { role: 'ADMIN', modulos: null };
const SUPER = { role: 'ADMIN', isSuperAdmin: true, modulos: null };
const OPERADOR = { role: 'OPERATOR', modulos: null };
const LECTURA = { role: 'VIEWER', modulos: null };
const AUDITOR = { role: 'VIEWER', areaAuditoria: true, modulos: ['auditoria'] };

const preguntas = TEMAS.flatMap((t) => t.preguntas);
const ids = (lista) => lista.map((q) => q.id);
const primera = (perfil, texto) => buscarPreguntas(temasPara(perfil), texto)[0]?.id ?? null;

console.log('=== El contenido está bien armado ===');
ok('ids únicos', new Set(preguntas.map((q) => q.id)).size, preguntas.length);
ok('cada id empieza con el de su tema', TEMAS.every((t) => t.preguntas.every((q) => q.id.startsWith(`${t.id}.`))), true);
ok('toda respuesta trae resumen', preguntas.every((q) => q.resumen.trim().length > 10), true);
ok('vistas conocidas (temas, preguntas y destinos)', [
  ...TEMAS.flatMap((t) => t.vistas ?? []),
  ...preguntas.flatMap((q) => q.vistas ?? []),
  ...preguntas.flatMap((q) => (q.ir ? [q.ir.vista].flat() : [])),
].filter((v) => !vistaConocida(v)), []);
ok('detalles de destino conocidos', preguntas.filter((q) => q.ir?.detalle && !DETALLES_DESTINO.includes(q.ir.detalle)).map((q) => q.id), []);
ok('negritas cerradas (** en pares)', preguntas.filter((q) =>
  [q.resumen, q.tip ?? '', ...(q.pasos ?? []), ...(q.puntos ?? [])].some((s) => (s.match(/\*\*/g) ?? []).length % 2 !== 0)).map((q) => q.id), []);

console.log('\n=== Cada quien ve lo que puede hacer ===');
const temasDe = (p) => temasPara(p).map((t) => t.id);
ok('administrador: todos los temas', temasDe(ADMIN), TEMAS.map((t) => t.id));
ok('solo lectura: sin Administración', temasDe(LECTURA).includes('admin'), false);
ok('solo lectura: no ve cómo editar', ids(temasPara(LECTURA).flatMap((t) => t.preguntas)).filter((id) => ['estatus.editar', 'mis.avanzar', 'pagos.capturar'].includes(id)), []);
ok('solo lectura: sí ve por qué no puede editar', ids(temasPara(LECTURA).flatMap((t) => t.preguntas)).includes('cuenta.roles'), true);
ok('operador: edita pero no elimina', ['estatus.editar', 'estatus.eliminar'].map((id) => ids(temasPara(OPERADOR).flatMap((t) => t.preguntas)).includes(id)), [true, false]);
ok('admin sin superadmin: no ve dar de baja', ids(temasPara(ADMIN).flatMap((t) => t.preguntas)).includes('admin.baja'), false);
ok('superadmin: sí ve dar de baja', ids(temasPara(SUPER).flatMap((t) => t.preguntas)).includes('admin.baja'), true);
ok('sólo el superadmin ve cómo cambiar la suya', [ADMIN, SUPER].map((p) => ids(temasPara(p).flatMap((t) => t.preguntas)).includes('admin.micontrasena')), [false, true]);
ok('usuario de Auditoría: cuenta + Auditoría', temasDe(AUDITOR), ['cuenta', 'auditoria']);
ok('usuario de Auditoría: captura en Auditoría', ids(temasPara(AUDITOR).find((t) => t.id === 'auditoria').preguntas).includes('auditoria.capturar'), true);
ok('lectura sin área: no ve cómo capturar letras', ids(temasPara(LECTURA).find((t) => t.id === 'auditoria').preguntas).includes('auditoria.capturar'), false);
ok('sólo 2027: Mis servicios lleva a 2027', destinoPara({ role: 'OPERATOR', modulos: ['2027.mis'] }, TEMAS[1].preguntas[0].ir), '2027.mis');
ok('sin la vista: no hay botón para ir', destinoPara({ role: 'OPERATOR', modulos: ['auditoria'] }, TEMAS[1].preguntas[0].ir), null);
ok('Historial sólo para administradores', [destinoPara(ADMIN, { vista: 'historial', etiqueta: '' }), destinoPara(OPERADOR, { vista: 'historial', etiqueta: '' })], ['historial', null]);

console.log('\n=== Numeración como en el menú ===');
const t = temasPara(LECTURA);
ok('temas 1..n sin huecos', t.map((x) => x.numero), t.map((_, i) => i + 1));
ok('preguntas n.1..n.m sin huecos', t.every((x) => x.preguntas.every((q, j) => q.numero === `${x.numero}.${j + 1}`)), true);
ok('"2" elige el tema 2', elegirPorNumero(t, '2')?.tema.numero, 2);
ok('"2.3" elige la pregunta 2.3', elegirPorNumero(t, ' 2.3 ')?.pregunta?.numero, '2.3');
ok('"2,3" también', elegirPorNumero(t, '2,3')?.pregunta?.numero, '2.3');
ok('"99" no existe', elegirPorNumero(t, '99'), null);
ok('texto no es número', elegirPorNumero(t, 'pagos 2026'), null);

console.log('\n=== Pantalla actual ===');
ok('Pagos 2026 → tema Pagos', temaDeVista(temasPara(ADMIN), '2026.pagos')?.id, 'pagos');
ok('Accesos → Administración', temaDeVista(temasPara(ADMIN), 'accesos')?.id, 'admin');
ok('Resumen 2027 → Resumen', temaDeVista(temasPara(ADMIN), '2027.resumen')?.id, 'resumen');
ok('nombres de pantallas', ['2026.pagos', '2027.estatus', 'reportes.paaas', 'auditoria', 'historial'].map(nombreVista),
  ['Pagos 2026', 'Estatus servicios (2027)', 'PAAAS', 'Auditoría', 'Historial']);

console.log('\n=== El buscador entiende a la gente ===');
ok('normaliza acentos y signos', normalizar('¿Cómo cambio mi CONTRASEÑA?'), 'como cambio mi contrasena');
ok('quita palabras vacías y plurales', palabras('¿Cómo descargo los pagos?'), ['descargo', 'pago']);
const casos = [
  [ADMIN, 'olvidé mi contraseña', 'cuenta.recuperar'],
  [ADMIN, 'no me acuerdo de mi password', 'cuenta.recuperar'],
  [ADMIN, 'cómo cambio mi contraseña', 'cuenta.cambiar'],
  [ADMIN, 'se me cerró la sesión', 'cuenta.inactividad'],
  [OPERADOR, 'como avanzo de fase', 'mis.avanzar'],
  [OPERADOR, 'registrar el fallo', 'mis.fallo'],
  [OPERADOR, 'cancelar un servicio', 'mis.cancelar'],
  [ADMIN, 'descargar pdf de pagos', 'pagos.descargar'],
  [ADMIN, 'exportar a excel el reporte', 'pagos.descargar'],
  [ADMIN, 'qué significa la letra R', 'auditoria.letras'],
  [AUDITOR, 'importar mi hoja de excel', 'auditoria.importar'],
  [ADMIN, 'dar de alta un usuario nuevo', 'admin.alta'],
  [ADMIN, 'quién modificó este registro', 'admin.historial'],
  [SUPER, 'darle una contraseña temporal', 'admin.contrasena'],
  [ADMIN, 'quien esta conectado', 'admin.bitacora'],
  [OPERADOR, 'agregar una persona al organigrama', 'organigrama.agregar'],
  [OPERADOR, 'cambiar foto', 'organigrama.foto'],
  [OPERADOR, 'asignar responsable', 'estatus.responsable'],
  [OPERADOR, 'escribir una nota', 'gantt.nota'],
  [ADMIN, 'gantt', 'gantt.leer'],
  [ADMIN, 'garantía de cumplimiento', 'estatus.pago'],
  [ADMIN, 'PAAAS', 'pagos.paaas'],
  [ADMIN, 'filtrar por trimestre', 'resumen.periodo'],
  [ADMIN, 'instalar la app en el celular', 'cuenta.instalar'],
  [LECTURA, 'no puedo editar', 'cuenta.roles'],
  [LECTURA, 'no veo pagos', 'cuenta.vistas'],
];
for (const [perfil, texto, esperado] of casos) ok(`"${texto}"`, primera(perfil, texto), esperado);
ok('sin pistas: nada', buscarPreguntas(temasPara(ADMIN), 'xyzzy qwerty'), []);
ok('sólo palabras vacías: nada', buscarPreguntas(temasPara(ADMIN), '¿cómo le hago?'), []);
ok('"contrato" no confunde con "contraseña"', ids(buscarPreguntas(temasPara(ADMIN), 'contrato')).some((id) => id.startsWith('cuenta.')), false);
ok('superadmin: "cómo cambio mi contraseña" encuentra la suya', ids(buscarPreguntas(temasPara(SUPER), 'cómo cambio mi contraseña')).includes('admin.micontrasena'), true);
ok('superadmin: "olvidé mi contraseña" también', ids(buscarPreguntas(temasPara(SUPER), 'olvidé mi contraseña')).includes('admin.micontrasena'), true);
ok('lectura no encuentra dar de alta', ids(buscarPreguntas(temasPara(LECTURA), 'dar de alta un usuario')).includes('admin.alta'), false);
ok('máximo 5 resultados', buscarPreguntas(temasPara(ADMIN), 'servicio').length <= 5, true);

console.log(fallos ? `\n${fallos} prueba(s) FALLARON` : '\nTodas las pruebas pasaron');
process.exit(fallos ? 1 : 0);
