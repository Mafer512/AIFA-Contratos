-- =============================================================================
-- Bitácora de accesos — tabla access_logs
--
-- Proyecto Supabase: Contratos (hvabkxgxmthyqbgsjqgr). Es el único proyecto
-- donde la aplicación tiene sesión (auth), así que es el único donde auth.uid()
-- sirve para cerrar la tabla con RLS.
--
-- QUÉ GUARDA
-- Un renglón por sesión de trabajo. El navegador lo abre al entrar (login_at),
-- lo va tocando cada minuto mientras la persona sigue ahí (last_seen_at) y lo
-- cierra al salir (logout_at + logout_reason).
--
-- El tiempo en línea NO se guarda: se calcula como
--     coalesce(logout_at, last_seen_at) - login_at
-- Así, si alguien cierra el navegador de golpe y nunca llega el logout_at, el
-- último latido sigue dando una duración correcta con ~1 minuto de margen, en
-- vez de dejar la sesión abierta para siempre.
--
-- QUIÉN LA VE
-- Sólo los ADMIN ven todas las filas. Cualquier otro usuario autenticado ve
-- únicamente las suyas — necesita poder leerlas para reanudar su propia sesión
-- al recargar la página.
--
-- IDEMPOTENTE: se puede correr completo más de una vez sin duplicar nada.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Tabla
-- -----------------------------------------------------------------------------
create table if not exists public.access_logs (
  id            bigint generated always as identity primary key,

  -- Quién entró. Se desnormalizan nombre/correo/rol a propósito: la bitácora
  -- debe seguir siendo legible aunque después se renombre o se borre el perfil.
  user_id       uuid not null,
  user_email    text,
  user_name     text,
  user_role     text,

  -- Cuándo
  login_at      timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  logout_at     timestamptz,
  logout_reason text,

  -- Desde dónde
  user_agent    text,
  platform      text
);

-- La restricción va aparte y con guardia para que volver a correr la migración
-- sobre una tabla que ya existe no truene.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.access_logs'::regclass
      and conname  = 'access_logs_logout_reason_check'
  ) then
    alter table public.access_logs
      add constraint access_logs_logout_reason_check
      check (logout_reason is null or logout_reason in ('MANUAL', 'INACTIVIDAD', 'CIERRE'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2) Índices
--
-- La pantalla siempre pide "las últimas N sesiones" y "la última sesión de esta
-- persona". Esos son los dos índices.
-- -----------------------------------------------------------------------------
create index if not exists access_logs_login_at_idx
  on public.access_logs (login_at desc);

create index if not exists access_logs_user_idx
  on public.access_logs (user_id, login_at desc);

-- Sesiones abiertas (para el panel de "en línea ahora"): son pocas, pero se
-- consultan seguido.
create index if not exists access_logs_abiertas_idx
  on public.access_logs (last_seen_at desc)
  where logout_at is null;

-- -----------------------------------------------------------------------------
-- 3) Rol de la sesión actual
--
-- Misma función que usa estatus_2027. Se redefine aquí para que esta migración
-- se pueda correr sola, sin depender de que la de 2027 ya haya pasado.
-- security definer porque profiles está cerrada por RLS: sin eso, la política
-- no podría leer el rol de quien consulta.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 4) RLS
--
-- La llave anónima viaja dentro del JavaScript que sirve el sitio: cualquiera
-- la copia abriendo las herramientas del navegador. Una bitácora de accesos con
-- nombres, correos y horarios no puede quedar expuesta a esa llave, así que
-- anon no la toca ni para leer.
--
-- No hay policy de DELETE y a nadie se le concede el privilegio: una bitácora
-- que sus propios usuarios pueden borrar no sirve como bitácora. Si hay que
-- purgar filas viejas, se hace desde el editor SQL de Supabase.
-- -----------------------------------------------------------------------------
alter table public.access_logs enable row level security;

revoke all on public.access_logs from anon, public;
grant select, insert, update on public.access_logs to authenticated;

-- Lectura: el ADMIN ve todo; los demás sólo sus propias sesiones.
drop policy if exists access_logs_select on public.access_logs;
create policy access_logs_select
  on public.access_logs for select to authenticated
  using (public.current_app_role() = 'ADMIN' or user_id = auth.uid());

-- Alta: cada quien abre su propia sesión y nada más.
drop policy if exists access_logs_insert on public.access_logs;
create policy access_logs_insert
  on public.access_logs for insert to authenticated
  with check (user_id = auth.uid());

-- Latido y cierre: cada quien toca su propia fila. El with check repite la
-- condición para que nadie pueda reasignar su sesión a otro user_id.
drop policy if exists access_logs_update on public.access_logs;
create policy access_logs_update
  on public.access_logs for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 5) profiles.email
--
-- El panel de administración de usuarios necesita el correo para mandar el
-- restablecimiento de contraseña. El correo real vive en auth.users, pero esa
-- tabla no se puede leer con la llave anónima ni desde el navegador, así que se
-- copia a profiles.
--
-- El trigger lo mantiene al día: si alguien cambia su correo en auth, el de
-- profiles lo sigue. Sin él, el dato se desincroniza en silencio y el
-- restablecimiento se iría a una dirección que ya no existe.
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists email text;

-- Relleno inicial de los usuarios que ya existen.
update public.profiles p
   set email = u.email
  from auth.users u
 where u.id = p.id
   and p.email is distinct from u.email;

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_profile_email_trg on auth.users;
create trigger sync_profile_email_trg
  after insert or update of email on auth.users
  for each row execute function public.sync_profile_email();

commit;

-- =============================================================================
-- ROLLBACK
--
--   begin;
--   drop table if exists public.access_logs;
--   drop trigger if exists sync_profile_email_trg on auth.users;
--   drop function if exists public.sync_profile_email();
--   alter table public.profiles drop column if exists email;
--   commit;
--
-- current_app_role() se deja: estatus_2027 y las políticas endurecidas la usan.
-- =============================================================================
