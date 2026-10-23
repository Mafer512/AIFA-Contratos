-- =============================================================================
-- Auditoría: los servicios del año, también los que aún no tienen contrato
--
-- QUÉ RESUELVE
-- Auditoría sólo conocía contratos (los de Pagos). 2027 tiene sus servicios en
-- Estatus 2027, pero todavía ninguno tiene contrato, así que el año salía
-- vacío. Ahora un servicio de Auditoría puede:
--   · no tener número de contrato todavía (basta con su descripción), y
--   · estar ligado a su renglón de Estatus <año> (estatus_id = columna "ID"),
--     para que en cuanto Estatus le ponga contrato, Auditoría lo muestre.
--
-- CARGA INICIAL
-- 2027 arranca con sus servicios de Estatus 2027 (menos los cancelados). De
-- aquí en adelante, el área trae los nuevos con "Traer servicios del año".
--
-- Requiere 20261021000000_auditoria.sql.
-- IDEMPOTENTE: se puede correr más de una vez.
-- =============================================================================

begin;

alter table public.auditoria_servicios alter column contrato drop not null;
alter table public.auditoria_servicios add column if not exists estatus_id integer;

alter table public.auditoria_servicios drop constraint if exists auditoria_servicios_contrato_check;
alter table public.auditoria_servicios
  add constraint auditoria_servicios_contrato_check
  check (contrato is null or char_length(btrim(contrato)) between 1 and 200);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'auditoria_servicios_identidad_check') then
    -- Sin contrato, al menos su nombre: si no, el renglón no dice qué es.
    alter table public.auditoria_servicios
      add constraint auditoria_servicios_identidad_check check (contrato is not null or descripcion is not null);
  end if;
end $$;

-- Un servicio de Estatus aparece una sola vez por año.
create unique index if not exists auditoria_servicios_anio_estatus_key
  on public.auditoria_servicios (anio, estatus_id) where estatus_id is not null;

-- Igual que antes, pero un contrato en blanco queda como "sin contrato".
create or replace function public.auditoria_servicios_limpiar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.contrato    := nullif(btrim(regexp_replace(coalesce(new.contrato, ''), '\s+', ' ', 'g')), '');
  new.descripcion := nullif(btrim(regexp_replace(coalesce(new.descripcion, ''), '\s+', ' ', 'g')), '');
  new.proveedor   := nullif(btrim(regexp_replace(coalesce(new.proveedor, ''), '\s+', ' ', 'g')), '');
  new.observacion := nullif(btrim(coalesce(new.observacion, '')), '');
  if tg_op = 'UPDATE' then
    new.anio := old.anio;
    new.creado_por := old.creado_por;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- 2027 con sus servicios de Estatus 2027.
insert into public.auditoria_servicios (anio, contrato, descripcion, proveedor, estatus_id, creado_por)
select 2027,
       nullif(regexp_replace(btrim(coalesce(e."No. de contrato"::text, '')), '\.+$', ''), ''),
       e."Nombre del Servicio."::text,
       nullif(btrim(coalesce(e."Proveedor"::text, '')), ''),
       e."ID"::integer,
       null
  from public.estatus_2027 e
 where coalesce(e."Estatus"::text, '') !~* 'cancel'
   and nullif(btrim(coalesce(e."Nombre del Servicio."::text, '')), '') is not null
on conflict do nothing;

commit;

-- =============================================================================
-- VERIFICACIÓN
--
--   select anio, count(*), count(contrato) con_contrato, count(estatus_id) ligados
--     from public.auditoria_servicios group by 1 order by 1;
--
-- ROLLBACK (sólo si ningún servicio quedó sin contrato)
--
--   begin;
--   delete from public.auditoria_servicios where anio = 2027 and contrato is null
--     and not exists (select 1 from public.auditoria_marcas m where m.servicio_id = auditoria_servicios.id);
--   drop index if exists public.auditoria_servicios_anio_estatus_key;
--   alter table public.auditoria_servicios drop constraint if exists auditoria_servicios_identidad_check;
--   alter table public.auditoria_servicios drop column if exists estatus_id;
--   alter table public.auditoria_servicios alter column contrato set not null;
--   commit;
-- =============================================================================
