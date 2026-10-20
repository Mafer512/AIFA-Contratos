-- =============================================================================
-- Plantilla por año: el organigrama de 2026 y el de 2027 son independientes
--
-- QUÉ RESUELVE
-- El organigrama vivía en una sola tabla (responsables), con un renglón por
-- persona. Los módulos 2026 y 2027 la leían igual, así que mover a alguien de
-- coordinación, cambiarle el puesto o darlo de baja en un año lo cambiaba
-- también en el otro. Pero la plantilla cambia de un año a otro: quién está,
-- de quién depende, con qué puesto y nivel.
--
-- CÓMO QUEDA
--   · responsables  → el catálogo de PERSONAS: un renglón por quien haya
--     estado alguna vez en el área, con su nombre y sus alias. Es lo que usa la
--     base para reconocer al responsable de un servicio (persona_de), y por eso
--     no se parte por año.
--   · plantilla_anual → la FICHA de cada persona en cada año: puesto, nivel,
--     de quién depende, coordinación, orden, foto, antigüedad y si está o no en
--     ese año. Un renglón por (año, persona). Editar el de 2027 no toca 2026.
--
-- Los servicios ya eran independientes por año (estatus_2026 y estatus_2027
-- son tablas distintas, cada una con su columna "Responsable"); esto no los
-- toca.
--
-- CARGA INICIAL
-- 2026 y 2027 arrancan con lo que hoy tiene responsables (la plantilla vigente,
-- 14 personas). A partir de aquí cada año se edita por su lado. Un año nuevo
-- (2028) no necesita migración: la aplicación crea su plantilla copiando la del
-- año anterior la primera vez que alguien guarda un cambio en ella.
--
-- IDEMPOTENTE: se puede correr más de una vez sin duplicar ni pisar nada.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) Tabla
-- -----------------------------------------------------------------------------
create table if not exists public.plantilla_anual (
  id              bigint generated always as identity primary key,
  anio            smallint not null,
  -- La persona. on update cascade: si algún día se corrige la llave de alguien
  -- en el catálogo, sus fichas de todos los años la siguen.
  catalog_value   text not null
                  references public.responsables (catalog_value) on update cascade,

  -- Ficha (del año)
  full_name       text not null,
  employee_number text,
  academic_degree text,
  aifa_tenure     text,
  puesto          text,
  nivel_salarial  text,
  photo_url       text,

  -- Lugar en la estructura (del año)
  partida         integer,
  nivel_organico  text,
  reporta_a       text,
  color           text,
  -- false = no está en la plantilla de ese año (baja). No se borra el renglón:
  -- sus servicios de ese año siguen registrados a su nombre.
  activo          boolean not null default true,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint plantilla_anual_anio_check check (anio between 2024 and 2040),
  constraint plantilla_anual_nivel_organico_check
    check (nivel_organico is null or nivel_organico in ('GERENTE', 'COORDINADOR', 'COLABORADOR'))
);

-- Una ficha por persona por año: dos partirían sus servicios en dos montones.
create unique index if not exists plantilla_anual_anio_persona_key
  on public.plantilla_anual (anio, catalog_value);

create index if not exists plantilla_anual_orden_idx
  on public.plantilla_anual (anio, partida nulls last, full_name);

-- updated_at puesto por la base (misma función que responsables).
drop trigger if exists plantilla_anual_touch_updated_at on public.plantilla_anual;
create trigger plantilla_anual_touch_updated_at
  before update on public.plantilla_anual
  for each row execute function public.touch_responsables_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Carga inicial: 2026 y 2027 parten de la plantilla vigente
--
-- on conflict do nothing: volver a correr esto no deshace lo que ya se haya
-- editado en cualquiera de los dos años.
-- -----------------------------------------------------------------------------
insert into public.plantilla_anual
  (anio, catalog_value, full_name, employee_number, academic_degree, aifa_tenure,
   puesto, nivel_salarial, photo_url, partida, nivel_organico, reporta_a, color, activo)
select a.anio, r.catalog_value, r.full_name, r.employee_number, r.academic_degree, r.aifa_tenure,
       r.puesto, r.nivel_salarial, r.photo_url, r.partida, r.nivel_organico, r.reporta_a, r.color, r.activo
  from public.responsables r
 cross join (values (2026::smallint), (2027::smallint)) as a(anio)
on conflict (anio, catalog_value) do nothing;

-- -----------------------------------------------------------------------------
-- 3) RLS — el mismo criterio que responsables
--
-- Leer: cualquiera con sesión. Escribir: ADMIN y OPERATOR. Borrar: sólo ADMIN
-- (y casi nunca hace falta: las bajas se marcan con activo = false).
-- -----------------------------------------------------------------------------
alter table public.plantilla_anual enable row level security;

revoke all on public.plantilla_anual from anon, public;
grant select, insert, update, delete on public.plantilla_anual to authenticated;

drop policy if exists plantilla_anual_select on public.plantilla_anual;
create policy plantilla_anual_select
  on public.plantilla_anual for select to authenticated using (true);

drop policy if exists plantilla_anual_insert on public.plantilla_anual;
create policy plantilla_anual_insert
  on public.plantilla_anual for insert to authenticated
  with check (public.current_app_role() in ('ADMIN', 'OPERATOR'));

drop policy if exists plantilla_anual_update on public.plantilla_anual;
create policy plantilla_anual_update
  on public.plantilla_anual for update to authenticated
  using (public.current_app_role() in ('ADMIN', 'OPERATOR'))
  with check (public.current_app_role() in ('ADMIN', 'OPERATOR'));

drop policy if exists plantilla_anual_delete on public.plantilla_anual;
create policy plantilla_anual_delete
  on public.plantilla_anual for delete to authenticated
  using (public.current_app_role() = 'ADMIN');

commit;

-- =============================================================================
-- VERIFICACIÓN
--
--   -- 14 y 14 al aplicarla; después cada año lleva su cuenta.
--   select anio, count(*), count(*) filter (where activo) from public.plantilla_anual group by 1 order by 1;
--
--   -- Diferencias entre los dos años:
--   select coalesce(a.catalog_value, b.catalog_value) persona,
--          a.reporta_a reporta_2026, b.reporta_a reporta_2027, a.activo activo_2026, b.activo activo_2027
--     from (select * from public.plantilla_anual where anio = 2026) a
--     full join (select * from public.plantilla_anual where anio = 2027) b using (catalog_value)
--    where a.reporta_a is distinct from b.reporta_a or a.activo is distinct from b.activo
--       or a.puesto is distinct from b.puesto;
--
-- ROLLBACK (la aplicación vuelve a leer responsables, igual para todos los años)
--
--   begin;
--   drop table if exists public.plantilla_anual;
--   commit;
-- =============================================================================
