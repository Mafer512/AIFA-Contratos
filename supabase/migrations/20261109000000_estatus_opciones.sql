-- =============================================================================
-- Opciones de estatus que agrega el equipo
--
-- QUÉ CAMBIA
-- El estatus de un servicio se elige de una lista: las 11 etapas del proceso
-- (ESTATUS_2026_OPTIONS en la aplicación). Ahora, desde el mismo selector,
-- quien captura puede agregar otra opción ("En espera de suficiencia",
-- "Suspendido"...). Se guarda aquí, con su color, y desde ese momento la ven
-- todos y vale para 2026 y 2027.
--
-- REGLAS
--   · Agregan administradores y operadores (los que capturan estatus).
--   · Quitar una opción, sólo administradores, y sólo si ningún servicio la
--     usa (lo revisa un trigger aunque se borre desde la API).
--   · No se pueden repetir nombres (sin importar mayúsculas) ni usar el de una
--     etapa fija.
--
-- estatus_2027 tenía un CHECK con las 11 etapas para que nadie dejara un
-- estatus inventado. Se cambia por un trigger que acepta las 11 etapas o una
-- opción de esta tabla. estatus_2026 nunca tuvo esa restricción y se queda
-- igual.
--
-- IDEMPOTENTE: se puede correr más de una vez.
-- =============================================================================

begin;

create table if not exists public.estatus_opciones (
  id bigint generated always as identity primary key,
  nombre text not null,
  color text not null default '#64748B',
  creada_por uuid default auth.uid() references auth.users(id) on delete set null,
  creada_at timestamptz not null default now(),
  constraint estatus_opciones_nombre_check check (
    nombre = btrim(nombre)
    and char_length(nombre) between 2 and 60
    and lower(nombre) not in (
      'elaboración de anexo técnico, administrativo y apéndices',
      'en im',
      'recepción de im',
      'validación de im por el área técnica',
      'envío de carpeta validada a rm',
      'en revisión defensa',
      'atención de observaciones defensa',
      'documentación actualizada para publicación',
      'publicado compras mx',
      'adjudicado',
      'cancelado',
      'sin estatus',
      'vacío',
      'vacio',
      'sin asignar'
    )
  ),
  constraint estatus_opciones_color_check check (color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index if not exists estatus_opciones_nombre_unico on public.estatus_opciones (lower(nombre));

alter table public.estatus_opciones enable row level security;
revoke all on public.estatus_opciones from anon, public;
grant select, insert, delete on public.estatus_opciones to authenticated;

drop policy if exists estatus_opciones_ver on public.estatus_opciones;
create policy estatus_opciones_ver on public.estatus_opciones
  for select to authenticated using (true);

drop policy if exists estatus_opciones_agregar on public.estatus_opciones;
create policy estatus_opciones_agregar on public.estatus_opciones
  for insert to authenticated
  with check (public.current_app_role() in ('ADMIN', 'OPERATOR') and creada_por = auth.uid());

drop policy if exists estatus_opciones_quitar on public.estatus_opciones;
create policy estatus_opciones_quitar on public.estatus_opciones
  for delete to authenticated
  using (public.current_app_role() = 'ADMIN');

-- Una opción en uso no se quita: esos servicios se quedarían con un estatus
-- que ya no está en la lista.
create or replace function public.estatus_opciones_antes_de_quitar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  select (select count(*) from public.estatus_2026 where "Estatus" = old.nombre)
       + (select count(*) from public.estatus_2027 where "Estatus" = old.nombre)
    into n;
  if n > 0 then
    raise exception 'La opción "%" la usan % servicio(s). Cámbiales el estatus antes de quitarla.', old.nombre, n
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke all on function public.estatus_opciones_antes_de_quitar() from public, anon, authenticated;

drop trigger if exists estatus_opciones_antes_de_quitar on public.estatus_opciones;
create trigger estatus_opciones_antes_de_quitar
  before delete on public.estatus_opciones
  for each row execute function public.estatus_opciones_antes_de_quitar();

-- estatus_2027: de CHECK fijo a "etapa fija u opción agregada".
alter table public.estatus_2027 drop constraint if exists estatus_2027_estatus_valido;

create or replace function public.validar_estatus_servicio()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new."Estatus" is null then return new; end if;
  if tg_op = 'UPDATE' and new."Estatus" is not distinct from old."Estatus" then return new; end if;
  if new."Estatus" in (
       'Elaboración de anexo técnico, administrativo y apéndices',
       'En IM',
       'Recepción de IM',
       'Validación de IM por el área técnica',
       'Envío de carpeta validada a RM',
       'En revisión DEFENSA',
       'Atención de observaciones DEFENSA',
       'Documentación actualizada para publicación',
       'Publicado Compras MX',
       'Adjudicado',
       'Cancelado')
     or exists (select 1 from public.estatus_opciones o where o.nombre = new."Estatus") then
    return new;
  end if;
  raise exception 'El estatus "%" no está en la lista. Agrégalo primero como opción.', new."Estatus"
    using errcode = '23514';
end;
$$;

revoke all on function public.validar_estatus_servicio() from public, anon, authenticated;

drop trigger if exists estatus_2027_validar_estatus on public.estatus_2027;
create trigger estatus_2027_validar_estatus
  before insert or update of "Estatus" on public.estatus_2027
  for each row execute function public.validar_estatus_servicio();

commit;

-- =============================================================================
-- VERIFICACIÓN
--
--   select id, nombre, color, creada_por, creada_at from public.estatus_opciones order by creada_at;
--   select conname from pg_constraint where conname = 'estatus_2027_estatus_valido';  -- ya no existe
--
-- ROLLBACK
--
--   begin;
--   drop trigger if exists estatus_2027_validar_estatus on public.estatus_2027;
--   drop function if exists public.validar_estatus_servicio();
--   -- sólo si ningún servicio de 2027 usa una opción agregada:
--   alter table public.estatus_2027 add constraint estatus_2027_estatus_valido check (
--     "Estatus" is null or "Estatus" in ( ...las 11 etapas... ));
--   drop table if exists public.estatus_opciones;
--   drop function if exists public.estatus_opciones_antes_de_quitar();
--   commit;
-- =============================================================================
