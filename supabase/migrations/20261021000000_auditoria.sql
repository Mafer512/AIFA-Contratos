-- =============================================================================
-- Auditoría: control mensual de entregables por servicio
--
-- QUÉ ES
-- La hoja que lleva el área para Auditoría: un renglón por contrato o pedido
-- del año y, por cada mes, una letra que dice cómo va la documentación de ese
-- mes:
--     C  Completo      R  Revisado      E  En revisión      N  No aplica
-- Un mes sin letra todavía no se registra.
--
-- CÓMO QUEDA
--   · auditoria_servicios → los contratos de cada año (número, descripción,
--     proveedor y una observación libre, p. ej. "Realiza entregas de forma
--     semanal"). Un año no comparte renglones con otro.
--   · auditoria_marcas    → la letra de cada (servicio, mes). Borrar la letra
--     es borrar el renglón.
--   · auditoria_bitacora  → cada cambio de letra, con quién y cuándo. La llena
--     la base; nadie la escribe a mano.
--
-- CARGA INICIAL
-- 2026 arranca con los contratos de Pagos 2026. Los años siguientes (o 2025)
-- se llenan desde la pantalla: "Traer de Pagos", "Agregar servicio" o
-- "Importar Excel" con la misma hoja que ya se usa.
--
-- QUIÉN CAPTURA: lo cambió 20261022010000_auditoria_solo_area.sql (sólo el
-- área de Auditoría). Si se vuelve a correr ésta, hay que correr aquélla
-- después, o las políticas regresan a ADMIN y OPERATOR.
--
-- IDEMPOTENTE: se puede correr más de una vez sin duplicar ni pisar nada.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Tablas
-- -----------------------------------------------------------------------------
create table if not exists public.auditoria_servicios (
  id           bigint generated always as identity primary key,
  anio         smallint not null,
  contrato     text     not null,
  descripcion  text,
  proveedor    text,
  observacion  text,
  -- Posición en la hoja (la del Excel importado). Sin orden, por contrato.
  orden        integer,
  creado_por   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint auditoria_servicios_anio_check check (anio between 2024 and 2040),
  constraint auditoria_servicios_contrato_check check (char_length(btrim(contrato)) between 1 and 200),
  constraint auditoria_servicios_observacion_check check (observacion is null or char_length(observacion) <= 500)
);

-- El mismo contrato no puede aparecer dos veces en el mismo año.
create unique index if not exists auditoria_servicios_anio_contrato_key
  on public.auditoria_servicios (anio, upper(contrato));

create table if not exists public.auditoria_marcas (
  servicio_id         bigint   not null references public.auditoria_servicios (id) on delete cascade,
  mes                 smallint not null,
  estado              text     not null,
  actualizado_por     uuid default auth.uid(),
  actualizado_nombre  text,
  updated_at          timestamptz not null default now(),
  primary key (servicio_id, mes),

  constraint auditoria_marcas_mes_check check (mes between 1 and 12),
  constraint auditoria_marcas_estado_check check (estado in ('C', 'R', 'E', 'N'))
);

create table if not exists public.auditoria_bitacora (
  id           bigint generated always as identity primary key,
  servicio_id  bigint   not null,
  anio         smallint,
  contrato     text,
  mes          smallint not null,
  antes        text,
  despues      text,
  por          uuid,
  por_nombre   text,
  created_at   timestamptz not null default now()
);

create index if not exists auditoria_bitacora_celda_idx
  on public.auditoria_bitacora (servicio_id, mes, created_at desc);

-- -----------------------------------------------------------------------------
-- 2) Lo que pone la base
-- -----------------------------------------------------------------------------
create or replace function public.auditoria_servicios_limpiar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.contrato    := btrim(regexp_replace(new.contrato, '\s+', ' ', 'g'));
  new.descripcion := nullif(btrim(regexp_replace(coalesce(new.descripcion, ''), '\s+', ' ', 'g')), '');
  new.proveedor   := nullif(btrim(regexp_replace(coalesce(new.proveedor, ''), '\s+', ' ', 'g')), '');
  new.observacion := nullif(btrim(coalesce(new.observacion, '')), '');
  if tg_op = 'UPDATE' then
    -- Un servicio no se muda de año: se borraría de uno y aparecería en otro.
    new.anio := old.anio;
    new.creado_por := old.creado_por;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists auditoria_servicios_limpiar_trg on public.auditoria_servicios;
create trigger auditoria_servicios_limpiar_trg
  before insert or update on public.auditoria_servicios
  for each row execute function public.auditoria_servicios_limpiar();

-- Quién marcó la letra lo pone la base, no el navegador.
create or replace function public.auditoria_marcas_firmar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.estado := upper(btrim(new.estado));
  if auth.uid() is not null then
    new.actualizado_por := auth.uid();
  end if;
  select p.full_name into new.actualizado_nombre from public.profiles p where p.id = new.actualizado_por;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.auditoria_marcas_firmar() from public, anon, authenticated;

drop trigger if exists auditoria_marcas_firmar_trg on public.auditoria_marcas;
create trigger auditoria_marcas_firmar_trg
  before insert or update on public.auditoria_marcas
  for each row execute function public.auditoria_marcas_firmar();

-- Cada cambio de letra queda en la bitácora (también el borrado).
create or replace function public.auditoria_marcas_bitacora()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_servicio bigint := coalesce(new.servicio_id, old.servicio_id);
  v_mes smallint := coalesce(new.mes, old.mes);
  v_antes text := case when tg_op = 'INSERT' then null else old.estado end;
  v_despues text := case when tg_op = 'DELETE' then null else new.estado end;
  v_nombre text;
