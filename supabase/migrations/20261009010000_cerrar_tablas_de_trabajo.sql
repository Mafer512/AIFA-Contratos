-- =============================================================================
-- Cerrar a la llave anónima las tablas de trabajo que usa el tablero
--
-- POR QUÉ
-- Al 9/10/2026 estas ocho tablas tenían la seguridad por filas APAGADA y la
-- llave "anon" (la que viaja en el JavaScript del sitio) podía leerlas,
-- editarlas y borrarlas sin iniciar sesión:
--
--   pagos, control_pagos, procedimientos, procedimientos_compranet,
--   balance_paas_2026, estatus_facturas, estatus_procedimiento,
--   estatus_servicios_2026
--
-- pagos, control_pagos y balance_paas_2026 ya tenían políticas, pero abiertas
-- a cualquiera con sesión (using true) y, con la seguridad apagada, ni ésas se
-- aplicaban.
--
-- La app no cambia: siempre entra con sesión (rol "authenticated"). Desde
-- febrero de 2026 hay ~3,700 lecturas con sesión por tabla contra ~25 sin
-- sesión, que corresponden a scripts de prueba de scripts/.
--
-- REGLA (la misma de estatus_2026/2027 y la que ya aplica la interfaz)
--   · leer: cualquiera con sesión;
--   · capturar y editar: ADMIN y OPERATOR (canManageRecords en Dashboard.tsx);
--   · borrar: sólo ADMIN (requireDeletePermission en Dashboard.tsx);
--   · sin sesión: nada.
--
-- FUERA DE ESTA MIGRACIÓN
-- "Enero 2026 Comercial", "Histórico" y mediciones_coda también están
-- abiertas, pero este tablero no las usa y pueden alimentar otra cosa. Se
-- deciden aparte.
--
-- IDEMPOTENTE.
-- =============================================================================

begin;

do $$
declare
  t text;
  p record;
begin
  foreach t in array array[
    'pagos', 'control_pagos', 'procedimientos', 'procedimientos_compranet',
    'balance_paas_2026', 'estatus_facturas', 'estatus_procedimiento',
    'estatus_servicios_2026'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('revoke all on public.%I from anon, public', t);
    execute format('revoke truncate, references, trigger on public.%I from authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    -- Fuera las políticas anteriores ("Authenticated users can …", "Permitir …"):
    -- eran using (true) y, como las políticas se suman, dejarían borrar a todos.
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (public.current_app_role() in (''ADMIN'', ''OPERATOR''))',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (public.current_app_role() in (''ADMIN'', ''OPERATOR''))
         with check (public.current_app_role() in (''ADMIN'', ''OPERATOR''))',
      t || '_update', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (public.current_app_role() = ''ADMIN'')',
      t || '_delete', t);
  end loop;
end $$;

commit;

-- =============================================================================
-- VERIFICACIÓN — anon_lee debe decir false en las ocho
--   select relname, relrowsecurity, has_table_privilege('anon', oid, 'SELECT') as anon_lee
--   from pg_class
--   where relnamespace = 'public'::regnamespace
--     and relname in ('pagos', 'control_pagos', 'procedimientos', 'procedimientos_compranet',
--                     'balance_paas_2026', 'estatus_facturas', 'estatus_procedimiento',
--                     'estatus_servicios_2026');
--
-- ROLLBACK (sólo si algo se rompe: las deja abiertas como estaban)
--   Por cada tabla:
--     alter table public.<tabla> disable row level security;
--     grant select, insert, update, delete on public.<tabla> to anon;
-- =============================================================================
