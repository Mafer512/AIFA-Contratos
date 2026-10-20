-- =============================================================================
-- Prueba: un cambio en la plantilla 2027 no toca 2026
--
-- Ejecutar con (requiere la migración 20261019000000_plantilla_por_anio.sql):
--   supabase db query --linked -f scripts/test_plantilla_por_anio.sql
--
-- NO DEJA NADA GUARDADO: todo corre en una transacción que termina con un
-- error a propósito, así que la base la deshace completa. El resultado viene
-- en el mensaje de ese error ("RESULTADO: ...").
--
-- Hace lo mismo que la aplicación, con la sesión de un ADMIN real y las
-- políticas RLS activas:
--   1. mueve a un colaborador a otra coordinación en 2027 (upsert por año);
--   2. da de baja a otra colaboradora en 2027;
--   3. da de alta a alguien nuevo sólo en 2027;
--   4. reasigna un servicio de 2027 a otro colaborador.
-- Después compara 2026 contra una huella tomada antes de empezar.
-- =============================================================================

begin;

-- Huella de lo que NO debe cambiar, tomada antes de tocar nada.
create temp table huella_antes on commit drop as
select 'plantilla 2026' as que, count(*) as n,
       md5(coalesce(string_agg(t::text, '|' order by catalog_value), '')) as h
  from public.plantilla_anual t where anio = 2026
union all
select 'servicios 2026', count(*), md5(coalesce(string_agg(t::text, '|' order by "ID"), ''))
  from public.estatus_2026 t
union all
select 'catalogo de personas', count(*), md5(coalesce(string_agg(t::text, '|' order by id), ''))
  from public.responsables t;

-- Sesión de Samuel Gómez (ADMIN), como la tendría en el navegador.
select set_config('request.jwt.claims',
  json_build_object('sub', 'c4618952-a8bf-4db0-9239-937451852bb6', 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  n1 int; n2 int; n3 int; n4 int;
begin
  -- 1) Gilberto pasa de la coordinación de Daniela a la de Martha, en 2027.
  insert into public.plantilla_anual
    (anio, catalog_value, full_name, puesto, nivel_salarial, partida, nivel_organico, reporta_a, color, activo)
  values
    (2027, 'GILBERTO AYALA RAMÍREZ', 'Gilberto Ayala Ramírez', 'Especialista en Contrataciones y Adquisiciones Públicas',
     'N5', 7, 'COLABORADOR', 'MARTHA CASTELÁN GARCÍA', 'verde', true)
  on conflict (anio, catalog_value) do update set
    reporta_a = excluded.reporta_a, color = excluded.color;
  get diagnostics n1 = row_count;

  -- 2) Baja de Irma en 2027.
  update public.plantilla_anual set activo = false
   where anio = 2027 and catalog_value = 'IRMA KARINA VARGAS GARCÍA';
  get diagnostics n2 = row_count;

  -- 3) Alta de alguien nuevo sólo en 2027 (catálogo + ficha del año).
  insert into public.responsables (full_name, catalog_value)
  values ('Persona Prueba 2027', 'PERSONA PRUEBA 2027')
  on conflict (catalog_value) do nothing;
  insert into public.plantilla_anual (anio, catalog_value, full_name, nivel_organico, reporta_a, color)
  values (2027, 'PERSONA PRUEBA 2027', 'Persona Prueba 2027', 'COLABORADOR', 'DANIELA ELIZABETH MERCADO ISLAS', 'azul');
  get diagnostics n3 = row_count;

  -- 4) Un servicio de 2027 de Irma pasa a Gilberto.
  update public.estatus_2027 set "Responsable" = 'GILBERTO AYALA RAMÍREZ'
   where "ID" = (select min("ID") from public.estatus_2027 where "Responsable" = 'IRMA KARINA VARGAS GARCÍA');
  get diagnostics n4 = row_count;

  perform set_config('prueba.escrituras', format('mover=%s baja=%s alta=%s servicio=%s', n1, n2, n3, n4), true);
end $$;

reset role;

do $$
declare
  fallas text := '';
  r record;
  ahora_n bigint; ahora_h text;
  v text; b boolean;
begin
  -- 2026 idéntico, renglón por renglón.
  for r in select * from huella_antes loop
    if r.que = 'plantilla 2026' then
      select count(*), md5(coalesce(string_agg(t::text, '|' order by catalog_value), '')) into ahora_n, ahora_h
        from public.plantilla_anual t where anio = 2026;
    elsif r.que = 'servicios 2026' then
      select count(*), md5(coalesce(string_agg(t::text, '|' order by "ID"), '')) into ahora_n, ahora_h
        from public.estatus_2026 t;
    else
      -- El catálogo sí recibe a la persona nueva; las 14 de antes no cambian.
      select count(*), md5(coalesce(string_agg(t::text, '|' order by id), '')) into ahora_n, ahora_h
        from public.responsables t where catalog_value <> 'PERSONA PRUEBA 2027';
    end if;
    if ahora_n <> r.n or ahora_h <> r.h then
      fallas := fallas || format(' [CAMBIÓ %s: %s→%s renglones]', r.que, r.n, ahora_n);
    end if;
  end loop;

  -- 2026 conserva los valores de siempre…
  select reporta_a into v from public.plantilla_anual where anio = 2026 and catalog_value = 'GILBERTO AYALA RAMÍREZ';
  if v is distinct from 'DANIELA ELIZABETH MERCADO ISLAS' then fallas := fallas || ' [2026 Gilberto reporta a ' || coalesce(v, 'nadie') || ']'; end if;
  select activo into b from public.plantilla_anual where anio = 2026 and catalog_value = 'IRMA KARINA VARGAS GARCÍA';
  if b is distinct from true then fallas := fallas || ' [2026 Irma quedó inactiva]'; end if;
  if exists (select 1 from public.plantilla_anual where anio = 2026 and catalog_value = 'PERSONA PRUEBA 2027') then
    fallas := fallas || ' [la persona nueva apareció en 2026]';
  end if;

  -- …y 2027 sí recibió los cambios (si no, la prueba no probaría nada).
  select reporta_a into v from public.plantilla_anual where anio = 2027 and catalog_value = 'GILBERTO AYALA RAMÍREZ';
  if v is distinct from 'MARTHA CASTELÁN GARCÍA' then fallas := fallas || ' [2027 Gilberto no se movió]'; end if;
  select activo into b from public.plantilla_anual where anio = 2027 and catalog_value = 'IRMA KARINA VARGAS GARCÍA';
  if b is distinct from false then fallas := fallas || ' [2027 Irma no se dio de baja]'; end if;
  if not exists (select 1 from public.plantilla_anual where anio = 2027 and catalog_value = 'PERSONA PRUEBA 2027') then
    fallas := fallas || ' [2027 no recibió el alta]';
  end if;

  raise exception 'RESULTADO: % | escrituras como ADMIN: % | 2026: % | 2027: Gilberto→Martha, Irma de baja, alta nueva, servicio reasignado (se revierte todo)',
    case when fallas = '' then 'PASA' else 'FALLA' || fallas end,
    current_setting('prueba.escrituras', true),
    case when fallas = '' then 'plantilla y servicios idénticos a antes' else 'ver fallas' end;
end $$;

rollback;
