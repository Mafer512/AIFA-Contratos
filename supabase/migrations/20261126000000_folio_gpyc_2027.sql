-- =============================================================================
-- 2027: número interno de cada servicio (GPyC-001, GPyC-002, …)
--
-- QUÉ CAMBIA
-- Cada servicio o adquisición de 2027 recibe un número interno en la columna
-- "No. GPYC", en el orden en que se va dando de alta: GPyC-001, GPyC-002…
--
--   · Lo asigna la base (trigger) al dar de alta, no el navegador: si dos
--     personas agregan a la vez, un candado hace que una espere a la otra y
--     no se repite el número. Lo que mande la aplicación se ignora.
--   · Una vez asignado no cambia (no se puede editar ni desde la API).
--   · Los servicios que ya existen se numeran ahora, por fecha de alta.
--     Esto no toca su "updated_at" ni ensucia la bitácora: los triggers de
--     esa tabla se apagan sólo durante ese paso.
--   · Un índice único garantiza que no haya dos iguales.
--
-- Requiere 20261123000000_estatus_2027_ficha.sql (crea la columna).
-- IDEMPOTENTE: se puede correr más de una vez.
-- =============================================================================

begin;

alter table public.estatus_2027 add column if not exists "No. GPYC" text;

-- El que sigue: uno más que el mayor "GPyC-NNN" que ya exista.
create or replace function public.siguiente_folio_gpyc_2027()
returns text
language sql
volatile
set search_path = public, pg_temp
as $$
  select 'GPyC-' || lpad((coalesce(max((regexp_match("No. GPYC", '^gpyc-(\d+)$', 'i'))[1]::int), 0) + 1)::text, 3, '0')
    from public.estatus_2027
$$;

revoke all on function public.siguiente_folio_gpyc_2027() from public, anon, authenticated;

create or replace function public.estatus_2027_folio_gpyc()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- Dos altas al mismo tiempo: la segunda espera a que la primera termine y
    -- ya ve su número.
    perform pg_advisory_xact_lock(hashtext('estatus_2027_folio_gpyc'));
    new."No. GPYC" := public.siguiente_folio_gpyc_2027();
  elsif old."No. GPYC" is not null then
    -- Ya asignado: no cambia.
    new."No. GPYC" := old."No. GPYC";
  end if;
  return new;
end;
$$;

revoke all on function public.estatus_2027_folio_gpyc() from public, anon, authenticated;

-- Numerar los que ya existen, en orden de alta, sin tocar updated_at ni la
-- bitácora.
do $$
declare
  r record;
  apagados text[] := array[]::text[];
  t text;
begin
  foreach t in array array['estatus_2027_touch_updated_at', 'estatus_2027_audit_trg', 'estatus_2027_folio_gpyc'] loop
    if exists (select 1 from pg_trigger where tgrelid = 'public.estatus_2027'::regclass and tgname = t and not tgisinternal) then
      execute format('alter table public.estatus_2027 disable trigger %I', t);
      apagados := apagados || t;
    end if;
  end loop;

  for r in
    select "ID" from public.estatus_2027
     where coalesce(btrim("No. GPYC"), '') = ''
        or "No. GPYC" !~* '^gpyc-\d+$'
     order by created_at nulls last, "ID"
  loop
    update public.estatus_2027 set "No. GPYC" = public.siguiente_folio_gpyc_2027() where "ID" = r."ID";
  end loop;

  foreach t in array apagados loop
    execute format('alter table public.estatus_2027 enable trigger %I', t);
  end loop;
end $$;

drop trigger if exists estatus_2027_folio_gpyc on public.estatus_2027;
create trigger estatus_2027_folio_gpyc
  before insert or update of "No. GPYC" on public.estatus_2027
  for each row execute function public.estatus_2027_folio_gpyc();

create unique index if not exists estatus_2027_folio_gpyc_unico on public.estatus_2027 (lower("No. GPYC"));

comment on column public.estatus_2027."No. GPYC" is 'Número interno GPyC-001, GPyC-002… Lo asigna la base al dar de alta y no cambia.';

commit;

-- =============================================================================
-- VERIFICACIÓN
--
--   select "ID", "No. GPYC", "Nombre del Servicio." from public.estatus_2027 order by "No. GPYC";
--
-- ROLLBACK
--
--   drop trigger if exists estatus_2027_folio_gpyc on public.estatus_2027;
--   drop function if exists public.estatus_2027_folio_gpyc();
--   drop function if exists public.siguiente_folio_gpyc_2027();
--   drop index if exists public.estatus_2027_folio_gpyc_unico;
--   -- los números asignados se quedan; para borrarlos:
--   -- update public.estatus_2027 set "No. GPYC" = null;
-- =============================================================================
