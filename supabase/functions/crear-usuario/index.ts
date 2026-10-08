/**
 * Alta de usuarios desde Accesos → Usuarios.
 *
 * POR QUÉ UNA FUNCIÓN Y NO signUp() EN EL NAVEGADOR
 * signUp() sólo funciona si el registro público está abierto, y abierto quiere
 * decir que cualquiera con la llave del bundle se crea una cuenta. Aquí la
 * cuenta la crea el servidor con la llave service_role —que nunca sale de
 * Supabase— y sólo después de comprobar que quien lo pide es ADMIN. Con esto el
 * registro público se puede cerrar sin perder el alta desde el panel.
 *
 * Sin dependencias a propósito: habla con Auth y PostgREST por fetch, así que
 * no hay import que resolver ni versión que se quede vieja.
 */
declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const ROLES = ["ADMIN", "OPERATOR", "VIEWER"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

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

/** Quién llama, según su propio token. null si el token no sirve. */
const callerId = async (authHeader: string): Promise<string | null> => {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ANON_KEY || SERVICE_KEY, Authorization: authHeader },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return typeof user?.id === "string" ? user.id : null;
};

/** El rol se lee de profiles con service_role: el token no se lo puede inventar. */
const roleOf = async (userId: string): Promise<string | null> => {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`,
    { headers: serviceHeaders },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows[0]?.role ? String(rows[0].role).toUpperCase() : null;
};

const deleteAuthUser = (id: string) =>
  fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, { method: "DELETE", headers: serviceHeaders });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "metodo", "Método no permitido.");
  if (!SUPABASE_URL || !SERVICE_KEY) return fail(500, "config", "La función no tiene configuradas sus llaves.");

  // ── 1. Sólo un ADMIN ──────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const adminId = authHeader.startsWith("Bearer ") ? await callerId(authHeader) : null;
  if (!adminId) return fail(401, "sesion", "Tu sesión expiró. Vuelve a iniciar sesión.");
  if ((await roleOf(adminId)) !== "ADMIN") {
    return fail(403, "permiso", "Sólo un administrador puede dar de alta usuarios.");
  }

  // ── 2. Datos ──────────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "datos", "La solicitud no trae datos válidos.");
  }

  const fullName = String(body.fullName ?? "").trim().replace(/\s+/g, " ");
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const role = String(body.role ?? "").toUpperCase();
  const responsableRaw = body.responsable == null ? "" : String(body.responsable).trim();
  const responsable = responsableRaw || null;

  if (fullName.length < 3 || fullName.length > 120) return fail(400, "nombre", "Escribe el nombre completo (3 a 120 caracteres).");
  if (!EMAIL_RE.test(email) || email.length > 254) return fail(400, "correo", "Revisa la dirección de correo.");
  if (password.length < MIN_PASSWORD || password.length > 72) {
    return fail(400, "password", `La contraseña temporal necesita de ${MIN_PASSWORD} a 72 caracteres.`);
  }
  if (!ROLES.includes(role)) return fail(400, "rol", "El nivel de permisos no es válido.");
  if (responsable && responsable.length > 200) return fail(400, "responsable", "El responsable no es válido.");

  // ── 3. Cuenta ─────────────────────────────────────────────────────────────
  // email_confirm: true porque quien da fe del correo es el administrador; la
  // persona entra directo con la contraseña temporal.
  const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: serviceHeaders,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    }),
  });
  const createdBody = await created.json().catch(() => ({}));

  if (!created.ok) {
    const msg = String(createdBody?.msg ?? createdBody?.message ?? createdBody?.error_description ?? "");
    const code = String(createdBody?.error_code ?? createdBody?.code ?? "");
    if (code === "email_exists" || /already (been )?registered|already exists/i.test(msg)) {
      return fail(409, "duplicado", "Ese correo ya tiene cuenta.");
    }
    if (code === "weak_password" || /password/i.test(msg)) {
      return fail(400, "password", "Supabase rechazó la contraseña por débil. Usa una más larga o genera una.");
    }
    console.error("Alta en Auth falló:", created.status, msg);
    return fail(502, "auth", "Supabase no pudo crear la cuenta. Intenta de nuevo.");
  }

  const newId = String(createdBody?.id ?? createdBody?.user?.id ?? "");
  if (!newId) return fail(502, "auth", "Supabase no devolvió la cuenta creada.");

  // ── 4. Perfil ─────────────────────────────────────────────────────────────
  // Upsert: el trigger de alta ya pudo haber creado el renglón (como VIEWER).
  const profile = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=id`, {
    method: "POST",
    headers: { ...serviceHeaders, Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ id: newId, full_name: fullName, email, role, responsable }),
  });

  if (!profile.ok) {
    // Sin perfil la cuenta quedaría a medias. Se deshace para que repetir el
    // alta funcione en vez de chocar con "ese correo ya tiene cuenta".
    console.error("Perfil falló:", profile.status, await profile.text());
    await deleteAuthUser(newId);
    return fail(500, "perfil", "No se pudo guardar el perfil; no se creó nada. Intenta de nuevo.");
  }

  return json(200, { ok: true, user: { id: newId, full_name: fullName, email, role, responsable } });
});
