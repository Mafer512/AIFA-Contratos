-- =============================================================================
-- 2027: campos nuevos para la ficha de captura de Mis servicios
--
-- QUÉ CAMBIA
-- En 2027 ya no se edita la tabla de Estatus servicios: cada servicio o
-- adquisición se da de alta y se edita con una ficha desde "Mis servicios".
-- La ficha pide tres datos que la tabla no tenía:
--
--   · "Tipo de contratación": Adquisición o Servicio. Separa las pestañas
--     ADQUISICIONES / SERVICIOS / TODOS. Mientras esté vacío, la aplicación lo
--     deduce del nombre ("Adquisición de…" → Adquisición; lo demás, Servicio),
--     así que no hace falta llenarlo de golpe: se fija al editar cada uno.
--   · "No. GPYC" (alfanumérico).
--   · "Tipo de procedimiento" (texto: Licitación Pública Nacional, etc.).
--
-- Además agrega "Desierta" a las opciones de estatus (estatus_opciones), que la
-- lista del área pide y no es ninguna de las 11 etapas.
--
-- Sin esta migración la ficha funciona igual, sólo sin esos tres campos.
--
-- IDEMPOTENTE: se puede correr más de una vez.
-- =============================================================================

begin;

alter table public.estatus_2027 add column if not exists "Tipo de contratación" text;
alter table public.estatus_2027 add column if not exists "No. GPYC" text;
alter table public.estatus_2027 add column if not exists "Tipo de procedimiento" text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'estatus_2027_tipo_contratacion_valido') then
    alter table public.estatus_2027
      add constraint estatus_2027_tipo_contratacion_valido
      check ("Tipo de contratación" is null or "Tipo de contratación" in ('Adquisición', 'Servicio'));
  end if;
end $$;

comment on column public.estatus_2027."Tipo de contratación" is 'Adquisición o Servicio. Vacío: la app lo deduce del nombre.';
comment on column public.estatus_2027."No. GPYC" is 'Número interno de la Gerencia de Proyectos y Concursos.';
comment on column public.estatus_2027."Tipo de procedimiento" is 'Licitación pública, invitación a cuando menos tres personas, adjudicación directa…';

-- "Desierta" como opción de estatus (si ya existe la tabla de opciones).
do $$
begin
  if to_regclass('public.estatus_opciones') is not null then
    insert into public.estatus_opciones (nombre, color, creada_por)
    select 'Desierta', '#64748B', null
     where not exists (select 1 from public.estatus_opciones where lower(nombre) = 'desierta');
  end if;
end $$;

commit;

-- =============================================================================
-- VERIFICACIÓN
--
--   select column_name from information_schema.columns
--    where table_name = 'estatus_2027'
--      and column_name in ('Tipo de contratación', 'No. GPYC', 'Tipo de procedimiento');
--   select nombre from public.estatus_opciones where nombre = 'Desierta';
--
-- ROLLBACK
--
--   alter table public.estatus_2027 drop constraint if exists estatus_2027_tipo_contratacion_valido;
--   alter table public.estatus_2027 drop column if exists "Tipo de contratación";
--   alter table public.estatus_2027 drop column if exists "No. GPYC";
--   alter table public.estatus_2027 drop column if exists "Tipo de procedimiento";
--   delete from public.estatus_opciones where nombre = 'Desierta';  -- sólo si nadie la usa
-- =============================================================================
