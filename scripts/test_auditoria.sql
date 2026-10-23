-- =============================================================================
-- Prueba: Auditoría y permisos por persona, con las políticas RLS activas
--
-- Ejecutar con (requiere 20261021000000_auditoria.sql,
-- 20261022000000_permisos_por_usuario.sql y 20261022010000_auditoria_solo_area.sql):
--   supabase db query --linked -f scripts/test_auditoria.sql
--
-- NO DEJA NADA GUARDADO: todo corre en una transacción que termina con un
-- error a propósito, así que la base la deshace completa. El resultado viene
-- en el mensaje de ese error ("RESULTADO: ...").
--
-- Con sesiones reales, como las tendría el navegador:
--   1. alguien del área de Auditoría agrega un servicio, marca letras, cambia
--      una y borra otra;
--   2. un ADMIN que no es del área no puede capturar ni quitar servicios;
--   3. un ADMIN sí puede cambiar vistas y área de otra persona; quien no es
--      ADMIN no puede cambiarse las suyas;
--   4. una cuenta dada de baja, aunque tenga la marca, no ve ni escribe;
--   5. la bitácora guarda cada cambio con el nombre de quien lo hizo y nadie
--      la puede escribir a mano.
-- =============================================================================

begin;

-- Preparación (como el editor SQL): el OPERATOR activo es del área; también
-- la cuenta dada de baja, para comprobar que la baja manda.
update public.profiles set area_auditoria = true
 where id in ('4597c37c-be04-41aa-8944-1b6cb985ffda', '7fc53a59-8afc-437c-a637-e318b5e23397');
update public.profiles set area_auditoria = false
 where id = 'c4618952-a8bf-4db0-9239-937451852bb6';

-- 1) Área de Auditoría (rol OPERATOR).
do $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '4597c37c-be04-41aa-8944-1b6cb985ffda', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  insert into public.auditoria_servicios (anio, contrato, descripcion, proveedor)
  values (2039, '  AIFA-C-LPN-DO-SVS-999/2039 ', 'Servicio   de prueba', 'Proveedor de prueba');

  insert into public.auditoria_marcas (servicio_id, mes, estado)
  select id, m, 'c' from public.auditoria_servicios, generate_series(1, 3) m where anio = 2039;
  update public.auditoria_marcas set estado = 'E'
   where mes = 2 and servicio_id = (select id from public.auditoria_servicios where anio = 2039);
  delete from public.auditoria_marcas
   where mes = 3 and servicio_id = (select id from public.auditoria_servicios where anio = 2039);

  -- Intenta darse más vistas a sí mismo: profiles no se lo permite.
  declare n int;
  begin
    update public.profiles set modulos = array['auditoria', '2026.pagos'] where id = auth.uid();
    get diagnostics n = row_count;
    perform set_config('prueba.se_dio_vistas', n::text, true);
  exception when insufficient_privilege then
    perform set_config('prueba.se_dio_vistas', '0', true);
  end;

  perform set_config('role', 'postgres', true);
end $$;

-- 2 y 3) ADMIN sin la marca: no captura, no quita; sí cambia permisos de otros.
do $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', 'c4618952-a8bf-4db0-9239-937451852bb6', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);

  begin
    insert into public.auditoria_marcas (servicio_id, mes, estado)
    select id, 4, 'R' from public.auditoria_servicios where anio = 2039;
    perform set_config('prueba.admin_inserto', 'si', true);
  exception when insufficient_privilege then
    perform set_config('prueba.admin_inserto', 'no', true);
  end;

  update public.auditoria_marcas set estado = 'N'
   where servicio_id = (select id from public.auditoria_servicios where anio = 2039);
  get diagnostics n = row_count;
  perform set_config('prueba.admin_actualizo', n::text, true);

  delete from public.auditoria_servicios where anio = 2039;
  get diagnostics n = row_count;
  perform set_config('prueba.admin_borro', n::text, true);

  update public.profiles set modulos = array['auditoria']
   where id = '4597c37c-be04-41aa-8944-1b6cb985ffda';
  get diagnostics n = row_count;
  perform set_config('prueba.admin_vistas', n::text, true);

  begin
    insert into public.auditoria_bitacora (servicio_id, mes, despues) values (1, 1, 'C');
    perform set_config('prueba.bitacora_a_mano', 'si', true);
  exception when insufficient_privilege then
    perform set_config('prueba.bitacora_a_mano', 'no', true);
  end;

  perform set_config('role', 'postgres', true);
