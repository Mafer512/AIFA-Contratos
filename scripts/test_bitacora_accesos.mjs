// Ejecutar con:  node --experimental-strip-types scripts/test_bitacora_accesos.mjs
//
// Pruebas de la lógica pura: duraciones, tiempos relativos, dispositivos y el
// cálculo de "en línea / tiempo de sesión" de la bitácora.
import { formatDuration, formatRelativeTime, describeDevice, isMobileDevice } from '../utils/formatters.ts';

let fallos = 0;
const ok = (nombre, real, esperado) => {
  const bien = real === esperado;
  if (!bien) fallos++;
  console.log(`${bien ? 'OK  ' : 'FALLA'} ${nombre.padEnd(46)} ${bien ? real : `esperado "${esperado}", dio "${real}"`}`);
};

const MIN = 60_000, HORA = 3_600_000, DIA = 86_400_000;

console.log('=== formatDuration ===');
ok('30 segundos', formatDuration(30_000), '30 s');
ok('exactamente 1 minuto', formatDuration(MIN), '1 min');
ok('45 minutos', formatDuration(45 * MIN), '45 min');
ok('exactamente 1 hora', formatDuration(HORA), '1 h');
ok('2 h 15 min', formatDuration(2 * HORA + 15 * MIN), '2 h 15 min');
ok('jornada de 8 h', formatDuration(8 * HORA), '8 h');
ok('mas de un dia', formatDuration(DIA + 3 * HORA), '1 d 3 h');
ok('cero', formatDuration(0), '0 s');
ok('negativo no revienta', formatDuration(-5), '—');
ok('NaN no revienta', formatDuration(NaN), '—');

console.log('\n=== formatRelativeTime ===');
const ahora = Date.now();
ok('hace instantes', formatRelativeTime(ahora - 10_000, ahora), 'ahora mismo');
ok('hace 5 min', formatRelativeTime(ahora - 5 * MIN, ahora), 'hace 5 min');
ok('hace 3 h', formatRelativeTime(ahora - 3 * HORA, ahora), 'hace 3 h');
ok('ayer', formatRelativeTime(ahora - DIA, ahora), 'ayer');
ok('hace 5 dias', formatRelativeTime(ahora - 5 * DIA, ahora), 'hace 5 días');
ok('hace 2 meses', formatRelativeTime(ahora - 62 * DIA, ahora), 'hace 2 meses');
ok('futuro no revienta', formatRelativeTime(ahora + MIN, ahora), 'en un momento');

console.log('\n=== describeDevice ===');
ok('Windows Chrome', describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'), 'Windows · Chrome');
ok('Windows Edge (no Chrome)', describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0'), 'Windows · Edge');
ok('iPhone Safari', describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'), 'iPhone · Safari');
ok('Android Chrome', describeDevice('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'), 'Android · Chrome');
ok('sin user agent', describeDevice(null), 'Desconocido');
ok('iPhone es movil', String(isMobileDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')), 'true');
ok('Windows no es movil', String(isMobileDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')), 'false');

console.log('\n=== Bitácora: en línea y duración ===');
// Mismas reglas que Dashboard.tsx
const VENTANA = 3 * MIN;
const finSesion = (e) => new Date(e.logout_at ?? e.last_seen_at).getTime();
const enLinea = (e, now) => !e.logout_at && now - new Date(e.last_seen_at).getTime() < VENTANA;
const duracion = (e, now) => Math.max(0, (enLinea(e, now) ? now : finSesion(e)) - new Date(e.login_at).getTime());
const iso = (ms) => new Date(ms).toISOString();

// 1. Alguien trabajando ahora: latió hace 30 s.
const activo = { login_at: iso(ahora - 2 * HORA), last_seen_at: iso(ahora - 30_000), logout_at: null };
ok('sesion activa se ve en linea', String(enLinea(activo, ahora)), 'true');
ok('sesion activa dura 2 h', formatDuration(duracion(activo, ahora)), '2 h');

// 2. Cerró sesión con el botón.
const cerrada = { login_at: iso(ahora - 3 * HORA), last_seen_at: iso(ahora - 2 * HORA), logout_at: iso(ahora - 2 * HORA) };
ok('sesion cerrada no esta en linea', String(enLinea(cerrada, ahora)), 'false');
ok('sesion cerrada dura 1 h', formatDuration(duracion(cerrada, ahora)), '1 h');

// 3. EL CASO CRÍTICO: cerró el navegador de golpe hace horas, sin logout_at.
//    No debe verse "en línea" ni acumular tiempo indefinidamente.
const abandonada = { login_at: iso(ahora - 5 * HORA), last_seen_at: iso(ahora - 4 * HORA), logout_at: null };
ok('navegador cerrado NO sigue en linea', String(enLinea(abandonada, ahora)), 'false');
ok('navegador cerrado dura 1 h, no 5', formatDuration(duracion(abandonada, ahora)), '1 h');

// 4. Justo en el borde de la ventana (latió hace 2 min: sigue dentro).
const borde = { login_at: iso(ahora - HORA), last_seen_at: iso(ahora - 2 * MIN), logout_at: null };
ok('latido de hace 2 min sigue en linea', String(enLinea(borde, ahora)), 'true');

console.log('\n' + (fallos === 0 ? `TODAS LAS PRUEBAS PASARON` : `${fallos} PRUEBA(S) FALLARON`));
process.exit(fallos === 0 ? 0 : 1);
