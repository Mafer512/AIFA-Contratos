-- =============================================================================
-- OPCIONAL — cerrar a la llave anónima las tablas que hoy están abiertas
--
-- NO se corre solo. Revísalo, decide, y córrelo cuando quieras. Toca tablas de
-- producción que ya están en uso, por eso viene aparte de la migración de 2027.
--
-- QUÉ PROBLEMA RESUELVE
-- La llave "anon" viaja dentro del JavaScript que sirve el sitio: cualquiera
-- que abra las herramientas del navegador la copia en diez segundos. Hoy, con
-- esa llave y sin iniciar sesión, se puede leer:
--
--   curl "https://hvabkxgxmthyqbgsjqgr.supabase.co/rest/v1/estatus_2026?select=*" \
--        -H "apikey: <la llave del bundle>"
--   curl "https://hvabkxgxmthyqbgsjqgr.supabase.co/rest/v1/change_history?select=*" \
--        -H "apikey: <la llave del bundle>"
--
-- El primero devuelve el programa anual completo con montos y proveedores. El
-- segundo devuelve el historial con nombres, roles y el contenido íntegro de
-- cada renglón antes y después de cada cambio. profiles sí está protegida
-- (devuelve vacío), así que la base ya sabe hacer esto: es que a estas dos no
-- se les puso política.
--
-- La app no se entera del cambio: siempre entra con sesión iniciada, y la
-- sesión es rol "authenticated".
--
-- CÓMO PROBARLO ANTES DE DECIDIR
--   1. Corre sólo la sección 1 (estatus_2026) en un momento de poco uso.
--   2. Entra a la app, revisa 2026 → Resumen, Estatus servicios y Gantt.
--   3. Repite el curl de arriba: debe devolver [].
--   4. Si algo se ve mal, abajo está el rollback.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) estatus_2026 — mismo criterio que estatus_2027
-- -----------------------------------------------------------------------------
alter table public.estatus_2026 enable row level security;

revoke all on public.estatus_2026 from anon, public;
grant select, insert, update, delete on public.estatus_2026 to authenticated;

drop policy if exists estatus_2026_select on public.estatus_2026;
create policy estatus_2026_select
  on public.estatus_2026 for select to authenticated using (true);

drop policy if exists estatus_2026_insert on public.estatus_2026;
create policy estatus_2026_insert
  on public.estatus_2026 for insert to authenticated
  with check (public.current_app_role() in ('ADMIN', 'OPERATOR'));

drop policy if exists estatus_2026_update on public.estatus_2026;
create policy estatus_2026_update
  on public.estatus_2026 for update to authenticated
  using (public.current_app_role() in ('ADMIN', 'OPERATOR'))
  with check (public.current_app_role() in ('ADMIN', 'OPERATOR'));

drop policy if exists estatus_2026_delete on public.estatus_2026;
create policy estatus_2026_delete
  on public.estatus_2026 for delete to authenticated
  using (public.current_app_role() = 'ADMIN');

-- -----------------------------------------------------------------------------
-- 2) change_history — se lee con sesión, y nadie la reescribe
--
-- Sin update ni delete para authenticated: una bitácora que el propio usuario
-- puede borrar o corregir no sirve como bitácora. El trigger de estatus_2027
-- escribe con SECURITY DEFINER, así que no le afecta.
-- -----------------------------------------------------------------------------
alter table public.change_history enable row level security;

revoke all on public.change_history from anon, public;
grant select, insert on public.change_history to authenticated;

drop policy if exists change_history_select on public.change_history;
create policy change_history_select
  on public.change_history for select to authenticated using (true);

-- El insert del cliente (logChange en Dashboard.tsx) sigue funcionando, pero
-- sólo puede firmar con su propio id: se acabó poder anotar un cambio a nombre
-- de otra persona.
drop policy if exists change_history_insert on public.change_history;
create policy change_history_insert
  on public.change_history for insert to authenticated
  with check (changed_by is null or changed_by = auth.uid()::text);

commit;

-- =============================================================================
-- VERIFICACIÓN — las tres deben decir false
-- =============================================================================
-- select has_table_privilege('anon', 'public.estatus_2026',   'SELECT') as anon_lee_2026,
--        has_table_privilege('anon', 'public.estatus_2027',   'SELECT') as anon_lee_2027,
--        has_table_privilege('anon', 'public.change_history', 'SELECT') as anon_lee_historial;

-- =============================================================================
-- ROLLBACK — deja las tablas como estaban (abiertas). Sólo si algo se rompe.
-- =============================================================================
-- begin;
--   alter table public.estatus_2026   disable row level security;
--   alter table public.change_history disable row level security;
--   grant select, insert, update, delete on public.estatus_2026   to anon;
--   grant select, insert                 on public.change_history to anon;
-- commit;
