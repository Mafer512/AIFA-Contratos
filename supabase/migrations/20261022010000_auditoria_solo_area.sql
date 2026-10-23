-- =============================================================================
-- Auditoría: sólo el área de Auditoría captura
--
-- QUÉ CAMBIA
-- 20261021000000_auditoria.sql dejaba capturar a cualquier ADMIN u OPERATOR.
-- Ahora capturar letras, agregar, corregir y quitar servicios es sólo de
-- quien tiene profiles.area_auditoria (y perfil vigente), sin importar su rol
-- en el resto del sistema. Todos los demás con sesión lo siguen viendo,
-- administradores incluidos.
--
-- Requiere 20261022000000_permisos_por_usuario.sql (crea area_auditoria y
-- puede_capturar_auditoria()). Si se vuelve a correr 20261021000000, hay que
-- correr ésta después.
--
-- IDEMPOTENTE: se puede correr más de una vez.
-- =============================================================================

begin;

drop policy if exists auditoria_servicios_insert on public.auditoria_servicios;
create policy auditoria_servicios_insert
  on public.auditoria_servicios for insert to authenticated
  with check (public.puede_capturar_auditoria());

drop policy if exists auditoria_servicios_update on public.auditoria_servicios;
create policy auditoria_servicios_update
  on public.auditoria_servicios for update to authenticated
  using (public.puede_capturar_auditoria())
  with check (public.puede_capturar_auditoria());

drop policy if exists auditoria_servicios_delete on public.auditoria_servicios;
create policy auditoria_servicios_delete
  on public.auditoria_servicios for delete to authenticated
  using (public.puede_capturar_auditoria());

drop policy if exists auditoria_marcas_insert on public.auditoria_marcas;
create policy auditoria_marcas_insert
  on public.auditoria_marcas for insert to authenticated
  with check (public.puede_capturar_auditoria());

drop policy if exists auditoria_marcas_update on public.auditoria_marcas;
create policy auditoria_marcas_update
  on public.auditoria_marcas for update to authenticated
  using (public.puede_capturar_auditoria())
  with check (public.puede_capturar_auditoria());

drop policy if exists auditoria_marcas_delete on public.auditoria_marcas;
create policy auditoria_marcas_delete
  on public.auditoria_marcas for delete to authenticated
  using (public.puede_capturar_auditoria());

commit;

-- =============================================================================
-- VERIFICACIÓN
--
--   select tablename, policyname, cmd, coalesce(with_check, qual)
--     from pg_policies where tablename like 'auditoria_%' order by 1, 2;
--
--   -- Quién puede capturar:
--   select full_name, role from public.profiles
--    where area_auditoria and baja_at is null order by full_name;
--
-- ROLLBACK (vuelve a ADMIN y OPERATOR)
--   Volver a correr la sección 4 de 20261021000000_auditoria.sql.
-- =============================================================================
