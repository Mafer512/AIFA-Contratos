// Ejecutar con:  node --experimental-strip-types scripts/test_enlace_recuperacion.mjs
//
// Comprueba que authLink reconoce los enlaces que manda Supabase.
//
// Se prueba con URLs reales de cada caso porque aquí estaba el fallo: el enlace
// de restablecimiento metía a la persona a la aplicación sin darle nunca la
// pantalla para cambiar la contraseña.

let fallos = 0;
const ok = (nombre, real, esperado) => {
  const bien = real === esperado;
  if (!bien) fallos++;
  console.log(`${bien ? 'OK   ' : 'FALLA'} ${nombre.padEnd(52)} ${bien ? '' : `esperado ${esperado}, dio ${real}`}`);
};

// Carga authLink con una URL dada. Hay que reimportarlo cada vez porque parsea
// al evaluarse el módulo, que es justo lo que hace que gane la carrera.
const cargarCon = async (href) => {
  const url = new URL(href);
  globalThis.window = {
    location: { href, hash: url.hash, search: url.search, hostname: url.hostname },
  };
  const mod = await import(`../services/authLink.ts?t=${Math.random()}`);
  return mod;
};

console.log('=== Enlace de restablecimiento (flujo implicit, el de este proyecto) ===\n');

let m = await cargarCon('http://localhost:3001/#access_token=eyJhbGci.abc.def&expires_in=3600&refresh_token=xyz123&token_type=bearer&type=recovery');
ok('reconoce type=recovery en el hash', m.authLink.recovery, true);
ok('no lo confunde con alta', m.authLink.signup, false);
ok('sin error', m.authLink.error, null);
ok('esFlujoRecovery() lo confirma', m.esFlujoRecovery(), true);

console.log('\n=== Confirmación de alta (flujo que ya existía) ===\n');
m = await cargarCon('http://localhost:3001/#access_token=abc&type=signup');
ok('reconoce type=signup', m.authLink.signup, true);
ok('no lo toma por restablecimiento', m.authLink.recovery, false);

console.log('\n=== Enlace caducado o ya usado ===\n');
m = await cargarCon('http://localhost:3001/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
ok('entra en modo recuperación', m.authLink.recovery, true);
ok('trae explicación del error', m.authLink.error !== null, true);
ok('el mensaje habla de caducidad', /caduc/i.test(m.authLink.error ?? ''), true);

console.log('\n=== Carga normal, sin enlace ===\n');
m = await cargarCon('http://localhost:3001/');
ok('no activa recuperación', m.authLink.recovery, false);
ok('no activa alta', m.authLink.signup, false);
ok('esFlujoRecovery() es false', m.esFlujoRecovery(), false);

m = await cargarCon('http://localhost:3001/?algo=1#seccion');
ok('hash cualquiera no activa nada', m.esFlujoRecovery(), false);

console.log('\n=== Aviso tardío (el caso PKCE / evento que llega después) ===\n');
m = await cargarCon('http://localhost:3001/');
ok('arranca en false', m.esFlujoRecovery(), false);

let avisado = false;
const quitar = m.alDetectarRecovery(() => { avisado = true; });
m.marcarRecovery();
ok('marcarRecovery() lo enciende', m.esFlujoRecovery(), true);
ok('avisa a quien estaba escuchando', avisado, true);

quitar();
m.limpiarRecovery();
ok('limpiarRecovery() lo apaga', m.esFlujoRecovery(), false);

// El aviso puede llegar ANTES de que la interfaz se suscriba: es lo que pasaba
// de verdad, y por eso el estado se guarda en vez de sólo emitirse.
m = await cargarCon('http://localhost:3001/');
m.marcarRecovery();                       // Supabase avisa mientras React todavía no monta
ok('el aviso anterior a la suscripción no se pierde', m.esFlujoRecovery(), true);

console.log('\n' + (fallos === 0 ? 'TODAS LAS PRUEBAS PASARON' : `${fallos} PRUEBA(S) FALLARON`));
process.exit(fallos === 0 ? 0 : 1);
