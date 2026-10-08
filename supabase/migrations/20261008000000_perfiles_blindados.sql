-- =============================================================================
-- Nadie se da permisos a sí mismo
--
-- EL HUECO
-- Se comprobó el 2026-10-08 con una cuenta de prueba y sólo la llave pública
-- del bundle:
--
--   supabase.auth.signUp({ email, password, options: { data: { role: 'ADMIN' } } })
--
-- devolvía sesión al instante (el proyecto confirma correos solo) y el trigger
-- de alta (handle_new_user) copiaba ese role del navegador a profiles.
-- Resultado: cualquiera en internet se creaba una cuenta de ADMIN y veía
-- usuarios, bitácora e historial.
--
-- Además, la política vieja "Solo Lectura para Todos" dejaba a cualquier
-- usuario con sesión leer todos los perfiles: nombres, correos y roles.
--
-- LA REGLA
-- Un trigger en profiles decide quién puede tocar los campos que dan poder
-- (role, responsable, can_reset_passwords, email):
--
--   · service_role (la función crear-usuario) ............ todo
--   · editor SQL / migraciones (sin JWT) .................. todo
--   · Auth creando una cuenta (trigger de alta) ........... nace como VIEWER,
--                                                           diga lo que diga
--                                                           el navegador
--   · un ADMIN con sesión ................................. todo
--   · cualquier otro con sesión ........................... sólo su nombre
--
-- Va como trigger y no sólo como política porque el alta la hace Auth, que no
-- pasa por RLS: el trigger es lo único que alcanza a handle_new_user. Para el
-- UPDATE es una segunda llave: hoy RLS ya no deja a nadie editar su propio
-- perfil, y el trigger lo sigue impidiendo aunque mañana alguien agregue una
-- política así.
--
-- IDEMPOTENTE: se puede correr más de una vez.
--
-- OJO: 20261008020000_superadmin_contrasenas.sql reemplaza profiles_guard()
-- con las reglas del superadmin. Si se vuelve a correr ésta, hay que correr
-- aquella después.
-- =============================================================================

begin;

create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  -- La función crear-usuario escribe con service_role: es la vía oficial.
  if jwt_role = 'service_role' then
    return new;
  end if;

  -- Sin JWT: o es Auth (supabase_auth_admin) dando de alta una cuenta, o es
  -- alguien con la contraseña de la base (editor SQL, migraciones).
  if jwt_role = '' then
    if tg_op = 'INSERT' and session_user = 'supabase_auth_admin' then
      -- El rol que llegue aquí salió de user_metadata, que escribe el
      -- navegador. Nunca se cree: la cuenta nace sin permisos de edición y un
      -- administrador le da los que correspondan.
      new.role := 'VIEWER';
      new.can_reset_passwords := false;
    end if;
    return new;
  end if;

  -- Con sesión de usuario (authenticated / anon).
  if public.current_app_role() = 'ADMIN' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Sólo un administrador puede dar de alta perfiles.'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.responsable is distinct from old.responsable
     or new.can_reset_passwords is distinct from old.can_reset_passwords
     or new.email is distinct from old.email then
    raise exception 'Sólo un administrador puede cambiar rol, servicios o correo de un perfil.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.profiles_guard() from public, anon, authenticated;

drop trigger if exists profiles_guard_trg on public.profiles;
create trigger profiles_guard_trg
  before insert or update on public.profiles
  for each row execute function public.profiles_guard();

-- Lectura: cada quien ve su perfil (profiles_self_select) y el ADMIN ve todos
-- (profiles_admin_select), ambas de 20260924030000. Ésta sobraba y abría la
-- lista completa a cualquier sesión. La app sólo lee la lista entera en
-- Accesos → Usuarios, que es de administradores.
drop policy if exists "Solo Lectura para Todos" on public.profiles;

commit;

-- =============================================================================
-- VERIFICACIÓN (scripts/test_alta_usuarios.mjs lo prueba de punta a punta)
--
--   -- Con sesión de un Solo lectura no debe cambiar nada (0 filas):
--   update public.profiles set role = 'ADMIN' where id = auth.uid();
--
--   -- Con sesión de un Solo lectura debe devolver sólo su renglón:
--   select count(*) from public.profiles;
--
--   -- Una cuenta creada con signUp({ data: { role: 'ADMIN' } }) debe quedar:
--   select role from public.profiles where id = '<id nuevo>';   -- VIEWER
--
-- ROLLBACK
--
--   begin;
--   drop trigger if exists profiles_guard_trg on public.profiles;
--   drop function if exists public.profiles_guard();
--   create policy "Solo Lectura para Todos" on public.profiles
--     for select using (auth.role() = 'authenticated');
--   commit;
-- =============================================================================
