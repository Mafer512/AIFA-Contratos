-- =============================================================================
-- El historial de cambios se cierra a administradores
--
-- POR QUÉ
-- La pantalla "Historial" ya sólo se le muestra a los ADMIN, pero esconder un
-- botón no protege un dato: con la llave del bundle y una sesión de cualquier
-- operador, esto seguía devolviendo el historial completo —nombres, roles y el
-- contenido íntegro de cada renglón antes y después de cada cambio—:
--
--   curl "https://hvabkxgxmthyqbgsjqgr.supabase.co/rest/v1/change_history?select=*" \
--        -H "apikey: <la llave del bundle>" -H "Authorization: Bearer <token de cualquiera>"
--
-- La política que puso la migración de endurecimiento decía `using (true)`:
-- cerraba la tabla a anon, pero la dejaba abierta a todo usuario con sesión.
-- Aquí se aprieta al mismo criterio que la interfaz.
--
-- QUÉ NO CAMBIA
-- El insert. Los operadores tienen que poder firmar sus cambios aunque no
-- puedan leer el historial de los demás; si se les quitara, editar una tabla
-- dejaría de quedar registrado, que es justo lo contrario de lo que se busca.
--
-- IDEMPOTENTE: se puede correr más de una vez.
-- =============================================================================

begin;

-- current_app_role() ya existe si se corrió cualquiera de las migraciones
-- anteriores; se repite para que ésta también se sostenga sola.
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

alter table public.change_history enable row level security;

revoke all on public.change_history from anon, public;
grant select, insert on public.change_history to authenticated;

-- Lectura: sólo administradores.
drop policy if exists change_history_select on public.change_history;
create policy change_history_select
  on public.change_history for select to authenticated
  using (public.current_app_role() = 'ADMIN');

-- Escritura: cualquiera con sesión, pero firmando con su propio id. Igual que
-- antes; se repite aquí para que la migración describa el estado final completo.
drop policy if exists change_history_insert on public.change_history;
create policy change_history_insert
  on public.change_history for insert to authenticated
  with check (changed_by is null or changed_by = auth.uid()::text);

commit;

-- =============================================================================
-- VERIFICACIÓN
--
--   -- Con sesión de operador debe devolver 0 filas; con sesión de admin, todas.
--   select count(*) from public.change_history;
--
-- ROLLBACK — vuelve a dejar que cualquier usuario con sesión lea el historial.
--
--   begin;
--   drop policy if exists change_history_select on public.change_history;
--   create policy change_history_select
--     on public.change_history for select to authenticated using (true);
--   commit;
-- =============================================================================
