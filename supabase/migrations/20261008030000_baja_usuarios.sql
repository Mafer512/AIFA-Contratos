-- =============================================================================
-- Dar de baja (y reactivar) usuarios — sólo el superadmin
--
-- QUÉ ES "BAJA"
-- Desactivar, no borrar. La cuenta queda bloqueada en Auth (ban) y sus
-- sesiones se cierran, pero el perfil, la bitácora y el historial se quedan:
-- lo que la persona capturó sigue firmado con su nombre y, si fue un error,
-- se reactiva con un clic. Lo hace la función baja-usuario con service_role.
--
-- Aquí se agrega:
--   · profiles.baja_at / baja_por — cuándo y quién. null = activa.
--   · current_app_role(), is_admin() y current_is_superadmin() ignoran a los
--     dados de baja. El ban impide volver a entrar, pero un token de acceso
--     ya emitido sigue vivo hasta una hora; con esto, durante esa hora la
--     base ya no le reconoce ningún rol.
--   · profiles_guard: nadie con sesión toca baja_at / baja_por, ni siquiera
--     un ADMIN. Sólo la función (service_role) o el editor SQL.
--
-- IDEMPOTENTE: se puede correr más de una vez.
--
-- OJO: 20260924000000, 20260924020000, 20260924030000 y 20260930010000
-- redefinen current_app_role() sin mirar baja_at. Si se vuelve a correr
-- cualquiera de ellas, hay que correr ésta después.
-- =============================================================================

begin;

alter table public.profiles
  add column if not exists baja_at timestamptz,
  add column if not exists baja_por uuid;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.baja_at is null
$$;

revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;

-- is_admin() la usa la política vieja "Solo Admins pueden modificar".
create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'ADMIN' and baja_at is null
  );
end;
$$;

create or replace function public.current_is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.is_superadmin and p.role = 'ADMIN' and p.baja_at is null
       from public.profiles p where p.id = auth.uid()),
    false
  )
$$;

revoke all on function public.current_is_superadmin() from public, anon;
grant execute on function public.current_is_superadmin() to authenticated;

-- Mismo guardia de 20261008020000_superadmin_contrasenas.sql, con la baja
-- (marcada con ★).
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
  if jwt_role = 'service_role' then
    return new;
  end if;

  if jwt_role = '' then
    if tg_op = 'INSERT' and session_user = 'supabase_auth_admin' then
      new.role := 'VIEWER';
      new.can_reset_passwords := false;
      new.is_superadmin := false;
      new.baja_at := null;
      new.baja_por := null;
    end if;
    return new;
  end if;

  -- La marca de superadmin y ★ la baja no se reparten desde la aplicación.
  if tg_op = 'INSERT' then
    new.is_superadmin := false;
    new.baja_at := null;
    new.baja_por := null;
  elsif new.is_superadmin is distinct from old.is_superadmin then
    raise exception 'La marca de superadmin sólo se asigna desde el editor SQL de Supabase.'
      using errcode = '42501';
  elsif new.baja_at is distinct from old.baja_at or new.baja_por is distinct from old.baja_por then
    raise exception 'Las bajas sólo las hace el superadmin desde Accesos → Usuarios.'
      using errcode = '42501';
  end if;

  if public.current_app_role() = 'ADMIN' then
    if tg_op = 'UPDATE' and old.is_superadmin and not public.current_is_superadmin() then
      raise exception 'Sólo el superadmin puede modificar la cuenta del superadmin.'
        using errcode = '42501';
    end if;
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

commit;

-- =============================================================================
-- VERIFICACIÓN (scripts/test_alta_usuarios.mjs --vivo lo prueba)
--
--   select full_name, email, baja_at from public.profiles where baja_at is not null;
--
--   -- Con sesión de un ADMIN normal debe FALLAR con 42501:
--   update public.profiles set baja_at = now() where id = '<otro>';
--
-- ROLLBACK (antes, reactivar a quien siga dado de baja desde la app)
--
--   begin;
--   -- volver a correr 20261008020000_superadmin_contrasenas.sql (guardia y
--   -- current_is_superadmin) y 20260924030000 (current_app_role)
--   alter table public.profiles drop column if exists baja_at, drop column if exists baja_por;
--   commit;
-- =============================================================================
