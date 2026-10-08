// Ejecutar con:
//   node --experimental-strip-types scripts/test_alta_usuarios.mjs          (sólo la función, sin red)
//   node --experimental-strip-types scripts/test_alta_usuarios.mjs --vivo   (además, contra el proyecto real)
//
// PARTE 1 — Las funciones crear-usuario y cambiar-password contra un Supabase
// simulado: quién puede llamarlas, qué validan y qué dejan registrado.
//
// PARTE 2 (--vivo) — Contra el proyecto real, con la llave pública del bundle.
//   · Con el registro público abierto crea UNA cuenta pidiendo ADMIN y
//     comprueba que nazca VIEWER y no pueda darse permisos. Cerrado, comprueba
//     que signUp se rechace.
//   · Con QA_EMAIL / QA_PASSWORD entra con esa cuenta. Si es VIEWER repite los
//     ataques; si es ADMIN (ascendida a mano desde SQL) hace un alta real con
//     la función y entra con la cuenta nueva. Después, si es ADMIN normal
//     comprueba que no pueda tocar contraseñas ni al superadmin; si además es
//     superadmin (is_superadmin desde SQL), cambia la contraseña de la cuenta
//     nueva y comprueba que la vieja deje de servir y su sesión se cierre.
// Las cuentas que crea se borran a mano en Supabase → Authentication → Users.

let fallos = 0;
const ok = (nombre, real, esperado) => {
  const bien = real === esperado;
  if (!bien) fallos++;
  console.log(`${bien ? 'OK  ' : 'FALLA'} ${nombre.padEnd(58)} ${bien ? real : `esperado "${esperado}", dio "${real}"`}`);
};

