-- =============================================================================
-- Contraseña temporal de 24 horas
--
-- QUÉ CAMBIA
-- Un superadmin puede fijarle a alguien una contraseña temporal desde
-- Accesos → Usuarios (función cambiar-password con temporal: true). La
-- persona entra con ella y el sistema le pide escoger la suya antes de dejarla
-- pasar. Si no la usa en 24 horas, deja de servir.
--
-- CÓMO SE SABE SI SIGUE SIENDO TEMPORAL
-- Al marcarla se guarda una huella (sha256) del hash que quedó en auth.users.
-- Mientras coincida, la contraseña es la temporal. En cuanto cambie —la
-- persona escoge la suya, un superadmin le fija otra, usa el correo de
-- recuperación o vence—, la huella deja de coincidir y ya no cuenta. Así no
-- hay que acordarse de "apagar" la marca en ninguno de esos caminos.
--
-- CÓMO VENCE
--   · Un trabajo de pg_cron, cada 5 minutos, le pone a las vencidas una
--     contraseña aleatoria que nadie conoce y cierra sus sesiones. Esto es lo
--     que de verdad la invalida: Supabase Auth no sabe de vencimientos.
--   · Además, al entrar, la aplicación llama a revisar_mi_password_temporal():
--     si ya venció hace lo mismo en el acto, sin esperar al trabajo.
--
-- IDEMPOTENTE: se puede correr más de una vez.
-- =============================================================================

begin;

create table if not exists public.passwords_temporales (
  user_id uuid primary key references auth.users(id) on delete cascade,
  vence timestamptz not null,
  huella text not null,
  creada_por uuid references auth.users(id) on delete set null,
  creada_at timestamptz not null default now()
);

-- Sin políticas: nadie la lee ni la escribe desde el navegador. Sólo las
-- funciones de abajo (security definer) y service_role.
alter table public.passwords_temporales enable row level security;
revoke all on public.passwords_temporales from public, anon, authenticated;

create or replace function public._huella_password(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select encode(sha256(convert_to(u.encrypted_password, 'UTF8')), 'hex')
  from auth.users u where u.id = p_user
$$;

revoke all on function public._huella_password(uuid) from public, anon, authenticated;

-- Le pone una contraseña aleatoria (que nadie conoce) y cierra sus sesiones.
create or replace function public._invalidar_password_temporal(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update auth.users
     set encrypted_password = extensions.crypt(
           encode(extensions.gen_random_bytes(32), 'hex'),
           extensions.gen_salt('bf', 10)),
         updated_at = now()
   where id = p_user;
  perform public.revocar_sesiones(p_user);
  delete from public.passwords_temporales where user_id = p_user;
end;
$$;

revoke all on function public._invalidar_password_temporal(uuid) from public, anon, authenticated;

-- La llama cambiar-password (service_role) justo después de fijar la
-- contraseña, para que la huella sea la de la temporal.
create or replace function public.marcar_password_temporal(p_user uuid, p_por uuid, p_horas integer default 24)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  h text := public._huella_password(p_user);
  v timestamptz := now() + make_interval(hours => greatest(1, least(coalesce(p_horas, 24), 72)));
begin
  if h is null then
    raise exception 'Ese usuario ya no existe.' using errcode = 'P0002';
  end if;
  insert into public.passwords_temporales (user_id, vence, huella, creada_por, creada_at)
  values (p_user, v, h, p_por, now())
  on conflict (user_id) do update
    set vence = excluded.vence, huella = excluded.huella,
        creada_por = excluded.creada_por, creada_at = excluded.creada_at;
  return v;
end;
$$;

revoke all on function public.marcar_password_temporal(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.marcar_password_temporal(uuid, uuid, integer) to service_role;

-- La llama la aplicación al entrar. Si la contraseña con la que entró es una
-- temporal vigente, hay que pedirle la suya; si ya venció, se invalida aquí
-- mismo y la aplicación la saca.
create or replace function public.revisar_mi_password_temporal()
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t public.passwords_temporales%rowtype;
begin
  select * into t from public.passwords_temporales where user_id = auth.uid();
  if not found then
    return json_build_object('pendiente', false);
  end if;

  -- Ya la cambió por cualquier camino: la marca sobra.
  if public._huella_password(t.user_id) is distinct from t.huella then
    delete from public.passwords_temporales where user_id = t.user_id;
    return json_build_object('pendiente', false);
  end if;

  if t.vence <= now() then
    perform public._invalidar_password_temporal(t.user_id);
    return json_build_object('pendiente', true, 'vencida', true, 'vence', t.vence);
  end if;

  return json_build_object('pendiente', true, 'vencida', false, 'vence', t.vence);
end;
$$;

revoke all on function public.revisar_mi_password_temporal() from public, anon;
grant execute on function public.revisar_mi_password_temporal() to authenticated;

-- Para la etiqueta "Temporal" en Accesos → Usuarios. Sólo administradores.
create or replace function public.passwords_temporales_vigentes()
returns table (user_id uuid, vence timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.user_id, t.vence
  from public.passwords_temporales t
  where public.current_app_role() = 'ADMIN'
    and t.vence > now()
    and public._huella_password(t.user_id) = t.huella
$$;

revoke all on function public.passwords_temporales_vigentes() from public, anon;
grant execute on function public.passwords_temporales_vigentes() to authenticated;

-- Lo que corre pg_cron.
create or replace function public.vencer_passwords_temporales()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  n integer := 0;
begin
  -- Marcas de contraseñas que ya se cambiaron: sobran.
  delete from public.passwords_temporales t
   where public._huella_password(t.user_id) is distinct from t.huella;

  for r in select t.user_id from public.passwords_temporales t where t.vence <= now() loop
    perform public._invalidar_password_temporal(r.user_id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.vencer_passwords_temporales() from public, anon, authenticated;

commit;

create extension if not exists pg_cron;

-- cron.schedule con el mismo nombre reemplaza el trabajo: correrlo otra vez no
-- lo duplica.
select cron.schedule(
  'vencer-passwords-temporales',
  '*/5 * * * *',
  $$select public.vencer_passwords_temporales()$$
);

-- =============================================================================
-- VERIFICACIÓN
--
--   select * from cron.job where jobname = 'vencer-passwords-temporales';
--   select * from cron.job_run_details order by start_time desc limit 5;
--   select user_id, vence, creada_por from public.passwords_temporales;
--
-- ROLLBACK
--
--   select cron.unschedule('vencer-passwords-temporales');
--   drop function if exists public.vencer_passwords_temporales();
--   drop function if exists public.passwords_temporales_vigentes();
--   drop function if exists public.revisar_mi_password_temporal();
--   drop function if exists public.marcar_password_temporal(uuid, uuid, integer);
--   drop function if exists public._invalidar_password_temporal(uuid);
--   drop function if exists public._huella_password(uuid);
--   drop table if exists public.passwords_temporales;
-- =============================================================================
