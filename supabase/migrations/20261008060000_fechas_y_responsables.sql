-- =============================================================================
-- Etapa 1 de la actualización guiada: fechas de verdad y cada quien lo suyo
--
-- 1) FECHAS
--    Nueve columnas de estatus_2026/2027 guardaban fechas como TEXTO
--    (vigencias, fallo, junta, apertura, visita, publicación, diferimiento y
--    firma). Convivían "2026-07-28", "31/12/2026" y "N/A", y cada pantalla
--    tenía que adivinar. Pasan a tipo date:
--      · "AAAA-MM-DD" se queda igual;
--      · "DD/MM/AAAA" se lee día/mes/año, como se escribe en México;
--      · "N/A" y vacíos quedan en blanco.
--    Antes de convertir, cada valor original se copia a respaldo_columnas_fecha
--    (con lo que se convirtió), así que nada se pierde. Aplicada el 8/10/2026:
--    los 483 valores eran fechas en esos dos formatos o "N/A" (80 "N/A" quedaron vacíos).
--
-- 2) CADA RESPONSABLE EDITA SUS SERVICIOS
--    Un OPERATOR sólo puede modificar los servicios cuyo "Responsable" es el
--    suyo (profiles.responsable). Se compara sin acentos ni mayúsculas y
--    reconociendo los alias del organigrama ("MENDONZA" = "MENDOZA"). Quien no
--    tiene responsable asignado ve y edita todos, igual que hoy. Los servicios
--    sin responsable los puede editar cualquier operador, y sólo puede
--    asignárselos a sí mismo. ADMIN sigue pudiendo todo.
--
-- 3) ÚLTIMO MOVIMIENTO
--    updated_at en cada servicio de 2026 (2027 ya lo tenía), puesto por la
--    base, para que "Mis servicios" sepa qué lleva semanas sin tocarse. Se
--    llena con la fecha del último cambio que tiene el historial.
--
-- IDEMPOTENTE: se puede correr más de una vez (una columna ya convertida no se
-- vuelve a convertir).
-- =============================================================================

begin;

-- ── Utilidades ───────────────────────────────────────────────────────────────

-- "Lilián  Pérez " → "LILIAN PEREZ"
create or replace function public.normalizar_nombre(t text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(upper(translate(btrim(coalesce(t, '')),
    'áéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙ', 'aeiouunAEIOUUNaeiouAEIOU')), '\s+', ' ', 'g'), '')
$$;

-- La persona del organigrama a la que se refiere un nombre (por nombre,
-- valor de catálogo o alias). null si no está.
create or replace function public.persona_de(nombre text)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id
    from public.responsables r
   where public.normalizar_nombre(nombre) in (public.normalizar_nombre(r.catalog_value), public.normalizar_nombre(r.full_name))
      or exists (select 1 from unnest(coalesce(r.aliases, '{}'::text[])) a where public.normalizar_nombre(a) = public.normalizar_nombre(nombre))
   order by r.id
   limit 1
$$;

