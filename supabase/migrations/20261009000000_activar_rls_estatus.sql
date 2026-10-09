-- =============================================================================
-- Encender la seguridad por filas en estatus_2026 y estatus_2027
--
-- POR QUÉ
-- Las dos tablas ya tenían sus políticas (ver, capturar, borrar) y ya no se
-- podían tocar sin sesión, pero la seguridad por filas estaba APAGADA: las
-- políticas existían y no se aplicaban. Se comprobó el 8/10/2026 con cuentas
-- de prueba: un usuario "Solo lectura" podía editar cualquier servicio, y un
-- operador podía editar los de otra responsable.
--
-- No hay registro de por qué se apagó. Lo más probable es que, al encenderla
-- la primera vez (20260916010000_endurecer_tablas_existentes.OPCIONAL.sql),
-- alguien sin rol en profiles se quedó sin poder capturar. Hoy todos los
-- perfiles activos tienen rol, y la regla de edición es la de
-- 20261008060000_fechas_y_responsables.sql:
--   · ADMIN edita todo;
--   · OPERATOR edita sus servicios, los que no tienen responsable, o todos si
--     a él no se le asignó responsable;
--   · VIEWER no edita.
-- Leer sigue abierto a cualquiera con sesión. Borrar, sólo ADMIN.
--
-- IDEMPOTENTE.
-- =============================================================================

begin;

alter table public.estatus_2026 enable row level security;
alter table public.estatus_2027 enable row level security;

-- Nadie edita la estructura ni vacía la tabla desde la API.
revoke truncate, references, trigger on public.estatus_2026 from authenticated, anon, public;
revoke truncate, references, trigger on public.estatus_2027 from authenticated, anon, public;

commit;

-- =============================================================================
-- VERIFICACIÓN
--   select relname, relrowsecurity from pg_class where relname in ('estatus_2026', 'estatus_2027');
--
-- ROLLBACK (deja las tablas como estaban: sin aplicar las políticas)
--   alter table public.estatus_2026 disable row level security;
--   alter table public.estatus_2027 disable row level security;
-- =============================================================================
