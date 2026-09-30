-- =============================================================================
-- Plantilla y estructura orgánica de la Gerencia de Proyectos y Concursos
--
-- QUÉ RESUELVE
-- Hasta ahora las 14 fichas vivían dentro de data/responsables.ts. Eso
-- significa que dar de alta a alguien —o darlo de baja cuando se va— exigía
-- editar código y volver a desplegar, cosa que el área no puede hacer. Esta
-- tabla pone esos datos donde el personal autorizado sí los puede mantener.
--
-- CÓMO SE RELACIONAN LAS PERSONAS
-- La jerarquía se guarda con `reporta_a`, que apunta al catalog_value del jefe,
-- no con una lista de subordinados dentro de cada jefe. Así cambiar a alguien
-- de equipo toca un solo renglón, y nadie puede acabar colgando de dos
-- coordinadores a la vez.
--
-- LAS BAJAS NO SE BORRAN
-- Se marcan con activo = false. El nombre sigue apareciendo en el historial de
-- cambios y en los servicios que esa persona atendió; si se borrara el renglón,
-- ese historial quedaría apuntando a un nombre que ya no existe.
--
-- IDEMPOTENTE: se puede correr completo más de una vez sin duplicar nada.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Tabla
-- -----------------------------------------------------------------------------
create table if not exists public.responsables (
  id              bigint generated always as identity primary key,

  -- Identidad
  full_name       text not null,
  -- Forma canónica en MAYÚSCULAS. Es la que guarda la columna "Responsable" de
  -- estatus_2026/2027, así que es la llave real para cruzar servicios.
  catalog_value   text not null,
  employee_number text,

  -- Ficha
  academic_degree text,
  aifa_tenure     text,
  puesto          text,
  nivel_salarial  text,
  photo_url       text,

  -- Estructura
  partida         integer,
  nivel_organico  text,
  reporta_a       text,
  color           text,
  activo          boolean not null default true,

  -- Nombres alternativos con los que aparece en datos viejos, para que un
  -- servicio capturado con una grafía distinta siga encontrando a su persona.
  aliases         text[],

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Columnas nuevas sobre una tabla que ya existiera de antes.
alter table public.responsables add column if not exists puesto         text;
alter table public.responsables add column if not exists nivel_salarial text;
alter table public.responsables add column if not exists partida        integer;
alter table public.responsables add column if not exists nivel_organico text;
alter table public.responsables add column if not exists reporta_a      text;
alter table public.responsables add column if not exists color          text;
alter table public.responsables add column if not exists activo         boolean not null default true;
alter table public.responsables add column if not exists aliases        text[];
alter table public.responsables add column if not exists updated_at     timestamptz not null default now();

-- Dos fichas con el mismo catalog_value romperían el cruce con los servicios:
-- al agrupar por responsable, la mitad caería en una y la mitad en la otra.
create unique index if not exists responsables_catalog_value_key
  on public.responsables (catalog_value);

create index if not exists responsables_orden_idx
  on public.responsables (partida nulls last, full_name);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.responsables'::regclass
      and conname  = 'responsables_nivel_organico_check'
  ) then
    alter table public.responsables
      add constraint responsables_nivel_organico_check
      check (nivel_organico is null or nivel_organico in ('GERENTE', 'COORDINADOR', 'COLABORADOR'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2) updated_at automático
--
-- Puesto en el servidor a propósito: si dependiera del navegador, bastaría con
-- que una pestaña tuviera mal la hora para dejar de saber cuándo se editó una
-- ficha.
-- -----------------------------------------------------------------------------
create or replace function public.touch_responsables_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists responsables_touch_updated_at on public.responsables;
create trigger responsables_touch_updated_at
  before update on public.responsables
  for each row execute function public.touch_responsables_updated_at();

-- -----------------------------------------------------------------------------
-- 3) Carga inicial — la plantilla de septiembre 2026
--
-- on conflict actualiza sólo la estructura y el puesto, y NO pisa la foto ni el
-- grado académico: si alguien ya los corrigió desde la aplicación, volver a
-- correr esta migración no debe deshacer su trabajo.
-- -----------------------------------------------------------------------------
insert into public.responsables
  (full_name, catalog_value, employee_number, academic_degree, aifa_tenure, puesto, nivel_salarial, photo_url, partida, nivel_organico, reporta_a, color, activo)