begin
  if v_antes is not distinct from v_despues then
    return null;
  end if;
  select p.full_name into v_nombre from public.profiles p where p.id = auth.uid();
  insert into public.auditoria_bitacora (servicio_id, anio, contrato, mes, antes, despues, por, por_nombre)
  select v_servicio, s.anio, s.contrato, v_mes, v_antes, v_despues, auth.uid(), v_nombre
    from (select 1) uno
    left join public.auditoria_servicios s on s.id = v_servicio;
  return null;
end;
$$;

revoke all on function public.auditoria_marcas_bitacora() from public, anon, authenticated;

drop trigger if exists auditoria_marcas_bitacora_trg on public.auditoria_marcas;
create trigger auditoria_marcas_bitacora_trg
  after insert or update or delete on public.auditoria_marcas
  for each row execute function public.auditoria_marcas_bitacora();

-- -----------------------------------------------------------------------------
-- 3) Carga inicial: 2026 con los contratos de Pagos 2026
--
-- Se quita el punto final ("…-004/2026.") y se juntan los saltos de línea que
-- traen descripción y proveedor. on conflict do nothing: volver a correr esto
-- no duplica ni pisa lo que ya se haya capturado.
-- -----------------------------------------------------------------------------
insert into public.auditoria_servicios (anio, contrato, descripcion, proveedor, creado_por)
select 2026,
       regexp_replace(btrim(p."No. Contrato"), '\.+$', ''),
       p."Objeto del contrato",
       p."Proveedor",
       null
  from public.pagos p
 where p.anio = 2026
   and nullif(btrim(p."No. Contrato"), '') is not null
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 4) RLS — el criterio de siempre
--
-- Leer: cualquiera con sesión y perfil vigente. Capturar letras, agregar y
-- corregir servicios: ADMIN y OPERATOR. Quitar un servicio: sólo ADMIN.
-- La bitácora se lee, no se escribe.
-- -----------------------------------------------------------------------------
alter table public.auditoria_servicios enable row level security;
alter table public.auditoria_marcas    enable row level security;
alter table public.auditoria_bitacora  enable row level security;

revoke all on public.auditoria_servicios from anon, public;
revoke all on public.auditoria_marcas    from anon, public;
revoke all on public.auditoria_bitacora  from anon, public;
grant select, insert, update, delete on public.auditoria_servicios to authenticated;
grant select, insert, update, delete on public.auditoria_marcas    to authenticated;
grant select                         on public.auditoria_bitacora  to authenticated;

drop policy if exists auditoria_servicios_select on public.auditoria_servicios;
create policy auditoria_servicios_select
  on public.auditoria_servicios for select to authenticated
  using (public.current_app_role() is not null);

drop policy if exists auditoria_servicios_insert on public.auditoria_servicios;
create policy auditoria_servicios_insert
  on public.auditoria_servicios for insert to authenticated
  with check (public.current_app_role() in ('ADMIN', 'OPERATOR'));

drop policy if exists auditoria_servicios_update on public.auditoria_servicios;
create policy auditoria_servicios_update
  on public.auditoria_servicios for update to authenticated
  using (public.current_app_role() in ('ADMIN', 'OPERATOR'))
  with check (public.current_app_role() in ('ADMIN', 'OPERATOR'));

drop policy if exists auditoria_servicios_delete on public.auditoria_servicios;
create policy auditoria_servicios_delete
  on public.auditoria_servicios for delete to authenticated
  using (public.current_app_role() = 'ADMIN');

drop policy if exists auditoria_marcas_select on public.auditoria_marcas;
create policy auditoria_marcas_select
  on public.auditoria_marcas for select to authenticated
  using (public.current_app_role() is not null);

drop policy if exists auditoria_marcas_insert on public.auditoria_marcas;
create policy auditoria_marcas_insert
  on public.auditoria_marcas for insert to authenticated
  with check (public.current_app_role() in ('ADMIN', 'OPERATOR'));

drop policy if exists auditoria_marcas_update on public.auditoria_marcas;
create policy auditoria_marcas_update
  on public.auditoria_marcas for update to authenticated
  using (public.current_app_role() in ('ADMIN', 'OPERATOR'))
  with check (public.current_app_role() in ('ADMIN', 'OPERATOR'));

-- Borrar la letra de una celda es parte de capturar: ADMIN y OPERATOR.
drop policy if exists auditoria_marcas_delete on public.auditoria_marcas;
create policy auditoria_marcas_delete
  on public.auditoria_marcas for delete to authenticated
  using (public.current_app_role() in ('ADMIN', 'OPERATOR'));

drop policy if exists auditoria_bitacora_select on public.auditoria_bitacora;
create policy auditoria_bitacora_select
  on public.auditoria_bitacora for select to authenticated
  using (public.current_app_role() is not null);

commit;

-- =============================================================================
-- VERIFICACIÓN
--
--   select anio, count(*) from public.auditoria_servicios group by 1 order by 1;
--
--   -- Cómo va cada año, letra por letra:
--   select s.anio, m.estado, count(*)
--     from public.auditoria_marcas m join public.auditoria_servicios s on s.id = m.servicio_id
--    group by 1, 2 order by 1, 2;
--
--   -- Últimos cambios:
--   select created_at, por_nombre, contrato, mes, antes, despues
--     from public.auditoria_bitacora order by created_at desc limit 20;
--
-- ROLLBACK
--
--   begin;
--   drop table if exists public.auditoria_bitacora;
--   drop table if exists public.auditoria_marcas;
--   drop table if exists public.auditoria_servicios;
--   drop function if exists public.auditoria_marcas_bitacora();
--   drop function if exists public.auditoria_marcas_firmar();
--   drop function if exists public.auditoria_servicios_limpiar();
--   commit;
-- =============================================================================
