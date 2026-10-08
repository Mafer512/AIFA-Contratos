/**
 * El superadmin fija la contraseña de otra persona desde Accesos → Usuarios.
 *
 * Sólo el superadmin (profiles.is_superadmin + rol ADMIN). Un ADMIN normal
 * recibe 403 aunque llame a la función a mano: el permiso se lee de profiles
 * con service_role, no de lo que diga el navegador.
 *
 * Al cambiarla se cierran las sesiones abiertas de esa persona: si se cambia
 * porque alguien más la conocía, ese alguien queda fuera en ese momento.
 * La contraseña nunca se guarda ni se registra; el historial sólo anota que
 * se cambió y quién lo hizo.
 *
 * Sin dependencias, igual que crear-usuario.
 */
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const MIN_PASSWORD = 8;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const fail = (status: number, code: string, message: string) => json(status, { ok: false, code, error: message });

const serviceHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

const callerId = async (authHeader: string): Promise<string | null> => {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY || SERVICE_KEY, Authorization: authHeader },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return typeof user?.id === "string" ? user.id : null;
};

type Perfil = { full_name: string | null; email: string | null; role: string | null; is_superadmin: boolean | null };

const perfilDe = async (userId: string): Promise<Perfil | null> => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=full_name,email,role,is_superadmin`,
    { headers: serviceHeaders },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] as Perfil : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "metodo", "Método no permitido.");
  if (!SUPABASE_URL || !SERVICE_KEY) return fail(500, "config", "La función no tiene configuradas sus llaves.");

  // ── 1. Sólo el superadmin ─────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const superId = authHeader.startsWith("Bearer ") ? await callerId(authHeader) : null;
  if (!superId) return fail(401, "sesion", "Tu sesión expiró. Vuelve a iniciar sesión.");

  const yo = await perfilDe(superId);
  if (!yo || String(yo.role).toUpperCase() !== "ADMIN" || yo.is_superadmin !== true) {
    return fail(403, "permiso", "Sólo el superadmin puede cambiar contraseñas.");
  }

  // ── 2. Datos ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "datos", "La solicitud no trae datos válidos.");
  }

  const userId = String(body.userId ?? "");
  const password = String(body.password ?? "");
  if (!UUID_RE.test(userId)) return fail(400, "usuario", "El usuario no es válido.");
  if (password.length < MIN_PASSWORD || password.length > 72) {
    return fail(400, "password", `La contraseña necesita de ${MIN_PASSWORD} a 72 caracteres.`);
  }

  // Supabase cierra todas las sesiones de la cuenta al cambiarle la contraseña:
  // hacerlo sobre la propia sacaría al superadmin a media pantalla. Para la
  // suya está "Enviar enlace", como cualquiera.
  if (userId === superId) {
    return fail(400, "propia", "Para tu propia contraseña usa \"Enviar enlace\" en tu fila.");
  }

  const destino = await perfilDe(userId);
  if (!destino) return fail(404, "usuario", "Ese usuario ya no existe.");

  // ── 3. Fuera las sesiones abiertas ────────────────────────────────────────
  // Supabase también las cierra al cambiar la contraseña, pero se hace aquí
  // primero para no depender de eso y para poder decir cuántas eran.
  let sesionesCerradas = 0;
  const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/revocar_sesiones`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({ p_user: userId }),
  });
  if (rpc.ok) sesionesCerradas = Number(await rpc.json()) || 0;
  else console.error("No se pudieron cerrar las sesiones:", rpc.status, await rpc.text());

  // ── 4. Contraseña ─────────────────────────────────────────────────────────
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: serviceHeaders,
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = String(err?.msg ?? err?.message ?? "");
    const code = String(err?.error_code ?? err?.code ?? "");
    if (res.status === 404 || code === "user_not_found") return fail(404, "usuario", "Ese usuario ya no existe.");
    if (code === "weak_password" || /password/i.test(msg)) {
      return fail(400, "password", "Supabase rechazó la contraseña por débil. Usa una más larga o genera una.");
    }
    console.error("Cambio de contraseña falló:", res.status, msg);
    return fail(502, "auth", "Supabase no pudo cambiar la contraseña. Intenta de nuevo.");
  }

  // ── 5. Historial: quién y cuándo, nunca la contraseña ─────────────────────
  const hist = await fetch(`${SUPABASE_URL}/rest/v1/change_history`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({
      table_name: "profiles",
      record_id: userId,
      action: "UPDATE",
      changed_by: superId,
      changed_by_name: yo.full_name,
      changed_by_role: "ADMIN",
      changes: [{ field: "contraseña", before: "••••••••", after: "cambiada por el superadmin" }],
      previous_data: null,
      new_data: { email: destino.email, full_name: destino.full_name, sesiones_cerradas: sesionesCerradas },
    }),
  });
  if (!hist.ok) console.error("No se registró en el historial:", hist.status, await hist.text());

  return json(200, { ok: true, email: destino.email, sesionesCerradas });
});