values
  ('Samuel Gómez Cerrada', 'SAMUEL GÓMEZ CERRADA', '823',
   'Licenciatura en Administración Énfasis Finanzas', '4 años 3 meses 14 días',
   'Gerente de Proyectos y Concursos', 'N32', '/images/responsables/samuel-gomez-cerrada.jpg',
   1, 'GERENTE', null, 'gerencia', true),

  ('Daniela Elizabeth Mercado Islas', 'DANIELA ELIZABETH MERCADO ISLAS', '363',
   'Licenciada en Ciencias Políticas y Administración Pública', '4 años 9 meses 14 días',
   'Coordinador de Área Técnica', 'N6', '/images/responsables/daniela-elizabeth-mercado-islas.jpg',
   2, 'COORDINADOR', 'SAMUEL GÓMEZ CERRADA', 'azul', true),

  ('Martha Castelán García', 'MARTHA CASTELÁN GARCÍA', '1057',
   'Licenciada en Administración y Gestión de Pequeñas y medianas empresas.', '3 años 4 meses 26 días',
   'Coordinador de Área Técnica', 'N6', '/images/responsables/martha-castelan-garcia.jpg',
   3, 'COORDINADOR', 'SAMUEL GÓMEZ CERRADA', 'verde', true),

  ('Araceli Esmeralda Sánchez Torres', 'ARACELI ESMERALDA SÁNCHEZ TORRES', '461',
   'Licenciatura en Derecho', '4 años 8 meses 3 días',
   'Coordinador de Área Técnica', 'N6', '/images/responsables/araceli-esmeralda-sanchez-torres.jpg',
   4, 'COORDINADOR', 'SAMUEL GÓMEZ CERRADA', 'durazno', true),

  ('Adriana Pérez Maldonado', 'ADRIANA PÉREZ MALDONADO', '467',
   'Licenciatura en Contaduría Pública', '4 años 8 meses 3 días',
   'Profesional Ejecutivo en Contaduría Pública', 'N5', '/images/responsables/adriana-perez-maldonado.jpg',
   5, 'COLABORADOR', 'MARTHA CASTELÁN GARCÍA', 'verde', true),

  ('Lilian Elizabeth Pérez González', 'LILIAN ELIZABETH PÉREZ GONZÁLEZ', '744',
   'Licenciatura en Contaduría Pública', '4 años 4 meses y 25 días',
   'Profesional Ejecutivo en Contaduría Pública', 'N5', '/images/responsables/lilian-elizabeth-perez-gonzalez.jpg',
   6, 'COLABORADOR', 'ARACELI ESMERALDA SÁNCHEZ TORRES', 'durazno', true),

  ('Gilberto Ayala Ramírez', 'GILBERTO AYALA RAMÍREZ', '1059',
   'Ingeniero Constructor', '3 años 4 meses 26 días',
   'Especialista en Contrataciones y Adquisiciones Públicas', 'N5', '/images/responsables/gilberto-ayala-ramirez.jpg',
   7, 'COLABORADOR', 'DANIELA ELIZABETH MERCADO ISLAS', 'azul', true),

  ('Sammantha Delgado Serrano', 'SAMMANTHA DELGADO SERRANO', '1727',
   'Licenciatura en Contaduría Pública', '2 meses 7 días',
   'Supervisor de Seguridad Aeroportuaria', 'N5', '/images/responsables/sammantha-delgado-serrano.jpg',
   8, 'COLABORADOR', 'MARTHA CASTELÁN GARCÍA', 'verde', true),

  ('Esmeralda Emily Rodríguez Martínez', 'ESMERALDA EMILY RODRÍGUEZ MARTÍNEZ', '1279',
   'Licenciatura en Relaciones Internacionales', '2 años 1 mes 8 días',
   'Especialista en Contrataciones y Adquisiciones Públicas', 'N5', '/images/responsables/esmeralda-emily-rodriguez-martinez.jpg',
   9, 'COLABORADOR', 'ARACELI ESMERALDA SÁNCHEZ TORRES', 'durazno', true),

  ('Monserrat Alonso Martínez', 'MONSERRAT ALONSO MARTÍNEZ', '1322',
   'Licenciatura en Economía', '1 año 5 meses 15 días',
   'Profesional de Servicios Especializados Aeroportuarios', 'N4', '/images/responsables/monserrat-alonso-martinez.jpg',
   10, 'COLABORADOR', 'DANIELA ELIZABETH MERCADO ISLAS', 'azul', true),

  ('Irma Karina Vargas García', 'IRMA KARINA VARGAS GARCÍA', '1602',
   'Licenciatura en Comercio Exterior', '8 meses 22 días',
   'Profesional Ejecutivo Aeroportuario', 'N4', '/images/responsables/irma-karina-vargas-garcia.jpg',
   11, 'COLABORADOR', 'DANIELA ELIZABETH MERCADO ISLAS', 'azul', true),

  ('Sandy Osiris Mendoza Leonidez', 'SANDY OSIRIS MENDOZA LEONIDEZ', '1685',
   'Licenciatura en Ciencia Política y Administración Urbana; Maestría en Gestión Pública para la Buena Administración', '4 meses 16 días',
   'Profesional de Servicios Especializados Aeroportuarios', 'N4', '/images/responsables/sandy-osiris-mendoza-leonidez.jpg',
   12, 'COLABORADOR', 'ARACELI ESMERALDA SÁNCHEZ TORRES', 'durazno', true),

  ('Dayren Floricela de León González', 'DAYREN FLORICELA DE LEÓN GONZÁLEZ', '1250',
   'Licenciatura en Turismo', '2 años 3 meses 3 días',
   'Profesional de Servicios Especializados Aeroportuarios', 'N4', '/images/responsables/dayren-floricela-de-leon-gonzalez.jpg',
   13, 'COLABORADOR', 'MARTHA CASTELÁN GARCÍA', 'verde', true),

  ('Mari Carmen Alvarez Reyes', 'MARI CARMEN ALVAREZ REYES', '1765',
   'Licenciatura en Administración', '14 días',
   'Archivista', 'N4', null,
   14, 'COLABORADOR', 'MARTHA CASTELÁN GARCÍA', 'verde', true)