create or replace function public.mismo_responsable(a text, b text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.normalizar_nombre(a) is not null and (
    public.normalizar_nombre(a) = public.normalizar_nombre(b)
    or (public.persona_de(a) is not null and public.persona_de(a) = public.persona_de(b))
  )
$$;

-- ¿Quien llama puede modificar un servicio con este responsable?
create or replace function public.puede_editar_servicio(responsable_servicio text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case public.current_app_role()
    when 'ADMIN' then true
    when 'OPERATOR' then coalesce((
      select p.responsable is null
          or public.normalizar_nombre(responsable_servicio) is null
          or public.mismo_responsable(p.responsable, responsable_servicio)
        from public.profiles p
       where p.id = auth.uid()
    ), false)
    else false
  end
$$;

revoke all on function public.persona_de(text) from public, anon;
revoke all on function public.mismo_responsable(text, text) from public, anon;
revoke all on function public.puede_editar_servicio(text) from public, anon;
grant execute on function public.persona_de(text) to authenticated;
grant execute on function public.mismo_responsable(text, text) to authenticated;
grant execute on function public.puede_editar_servicio(text) to authenticated;

-- Texto de fecha → date. null para "N/A", vacío o algo que no sea fecha.
create or replace function public.texto_a_fecha(t text)
returns date
language plpgsql
immutable
as $$
declare
  s text := btrim(coalesce(t, ''));
  m text[];
begin
  if s = '' or s ~* '^(n/?a|na|no aplica|-+|—)$' then
    return null;
  end if;
  m := regexp_match(s, '^(\d{4})-(\d{1,2})-(\d{1,2})');
  if m is not null then
    return make_date(m[1]::int, m[2]::int, m[3]::int);
  end if;
  m := regexp_match(s, '^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$');
  if m is not null then
    return make_date(case when length(m[3]) = 2 then 2000 + m[3]::int else m[3]::int end, m[2]::int, m[1]::int);
  end if;
  return null;
exception when others then
  return null;
end;
$$;

-- ── 1) Respaldo y conversión de fechas ───────────────────────────────────────

create table if not exists public.respaldo_columnas_fecha (
  id           bigint generated always as identity primary key,
  tabla        text not null,
  servicio_id  integer,
  columna      text not null,
  valor_texto  text,
  convertido   date,
  respaldado_at timestamptz not null default now()
);
alter table public.respaldo_columnas_fecha enable row level security;
revoke all on public.respaldo_columnas_fecha from anon, authenticated, public;

do $$
declare
  t text;
  c text;
begin
  foreach t in array array['estatus_2026', 'estatus_2027'] loop
    foreach c in array array[
      'Vigencia de inicio', 'Vigencia de Término', 'Fallo', 'Junta de Aclaraciones',
      'Apertura de Proposiciones', 'Publicación de Convocatoria', 'Visita a las instalaciones',
      'Diferimiento de fallo', 'Fecha de firma de contrato'
    ] loop
      -- Sólo columnas que sigan siendo texto: correrla otra vez no hace nada.
      if exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = t and column_name = c and data_type = 'text'
      ) then
        execute format(
          'insert into public.respaldo_columnas_fecha (tabla, servicio_id, columna, valor_texto, convertido)
           select %L, "ID", %L, %I, public.texto_a_fecha(%I) from public.%I where nullif(btrim(%I), '''') is not null',
          t, c, c, c, t, c);
        execute format('alter table public.%I alter column %I type date using public.texto_a_fecha(%I)', t, c, c);
      end if;
    end loop;
  end loop;
end $$;

-- ── 2) Cada responsable edita sus servicios ──────────────────────────────────

drop policy if exists estatus_2026_update on public.estatus_2026;
create policy estatus_2026_update
  on public.estatus_2026 for update to authenticated
  using (public.puede_editar_servicio("Responsable"))
  with check (public.puede_editar_servicio("Responsable"));

drop policy if exists estatus_2026_insert on public.estatus_2026;
create policy estatus_2026_insert
  on public.estatus_2026 for insert to authenticated
  with check (public.puede_editar_servicio("Responsable"));

drop policy if exists estatus_2027_update on public.estatus_2027;
create policy estatus_2027_update
  on public.estatus_2027 for update to authenticated
  using (public.puede_editar_servicio("Responsable"))
  with check (public.puede_editar_servicio("Responsable"));

drop policy if exists estatus_2027_insert on public.estatus_2027;
create policy estatus_2027_insert
  on public.estatus_2027 for insert to authenticated
  with check (public.puede_editar_servicio("Responsable"));

-- ── 3) Último movimiento ─────────────────────────────────────────────────────
-- estatus_2027 ya lo tiene (columna updated_at + trigger touch_updated_at).
-- estatus_2026 recibe lo mismo, con la misma función, para que los dos años
-- se comporten igual.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

alter table public.estatus_2026 add column if not exists updated_at timestamptz;

drop trigger if exists estatus_2026_touch_updated_at on public.estatus_2026;
create trigger estatus_2026_touch_updated_at
  before insert or update on public.estatus_2026
  for each row execute function public.touch_updated_at();

-- Relleno desde el historial, sin disparar el trigger (pondría "ahora" a
-- todos) y sólo donde aún no hay fecha.
alter table public.estatus_2026 disable trigger estatus_2026_touch_updated_at;

update public.estatus_2026 e
   set updated_at = h.ultimo
  from (select record_id, max(created_at) ultimo from public.change_history
         where table_name = 'estatus_2026' group by record_id) h
 where h.record_id = e."ID"::text and e.updated_at is null;

alter table public.estatus_2026 enable trigger estatus_2026_touch_updated_at;

commit;

-- =============================================================================
-- VERIFICACIÓN
--
--   select columna, count(*), count(convertido) from public.respaldo_columnas_fecha group by 1;
--   -- Con sesión de un operador con responsable: sólo sus servicios.
--   select "ID" from public.estatus_2026 where public.puede_editar_servicio("Responsable");
--
-- ROLLBACK de los permisos (vuelve a "ADMIN y OPERATOR editan todo"):
--
--   begin;
--   drop policy if exists estatus_2026_update on public.estatus_2026;
--   create policy estatus_2026_update on public.estatus_2026 for update to authenticated
--     using (current_app_role() in ('ADMIN', 'OPERATOR')) with check (current_app_role() in ('ADMIN', 'OPERATOR'));
--   -- (igual para insert y para estatus_2027)
--   commit;
--
-- Las fechas no se regresan a texto: el respaldo conserva el valor original
-- de cada celda por si hiciera falta consultarlo.
-- =============================================================================