end $$;

-- 4) Dado de baja con la marca: no ve ni escribe.
do $$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '7fc53a59-8afc-437c-a637-e318b5e23397', 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into n from public.auditoria_servicios;
  perform set_config('prueba.baja_ve', n::text, true);
  begin
    insert into public.auditoria_marcas (servicio_id, mes, estado)
    select id, 5, 'C' from public.auditoria_servicios where anio = 2039;
    get diagnostics n = row_count;
    perform set_config('prueba.baja_escribio', n::text, true);
  exception when insufficient_privilege then
    perform set_config('prueba.baja_escribio', '0', true);
  end;
  perform set_config('role', 'postgres', true);
end $$;

do $$
declare
  fallas text := '';
  v_id bigint;
  v text;
  n int;
begin
  select id, contrato || '|' || descripcion into v_id, v from public.auditoria_servicios where anio = 2039;
  if v is distinct from 'AIFA-C-LPN-DO-SVS-999/2039|Servicio de prueba' then fallas := fallas || ' [no limpió el texto o no se creó: ' || coalesce(v, 'nulo') || ']'; end if;

  select string_agg(mes || estado, ',' order by mes) into v from public.auditoria_marcas where servicio_id = v_id;
  if v is distinct from '1C,2E' then fallas := fallas || ' [letras: ' || coalesce(v, 'ninguna') || ']'; end if;

  select actualizado_nombre into v from public.auditoria_marcas where servicio_id = v_id and mes = 1;
  if v is null then fallas := fallas || ' [la letra no trae quién la puso]'; end if;

  select string_agg(mes || ':' || coalesce(antes, '·') || '>' || coalesce(despues, '·'), ',' order by id) into v
    from public.auditoria_bitacora where servicio_id = v_id;
  if v is distinct from '1:·>C,2:·>C,3:·>C,2:C>E,3:C>·' then fallas := fallas || ' [bitácora: ' || coalesce(v, 'vacía') || ']'; end if;
  select count(*) into n from public.auditoria_bitacora where servicio_id = v_id and por_nombre is null;
  if n > 0 then fallas := fallas || ' [bitácora sin nombre]'; end if;

  if current_setting('prueba.admin_inserto', true) <> 'no' then fallas := fallas || ' [un ADMIN sin área capturó]'; end if;
  if current_setting('prueba.admin_actualizo', true) <> '0' then fallas := fallas || ' [un ADMIN sin área cambió letras]'; end if;
  if current_setting('prueba.admin_borro', true) <> '0' then fallas := fallas || ' [un ADMIN sin área quitó un servicio]'; end if;
  if current_setting('prueba.se_dio_vistas', true) <> '0' then fallas := fallas || ' [alguien que no es ADMIN se cambió sus vistas]'; end if;
  if current_setting('prueba.admin_vistas', true) <> '1' then fallas := fallas || ' [el ADMIN no pudo cambiar vistas]'; end if;
  select array_to_string(modulos, ',') into v from public.profiles where id = '4597c37c-be04-41aa-8944-1b6cb985ffda';
  if v is distinct from 'auditoria' then fallas := fallas || ' [vistas del operador: ' || coalesce(v, 'todas') || ']'; end if;
  if current_setting('prueba.bitacora_a_mano', true) <> 'no' then fallas := fallas || ' [se pudo escribir la bitácora a mano]'; end if;
  if current_setting('prueba.baja_ve', true) <> '0' then fallas := fallas || ' [un usuario de baja ve servicios]'; end if;
  if current_setting('prueba.baja_escribio', true) <> '0' then fallas := fallas || ' [un usuario de baja escribió]'; end if;

  select count(*) into n from public.auditoria_servicios where anio = 2026;

  raise exception 'RESULTADO: % | servicios 2026 cargados: % (se revierte todo)',
    case when fallas = '' then 'PASA' else 'FALLA' || fallas end, n;
end $$;

rollback;