// ─────────────────────────────────────────────────────────────────────────────
// PARTE 1
// ─────────────────────────────────────────────────────────────────────────────
const fetchReal = globalThis.fetch;
const URL_SB = 'https://simulado.supabase.co';
let handler = null;
globalThis.Deno = {
  env: { get: (k) => ({ SUPABASE_URL: URL_SB, SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon' })[k] },
  serve: (h) => { handler = h; },
};

// Estado del Supabase simulado.
const SUPER = '11111111-1111-4111-8111-111111111111';
const DEST = '44444444-4444-4444-8444-444444444444';
const TOKENS = { 'Bearer admin': 'id-admin', 'Bearer operador': 'id-oper', 'Bearer super': SUPER };
let perfiles, cuentas, llamadas, falloPerfil, passwords, historial;
const reiniciar = () => {
  perfiles = {
    'id-admin': { role: 'ADMIN', is_superadmin: false, full_name: 'Admin Normal', email: 'admin@aifa.aero' },
    'id-oper': { role: 'OPERATOR', is_superadmin: false },
    [SUPER]: { role: 'ADMIN', is_superadmin: true, full_name: 'Súper Admin', email: 'super@aifa.aero' },
    [DEST]: { role: 'OPERATOR', is_superadmin: false, full_name: 'Persona Destino', email: 'destino@aifa.aero' },
  };
  cuentas = new Set(['ya@aifa.aero']);
  llamadas = [];
  falloPerfil = false;
  passwords = {};
  historial = [];
};

const resp = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const metodo = init.method ?? 'GET';
  const auth = init.headers?.Authorization;
  llamadas.push({ metodo, ruta: u.pathname, auth, body: init.body ? JSON.parse(init.body) : null });

  if (u.pathname === '/auth/v1/user') {
    const id = TOKENS[auth];
    return id ? resp(200, { id }) : resp(401, { msg: 'invalid JWT' });
  }
  if (u.pathname === '/rest/v1/profiles' && metodo === 'GET') {
    if (auth !== 'Bearer service') return resp(401, {});
    const id = u.searchParams.get('id').replace('eq.', '');
    return resp(200, perfiles[id] ? [perfiles[id]] : []);
  }
  if (u.pathname === '/auth/v1/admin/users' && metodo === 'POST') {
    if (auth !== 'Bearer service') return resp(401, {});
    const { email } = JSON.parse(init.body);
    if (cuentas.has(email)) return resp(422, { error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
    cuentas.add(email);
    return resp(200, { id: 'id-nuevo', email });
  }
  if (u.pathname === '/rest/v1/profiles' && metodo === 'POST') {
    if (falloPerfil) return resp(500, { message: 'boom' });
    const fila = JSON.parse(init.body);
    perfiles[fila.id] = fila;
    return resp(201, [fila]);
  }
  if (u.pathname.startsWith('/auth/v1/admin/users/') && metodo === 'DELETE') {
    return resp(200, {});
  }
  if (u.pathname.startsWith('/auth/v1/admin/users/') && metodo === 'PUT') {
    if (auth !== 'Bearer service') return resp(401, {});
    const id = u.pathname.split('/').pop();
    if (!perfiles[id]) return resp(404, { error_code: 'user_not_found', msg: 'User not found' });
    passwords[id] = JSON.parse(init.body).password;
    return resp(200, { id });
  }
  if (u.pathname === '/rest/v1/rpc/revocar_sesiones') {
    return auth === 'Bearer service' ? resp(200, 2) : resp(401, {});
  }
  if (u.pathname === '/rest/v1/change_history' && metodo === 'POST') {
    historial.push(JSON.parse(init.body));
    return resp(201, {});
  }
  return resp(404, { msg: `ruta no simulada ${metodo} ${u.pathname}` });
};

await import('../supabase/functions/crear-usuario/index.ts');
const handlerCrear = handler;
await import('../supabase/functions/cambiar-password/index.ts');
const handlerCambiar = handler;

const valido = { fullName: '  Ana   Pérez Ruiz ', email: ' Ana.Perez@AIFA.aero ', password: 'Temporal2026', role: 'operator', responsable: 'Mantenimiento' };
const llamar = async (token, body = valido, metodo = 'POST') => {
  const headers = token ? { Authorization: token } : {};
  const r = await handlerCrear(new Request('http://f/crear-usuario', { method: metodo, headers, body: metodo === 'POST' ? JSON.stringify(body) : undefined }));
  return { status: r.status, body: await r.json().catch(() => null), cors: r.headers.get('Access-Control-Allow-Origin') };
};
const creoCuenta = () => llamadas.some(l => l.ruta === '/auth/v1/admin/users' && l.metodo === 'POST');

console.log('=== Función crear-usuario: quién puede ===');
reiniciar();
let r = await llamar(null);
ok('sin sesión → 401', r.status, 401);
ok('sin sesión no crea cuenta', creoCuenta(), false);

reiniciar();
r = await llamar('Bearer token-falso');
ok('token inválido → 401', r.status, 401);

reiniciar();
r = await llamar('Bearer operador');
ok('operador → 403', r.status, 403);
ok('operador no crea cuenta', creoCuenta(), false);

reiniciar();
r = await handlerCrear(new Request('http://f/crear-usuario', { method: 'OPTIONS' }));
ok('preflight CORS responde', r.status, 200);

console.log('\n=== Función crear-usuario: validaciones ===');
for (const [nombre, cambio, codigo] of [
  ['nombre vacío', { fullName: ' ' }, 'nombre'],
  ['correo sin @', { email: 'ana.aifa.aero' }, 'correo'],
  ['contraseña de 7', { password: 'Abc1234' }, 'password'],
  ['contraseña de 73', { password: 'a'.repeat(73) }, 'password'],
  ['rol inventado SUPERADMIN', { role: 'SUPERADMIN' }, 'rol'],
  ['rol vacío', { role: '' }, 'rol'],
]) {
  reiniciar();
  r = await llamar('Bearer admin', { ...valido, ...cambio });
  ok(`${nombre} → 400 ${codigo}`, `${r.status} ${r.body?.code}`, `400 ${codigo}`);
  ok(`${nombre} no crea cuenta`, creoCuenta(), false);
}

console.log('\n=== Función crear-usuario: alta ===');
reiniciar();
r = await llamar('Bearer admin');
ok('admin → 200', r.status, 200);
ok('responde con CORS', r.cors, '*');
const alta = llamadas.find(l => l.ruta === '/auth/v1/admin/users');
ok('correo normalizado', alta.body.email, 'ana.perez@aifa.aero');
ok('cuenta confirmada (entra directo)', alta.body.email_confirm, true);
ok('el rol NO va en user_metadata', alta.body.user_metadata.role, undefined);
ok('Auth se llama con service_role', alta.auth, 'Bearer service');
ok('perfil: nombre sin espacios de más', perfiles['id-nuevo'].full_name, 'Ana Pérez Ruiz');
ok('perfil: rol en mayúsculas', perfiles['id-nuevo'].role, 'OPERATOR');
ok('perfil: responsable', perfiles['id-nuevo'].responsable, 'Mantenimiento');
ok('perfil: correo', perfiles['id-nuevo'].email, 'ana.perez@aifa.aero');

reiniciar();
r = await llamar('Bearer admin', { ...valido, responsable: '' });
ok('responsable vacío → todos (null)', perfiles['id-nuevo'].responsable, null);

reiniciar();
r = await llamar('Bearer admin', { ...valido, email: 'ya@aifa.aero' });
ok('correo repetido → 409 duplicado', `${r.status} ${r.body?.code}`, '409 duplicado');

reiniciar();
falloPerfil = true;
r = await llamar('Bearer admin');
ok('perfil falla → 500', r.status, 500);
ok('perfil falla → se borra la cuenta creada', llamadas.some(l => l.metodo === 'DELETE' && l.ruta === '/auth/v1/admin/users/id-nuevo'), true);

reiniciar();
r = await llamar('Bearer admin', valido, 'GET');
ok('GET → 405', r.status, 405);

console.log('\n=== Función cambiar-password: quién puede ===');
const cambiar = async (token, body) => {
  const headers = token ? { Authorization: token } : {};
  const res = await handlerCambiar(new Request('http://f/cambiar-password', { method: 'POST', headers, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json().catch(() => null) };
};
const pwdNueva = 'NuevaClave2026';

reiniciar();
r = await cambiar(null, { userId: DEST, password: pwdNueva });
ok('sin sesión → 401', r.status, 401);

reiniciar();
r = await cambiar('Bearer operador', { userId: DEST, password: pwdNueva });
ok('operador → 403', r.status, 403);

reiniciar();
r = await cambiar('Bearer admin', { userId: DEST, password: pwdNueva });
ok('ADMIN normal → 403', r.status, 403);
ok('ADMIN normal no cambia nada', passwords[DEST], undefined);

reiniciar();
perfiles[SUPER].role = 'OPERATOR';
r = await cambiar('Bearer super', { userId: DEST, password: pwdNueva });
ok('marca de superadmin sin rol ADMIN → 403', r.status, 403);

console.log('\n=== Función cambiar-password: validaciones ===');
for (const [nombre, body, esperado] of [
  ['usuario que no es uuid', { userId: 'id-oper', password: pwdNueva }, '400 usuario'],
  ['contraseña de 7', { userId: DEST, password: 'Abc1234' }, '400 password'],
  ['contraseña de 73', { userId: DEST, password: 'a'.repeat(73) }, '400 password'],
  ['usuario que no existe', { userId: '99999999-9999-4999-8999-999999999999', password: pwdNueva }, '404 usuario'],
]) {
  reiniciar();
  r = await cambiar('Bearer super', body);
  ok(`${nombre} → ${esperado}`, `${r.status} ${r.body?.code}`, esperado);
  ok(`${nombre} no cambia nada`, Object.keys(passwords).length, 0);
}

console.log('\n=== Función cambiar-password: cambio ===');
reiniciar();
r = await cambiar('Bearer super', { userId: DEST, password: pwdNueva });
ok('superadmin → 200', r.status, 200);
ok('Auth recibe la contraseña nueva', passwords[DEST], pwdNueva);
ok('cierra las sesiones de la persona', llamadas.some(l => l.ruta === '/rest/v1/rpc/revocar_sesiones' && l.body?.p_user === DEST), true);
ok('informa cuántas sesiones cerró', r.body?.sesionesCerradas, 2);
ok('queda en el historial', historial.length, 1);
ok('historial: quién lo hizo', historial[0]?.changed_by, SUPER);
ok('historial: a quién', historial[0]?.record_id, DEST);
ok('historial NO contiene la contraseña', JSON.stringify(historial).includes(pwdNueva), false);

reiniciar();
r = await cambiar('Bearer super', { userId: SUPER, password: pwdNueva });
ok('su propia contraseña → 400 propia', `${r.status} ${r.body?.code}`, '400 propia');
ok('su propia contraseña no cambia nada', Object.keys(passwords).length, 0);
ok('ni le cierra la sesión', llamadas.some(l => l.ruta === '/rest/v1/rpc/revocar_sesiones'), false);

// ─────────────────────────────────────────────────────────────────────────────
// PARTE 2 — en vivo
// ─────────────────────────────────────────────────────────────────────────────
if (process.argv.includes('--vivo')) {
  globalThis.fetch = fetchReal;
  const { createClient } = await import('@supabase/supabase-js');
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../services/supabaseClient.ts', import.meta.url), 'utf8');
  const url = src.match(/supabaseUrl = '([^']+)'/)[1];
  const key = src.match(/supabaseAnonKey = '([^']+)'/)[1];
  const sb = createClient(url, key, { auth: { persistSession: false } });

  console.log('\n=== En vivo: un desconocido con la llave pública ===');
  let email = process.env.QA_EMAIL;
  let password = process.env.QA_PASSWORD;
  let id;
  if (email && password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    id = data.user.id;
    console.log(`(reusando ${email})`);
  } else {
    email = `qa.seguridad.${Date.now()}@example.com`;
    password = `Qa-${crypto.randomUUID()}`;
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name: 'QA seguridad (borrar)', role: 'ADMIN' } } });
    if (error) {
      ok('registro público cerrado', /signups? not allowed|disabled/i.test(error.message), true);
    } else {
      id = data.user.id;
      console.log(`Cuenta de prueba: ${email} / ${password}  (id ${id})`);
      console.log('  Reúsala con QA_EMAIL y QA_PASSWORD; bórrala al terminar.');
      ok('signUp pidiendo ADMIN da sesión (registro abierto)', Boolean(data.session), true);
    }
  }

  const { data: rol } = id ? await sb.rpc('current_app_role') : { data: null };
  const esAdmin = rol === 'ADMIN';

  if (!id) {
    // Registro cerrado y sin QA_EMAIL: no hay sesión con la que seguir.
  } else if (!esAdmin) {
    const leerRol = async () => (await sb.from('profiles').select('role, responsable').eq('id', id).maybeSingle()).data;

    const yo = await leerRol();
    ok('pidió ADMIN al registrarse → nace VIEWER', yo?.role, 'VIEWER');

    const { data: todos } = await sb.from('profiles').select('id');
    ok('sólo ve su propio perfil', todos?.length, 1);

    // RLS no da error: simplemente no toca ninguna fila. Lo que importa es
    // que después de intentarlo el perfil siga igual.
    await sb.from('profiles').update({ role: 'ADMIN' }).eq('id', id);
    ok('no puede ascenderse a ADMIN', (await leerRol())?.role, 'VIEWER');

    await sb.from('profiles').update({ responsable: 'Otro' }).eq('id', id);
    ok('no puede cambiarse los servicios', (await leerRol())?.responsable ?? null, yo?.responsable ?? null);

    await sb.auth.updateUser({ data: { role: 'ADMIN' } });
    const { data: rol2 } = await sb.rpc('current_app_role');
    ok('cambiar su user_metadata no le da ADMIN', rol2 === 'ADMIN', false);

    const ajeno = await sb.from('profiles').insert({ id: crypto.randomUUID(), full_name: 'Intruso', role: 'ADMIN' });
    ok('no puede crear perfiles', Boolean(ajeno.error), true);

    const logs = await sb.from('access_logs').select('user_id').neq('user_id', id).limit(1);
    ok('no ve accesos de otros', logs.data?.length ?? 0, 0);

    const hist = await sb.from('change_history').select('id').limit(1);
    ok('no ve el historial', hist.data?.length ?? 0, 0);

    const fn = await sb.functions.invoke('crear-usuario', { body: { ...valido, email: `x.${Date.now()}@example.com` } });
    ok('la función le niega el alta (403)', fn.error?.context?.status, 403);
  } else {
    // ── Camino feliz: la cuenta QA es ADMIN (ascendida a mano desde SQL) ──
    console.log('\n=== En vivo: alta real desde un administrador ===');
    const nuevoEmail = `qa.alta.${Date.now()}@example.com`;
    const nuevoPass = `Tmp-${crypto.randomUUID().slice(0, 12)}`;
    const alta = await sb.functions.invoke('crear-usuario', {
      body: { fullName: 'QA Alta (borrar)', email: nuevoEmail, password: nuevoPass, role: 'OPERATOR', responsable: 'QA' },
    });
    ok('la función crea la cuenta', alta.data?.ok, true);
    console.log(`Cuenta creada: ${nuevoEmail}  (id ${alta.data?.user?.id})`);

    const { data: perfil } = await sb.from('profiles').select('full_name, role, responsable, email').eq('id', alta.data?.user?.id).maybeSingle();
    ok('perfil con rol OPERATOR', perfil?.role, 'OPERATOR');
    ok('perfil con responsable', perfil?.responsable, 'QA');
    ok('perfil con correo', perfil?.email, nuevoEmail);

    const otra = createClient(url, key, { auth: { persistSession: false } });
    const entra = await otra.auth.signInWithPassword({ email: nuevoEmail, password: nuevoPass });
    ok('la persona nueva entra con su contraseña temporal', Boolean(entra.data.session), true);
    const { data: rolNuevo } = await otra.rpc('current_app_role');
    ok('y su rol en la base es OPERATOR', rolNuevo, 'OPERATOR');
    // La sesión de "otra" se deja abierta: abajo se comprueba que el cambio de
    // contraseña del superadmin la tumbe.

    const dup = await sb.functions.invoke('crear-usuario', {
      body: { fullName: 'QA Alta (borrar)', email: nuevoEmail, password: nuevoPass, role: 'OPERATOR' },
    });
    ok('el mismo correo otra vez → 409', dup.error?.context?.status, 409);

    const corta = await sb.functions.invoke('crear-usuario', {
      body: { fullName: 'QA Alta (borrar)', email: `y.${nuevoEmail}`, password: 'corta', role: 'OPERATOR' },
    });
    ok('contraseña corta → 400', corta.error?.context?.status, 400);

    const { data: todos } = await sb.from('profiles').select('id');
    ok('el admin sí ve la lista completa', (todos?.length ?? 0) > 1, true);

    // ── Contraseñas: sólo el superadmin ──
    const nuevoId = alta.data?.user?.id;
    const { data: soySuper } = await sb.rpc('current_is_superadmin');
    if (!soySuper) {
      console.log('\n=== En vivo: un ADMIN normal y las contraseñas ===');
      const fn = await sb.functions.invoke('cambiar-password', { body: { userId: nuevoId, password: 'OtraClave2026' } });
      ok('cambiar-password le responde 403', fn.error?.context?.status, 403);
      const sigue = await createClient(url, key, { auth: { persistSession: false } })
        .auth.signInWithPassword({ email: nuevoEmail, password: nuevoPass });
      ok('la contraseña de la persona no cambió', Boolean(sigue.data.session), true);

      const marca = await sb.from('profiles').update({ is_superadmin: true }).eq('id', id);
      ok('no puede marcarse superadmin', marca.error?.code, '42501');

      // Mismo valor que ya tiene: si el guardia fallara, no cambiaría nada.
      const { data: supers } = await sb.from('profiles').select('id, full_name').eq('is_superadmin', true).limit(1);
      if (supers?.[0]) {
        const toca = await sb.from('profiles').update({ full_name: supers[0].full_name }).eq('id', supers[0].id);
        ok('no puede modificar la cuenta del superadmin', toca.error?.code, '42501');
      }
    } else {
      console.log('\n=== En vivo: el superadmin cambia una contraseña ===');
      const nueva = `Nva-${crypto.randomUUID().slice(0, 10)}`;
      const fn = await sb.functions.invoke('cambiar-password', { body: { userId: nuevoId, password: nueva } });
      ok('la función la cambia', fn.data?.ok, true);
      ok('cerró la sesión abierta de la persona', (fn.data?.sesionesCerradas ?? 0) >= 1, true);

      const renovar = await otra.auth.refreshSession();
      ok('su sesión vieja ya no se puede renovar', Boolean(renovar.error), true);

      const tercera = createClient(url, key, { auth: { persistSession: false } });
      const vieja = await tercera.auth.signInWithPassword({ email: nuevoEmail, password: nuevoPass });
      ok('la contraseña vieja ya no entra', Boolean(vieja.error), true);
      const conNueva = await tercera.auth.signInWithPassword({ email: nuevoEmail, password: nueva });
      ok('la nueva sí entra', Boolean(conNueva.data.session), true);

      const { data: hist } = await sb.from('change_history').select('changes, new_data').eq('record_id', nuevoId).order('created_at', { ascending: false }).limit(1);
      ok('queda en el historial', hist?.[0]?.changes?.[0]?.field, 'contraseña');
      ok('el historial no guarda la contraseña', JSON.stringify(hist).includes(nueva), false);
    }
  }
}

console.log(`\n${fallos === 0 ? 'TODO BIEN' : `${fallos} FALLA(S)`}`);
process.exitCode = fallos ? 1 : 0;
