/**
 * El superadmin da de baja (o reactiva) a una persona desde Accesos → Usuarios.
 *
 * Baja = desactivar, no borrar: la cuenta queda bloqueada en Auth, sus
 * sesiones se cierran y profiles.baja_at la marca. El perfil, la bitácora y el
 * historial se conservan, y "reactivar" lo deshace todo.
 *
 * Sólo el superadmin, igual que cambiar-password: el permiso se lee de
 * profiles con service_role. No puede darse de baja a sí mismo ni a otro
 * superadmin (primero se le quita la marca desde SQL).
 *
 * Sin dependencias, igual que crear-usuario y cambiar-password.
 */
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Auth no tiene "para siempre": cien años lo es en la práctica.
const BAN_PERMANENTE = "876000h";

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

type Perfil = {
  full_name: string | null;
  email: string | null;
  role: string | null;
  is_superadmin: boolean | null;
  baja_at: string | null;
};

const perfilDe = async (userId: string): Promise<Perfil | null> => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=full_name,email,role,is_superadmin,baja_at`,
    { headers: serviceHeaders },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] as Perfil : null;
};

const banear = (userId: string, duracion: string) =>
  fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers: serviceHeaders,
    body: JSON.stringify({ ban_duration: duracion }),
  });

const marcarPerfil = (userId: string, cambios: Record<string, unknown>) =>
  fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: serviceHeaders,
    body: JSON.stringify(cambios),
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "metodo", "Método no permitido.");
  if (!SUPABASE_URL || !SERVICE_KEY) return fail(500, "config", "La función no tiene configuradas sus llaves.");

  // ── 1. Sólo el superadmin ─────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const superId = authHeader.startsWith("Bearer ") ? await callerId(authHeader) : null;
  if (!superId) return fail(401, "sesion", "Tu sesión expiró. Vuelve a iniciar sesión.");

  const yo = await perfilDe(superId);
  if (!yo || String(yo.role).toUpperCase() !== "ADMIN" || yo.is_superadmin !== true || yo.baja_at) {
    return fail(403, "permiso", "Sólo el superadmin puede dar de baja usuarios.");
  }

  // ── 2. Datos ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "datos", "La solicitud no trae datos válidos.");
  }

  const userId = String(body.userId ?? "");
  const accion = String(body.accion ?? "");
  if (!UUID_RE.test(userId)) return fail(400, "usuario", "El usuario no es válido.");
  if (accion !== "baja" && accion !== "reactivar") return fail(400, "accion", "La acción no es válida.");
  if (userId === superId) return fail(400, "propia", "No puedes darte de baja a ti mismo.");

  const destino = await perfilDe(userId);
  if (!destino) return fail(404, "usuario", "Ese usuario ya no existe.");
  if (destino.is_superadmin) {
    return fail(400, "superadmin", "Esa cuenta es superadmin. Quítale la marca desde el editor SQL antes de darla de baja.");
  }

  // ── 3. Baja o reactivación ────────────────────────────────────────────────
  let sesionesCerradas = 0;
  let bajaAt: string | null = null;

  if (accion === "baja") {
    if (destino.baja_at) return fail(409, "ya", "Esa cuenta ya estaba dada de baja.");

    const ban = await banear(userId, BAN_PERMANENTE);
    if (!ban.ok) {
      console.error("Ban falló:", ban.status, await ban.text());
      return fail(502, "auth", "Supabase no pudo bloquear la cuenta. Intenta de nuevo.");
    }

    bajaAt = new Date().toISOString();
    const marca = await marcarPerfil(userId, { baja_at: bajaAt, baja_por: superId });
    if (!marca.ok) {
      // Sin la marca la lista la mostraría activa: se deshace el bloqueo.
      console.error("Marca de baja falló:", marca.status, await marca.text());
      await banear(userId, "none");
      return fail(500, "perfil", "No se pudo registrar la baja; no se cambió nada. Intenta de nuevo.");
    }

    const rpc = await fetch(`${SUPABASE_URL}/rest/v1/rpc/revocar_sesiones`, {
      method: "POST",
      headers: serviceHeaders,
      body: JSON.stringify({ p_user: userId }),
    });
    if (rpc.ok) sesionesCerradas = Number(await rpc.json()) || 0;
    else console.error("No se pudieron cerrar las sesiones:", rpc.status, await rpc.text());
  } else {
    if (!destino.baja_at) return fail(409, "ya", "Esa cuenta ya estaba activa.");

    const ban = await banear(userId, "none");
    if (!ban.ok) {
      console.error("Quitar ban falló:", ban.status, await ban.text());
      return fail(502, "auth", "Supabase no pudo desbloquear la cuenta. Intenta de nuevo.");
    }
    const marca = await marcarPerfil(userId, { baja_at: null, baja_por: null });
    if (!marca.ok) {
      console.error("Quitar marca falló:", marca.status, await marca.text());
      await banear(userId, BAN_PERMANENTE);
      return fail(500, "perfil", "No se pudo reactivar; no se cambió nada. Intenta de nuevo.");
    }
  }

  // ── 4. Historial ──────────────────────────────────────────────────────────
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
      changes: [{
        field: "estado",
        before: accion === "baja" ? "activo" : "dado de baja",
        after: accion === "baja" ? "dado de baja" : "activo",
      }],
      previous_data: null,
      new_data: { email: destino.email, full_name: destino.full_name, sesiones_cerradas: sesionesCerradas },
    }),
  });
  if (!hist.ok) console.error("No se registró en el historial:", hist.status, await hist.text());

  return json(200, { ok: true, accion, bajaAt, sesionesCerradas });
});
