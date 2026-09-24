-- =============================================================================
-- Un administrador puede dar de alta y administrar perfiles
--
-- QUÉ HABILITA
-- La pantalla Accesos → Usuarios crea la cuenta con supabase.auth.signUp() y
-- justo después escribe su renglón en profiles (nombre, rol, responsable,
-- correo). Ese segundo paso lo hace el administrador con SU sesión, no la del
-- empleado nuevo, así que profiles necesita una política que lo permita: sin
-- ella la cuenta nace sin rol y sin responsable.
--
-- También cubre el cambio de rol desde esa misma lista.
--
-- POR QUÉ SE AÑADE EN VEZ DE REESCRIBIR
-- profiles ya tiene sus propias políticas (por eso hoy cada quien lee su
-- perfil al entrar). Las de aquí llevan nombres propios y en RLS varias
-- políticas del mismo comando se suman con OR, así que esto amplía lo que
-- puede el administrador sin tocar ni quitar nada de lo que ya funciona.
--
-- IDEMPOTENTE: se puede correr más de una vez.
-- =============================================================================

begin;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;

alter table public.profiles enable row level security;

-- Sólo se AÑADEN privilegios, nunca se revocan. profiles ya está cerrada a la
-- llave anónima (se comprobó: devuelve vacío sin sesión) y un `revoke all` aquí
-- podría quitar en silencio algún permiso del que dependa una parte de la app
-- que no se esté viendo ahora mismo. Lo que falta es el INSERT, para que el
-- administrador pueda crear el perfil del usuario que acaba de dar de alta.
grant select, insert, update on public.profiles to authenticated;

-- Lectura: el administrador ve a todo el mundo (necesita la lista para
-- administrarla). El resto sigue viendo lo suyo por las políticas que ya había.
drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select
  on public.profiles for select to authenticated
  using (public.current_app_role() = 'ADMIN');

-- Alta: sólo el administrador crea perfiles de otras personas.
drop policy if exists profiles_admin_insert on public.profiles;
create policy profiles_admin_insert
  on public.profiles for insert to authenticated
  with check (public.current_app_role() = 'ADMIN');

-- Edición: rol, responsable y nombre de cualquiera.
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update
  on public.profiles for update to authenticated
  using (public.current_app_role() = 'ADMIN')
  with check (public.current_app_role() = 'ADMIN');

-- Cada quien sigue viendo su propio perfil. Esta es la que usa App.tsx al
-- iniciar sesión para averiguar su rol; se declara explícitamente para que no
-- dependa de cómo estuvieran las políticas previas.
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select
  on public.profiles for select to authenticated
  using (id = auth.uid());

-- Ojo: NO se da política de UPDATE sobre uno mismo. Si la hubiera, cualquier
-- usuario podría ascenderse a ADMIN con una sola llamada a la API, y toda la
-- separación de perfiles se vendría abajo.

commit;

-- =============================================================================
-- VERIFICACIÓN
--
--   -- Con sesión de admin: devuelve a todos.
--   -- Con sesión de operador: devuelve solamente su propio renglón.
--   select id, full_name, role from public.profiles;
--
--   -- Con sesión de operador debe FALLAR (0 filas afectadas):
--   update public.profiles set role = 'ADMIN' where id = auth.uid();
--
-- ROLLBACK
--
--   begin;
--   drop policy if exists profiles_admin_select on public.profiles;
--   drop policy if exists profiles_admin_insert on public.profiles;
--   drop policy if exists profiles_admin_update on public.profiles;
--   drop policy if exists profiles_self_select  on public.profiles;
--   commit;
-- =============================================================================