on conflict (catalog_value) do update set
  full_name       = excluded.full_name,
  employee_number = coalesce(public.responsables.employee_number, excluded.employee_number),
  puesto          = coalesce(public.responsables.puesto,          excluded.puesto),
  nivel_salarial  = coalesce(public.responsables.nivel_salarial,  excluded.nivel_salarial),
  partida         = coalesce(public.responsables.partida,         excluded.partida),
  nivel_organico  = coalesce(public.responsables.nivel_organico,  excluded.nivel_organico),
  reporta_a       = coalesce(public.responsables.reporta_a,       excluded.reporta_a),
  color           = coalesce(public.responsables.color,           excluded.color);

-- Alias conocidos: así un servicio capturado con otra grafía sigue cruzando.
update public.responsables
   set aliases = array['SANDY OSIRIS MENDONZA LEONÍDEZ']
 where catalog_value = 'SANDY OSIRIS MENDOZA LEONIDEZ'
   and (aliases is null or aliases = '{}');

-- -----------------------------------------------------------------------------
-- 4) RLS
--
-- Leer: cualquiera con sesión. La pantalla de servicios necesita la ficha para
-- mostrar quién atiende cada contrato.
--
-- Escribir: ADMIN y OPERATOR, el mismo criterio que las tablas de trabajo.
-- Mantener la plantilla es parte de la operación del área, no administración
-- del sistema.
--
-- Borrar: sólo ADMIN, y en realidad casi nunca hace falta: las bajas se marcan
-- con activo = false para no romper el historial de quien ya atendió servicios.
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

alter table public.responsables enable row level security;

revoke all on public.responsables from anon, public;
grant select, insert, update, delete on public.responsables to authenticated;

drop policy if exists responsables_select on public.responsables;
create policy responsables_select
  on public.responsables for select to authenticated using (true);

drop policy if exists responsables_insert on public.responsables;
create policy responsables_insert
  on public.responsables for insert to authenticated
  with check (public.current_app_role() in ('ADMIN', 'OPERATOR'));

drop policy if exists responsables_update on public.responsables;
create policy responsables_update
  on public.responsables for update to authenticated
  using (public.current_app_role() in ('ADMIN', 'OPERATOR'))
  with check (public.current_app_role() in ('ADMIN', 'OPERATOR'));

drop policy if exists responsables_delete on public.responsables;
create policy responsables_delete
  on public.responsables for delete to authenticated
  using (public.current_app_role() = 'ADMIN');

commit;

-- =============================================================================
-- VERIFICACIÓN
--
--   -- 14 renglones, y el organigrama completo:
--   select partida, full_name, nivel_organico, reporta_a, color
--     from public.responsables
--    where activo
--    order by partida;
--
--   -- Nadie debe quedar apuntando a un jefe que no existe:
--   select r.full_name, r.reporta_a
--     from public.responsables r
--    where r.reporta_a is not null
--      and not exists (select 1 from public.responsables j where j.catalog_value = r.reporta_a);
--
-- ROLLBACK
--
--   begin;
--   drop table if exists public.responsables;
--   drop function if exists public.touch_responsables_updated_at();
--   commit;
-- =============================================================================
