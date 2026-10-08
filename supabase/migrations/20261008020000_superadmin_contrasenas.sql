-- =============================================================================
-- Superadmin: el único que fija contraseñas ajenas
--
-- QUÉ ES
-- Una marca (profiles.is_superadmin) encima del rol ADMIN, no un rol nuevo:
-- así todas las políticas que dicen current_app_role() = 'ADMIN' le siguen
-- aplicando sin tocarlas. Lo único que agrega es poder cambiarle la contraseña
-- a otra persona desde Accesos → Usuarios (función cambiar-password).
--
-- QUIÉN LO DA
-- Nadie desde la aplicación, ni el propio superadmin. Sólo el editor SQL:
--
--   update public.profiles set is_superadmin = true, role = 'ADMIN'
--    where email = 'correo@dominio';
--
-- Si un administrador pudiera marcarse, cualquier admin se volvería
-- superadmin con un clic y la separación no serviría de nada.
--
-- QUÉ MÁS CAMBIA
-- Un administrador normal ya no puede tocar la cuenta del superadmin (rol,
-- servicios, nombre): si pudiera bajarlo a Solo lectura, le quitaría el
-- control al único que puede cambiar contraseñas.
--
-- IDEMPOTENTE: se puede correr más de una vez.
--
-- OJO: 20261008030000_baja_usuarios.sql reemplaza profiles_guard() y
-- current_is_superadmin(). Si se vuelve a correr ésta, hay que correr aquella
-- después.
-- =============================================================================

begin;

alter table public.profiles
  add column if not exists is_superadmin boolean not null default false;

-- ¿Quien llama es superadmin? Exige también rol ADMIN: si alguien le quitara
-- el rol desde SQL y olvidara la marca, la marca sola no da nada.
create or replace function public.current_is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.is_superadmin and p.role = 'ADMIN' from public.profiles p where p.id = auth.uid()),
    false
  )
$$;

revoke all on function public.current_is_superadmin() from public, anon;
grant execute on function public.current_is_superadmin() to authenticated;

-- Mismo guardia de 20261008000000_perfiles_blindados.sql, con dos reglas más
-- (marcadas con ★).
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
    end if;
    return new;
  end if;

  -- ★ La marca de superadmin no se reparte desde la aplicación.
  if tg_op = 'INSERT' then
    new.is_superadmin := false;
  elsif new.is_superadmin is distinct from old.is_superadmin then
    raise exception 'La marca de superadmin sólo se asigna desde el editor SQL de Supabase.'
      using errcode = '42501';
  end if;

  if public.current_app_role() = 'ADMIN' then
    -- ★ La cuenta del superadmin sólo la toca él mismo.
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

-- Cierra todas las sesiones de una persona. La usa cambiar-password: si a
-- alguien le cambian la contraseña porque se la robaron, quien la tenga debe
-- quedarse fuera en ese momento, no cuando caduque su sesión.
-- Sólo service_role: desde el navegador nadie puede sacar a otro.
create or replace function public.revocar_sesiones(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.revocar_sesiones(uuid) from public, anon, authenticated;
grant execute on function public.revocar_sesiones(uuid) to service_role;

-- El superadmin inicial.
update public.profiles
   set is_superadmin = true, role = 'ADMIN'
 where email = 'isaacazhael161f@gmail.com';

commit;

-- =============================================================================
-- VERIFICACIÓN (scripts/test_alta_usuarios.mjs --vivo lo prueba)
--
--   select full_name, email from public.profiles where is_superadmin;
--
--   -- Con sesión de un ADMIN normal debe FALLAR con 42501:
--   update public.profiles set is_superadmin = true where id = auth.uid();
--
-- ROLLBACK
--
--   begin;
--   drop function if exists public.revocar_sesiones(uuid);
--   -- y volver a correr 20261008000000_perfiles_blindados.sql para el guardia
--   alter table public.profiles drop column if exists is_superadmin;
--   drop function if exists public.current_is_superadmin();
--   commit;
-- =============================================================================
