-- =============================================================================
-- Permisos por persona: qué vistas ve y si es del área de Auditoría
--
-- QUÉ AGREGA A profiles
--   · modulos text[]  → las vistas del tablero que la persona puede ver
--     ("2026.pagos", "reportes.paaas", "auditoria"…; el catálogo vive en
--     utils/vistas.ts). null = todas: así quedan todas las cuentas que ya
--     existen, para que nadie pierda acceso al aplicar esto.
--   · area_auditoria boolean → la persona es del área de Auditoría. Sólo ellas
--     capturan, corrigen, agregan o quitan en el módulo de Auditoría (lo exige
--     la base en 20261022010000_auditoria.sql). Un administrador sin la marca
--     ve Auditoría pero no la modifica.
--
-- QUIÉN LOS CAMBIA
-- Sólo un ADMIN (desde Accesos → Usuarios o al dar de alta). Las políticas de
-- profiles ya sólo dejan escribir a ADMIN; el guardia de abajo lo vuelve a
-- exigir para estas dos columnas, por si algún día se abre otra política.
-- Es un trigger aparte de profiles_guard a propósito: así no hay que volver a
-- copiar ese guardia completo (cada copia nueva pisa la anterior).
--
-- Las vistas ocultan pantallas; no cierran tablas. Quien no ve "Pagos 2026"
-- no tiene cómo llegar a esa pantalla, pero la base no le niega leer pagos
-- (Auditoría, por ejemplo, la usa para saber la vigencia de cada contrato).
--
-- IDEMPOTENTE: se puede correr más de una vez.
-- =============================================================================

begin;

alter table public.profiles add column if not exists modulos text[];
alter table public.profiles add column if not exists area_auditoria boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_modulos_check') then
    alter table public.profiles
      add constraint profiles_modulos_check check (modulos is null or cardinality(modulos) <= 100);
  end if;
end $$;

-- ── Guardia de las dos columnas ──────────────────────────────────────────────
create or replace function public.profiles_guard_permisos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
begin
  -- Funciones del servidor (crear-usuario) y el editor SQL: pasan.
  if jwt_role = 'service_role' then
    return new;
  end if;
  if jwt_role = '' then
    -- Lo que crea Auth por su cuenta nace sin área; las vistas, como siempre.
    if tg_op = 'INSERT' and session_user = 'supabase_auth_admin' then
      new.area_auditoria := false;
      new.modulos := null;
    end if;
    return new;
  end if;

  if public.current_app_role() = 'ADMIN' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.area_auditoria := false;
    new.modulos := null;
    return new;
  end if;

  if new.area_auditoria is distinct from old.area_auditoria
     or new.modulos is distinct from old.modulos then
    raise exception 'Sólo un administrador puede cambiar las vistas o el área de una persona.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_guard_permisos() from public, anon, authenticated;

drop trigger if exists profiles_guard_permisos_trg on public.profiles;
create trigger profiles_guard_permisos_trg
  before insert or update on public.profiles
  for each row execute function public.profiles_guard_permisos();

-- ── ¿Quien llama es del área de Auditoría? ───────────────────────────────────
-- Con perfil vigente: una cuenta dada de baja no captura aunque tenga la marca.
create or replace function public.puede_capturar_auditoria()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select p.area_auditoria from public.profiles p where p.id = auth.uid() and p.baja_at is null),
    false
  )
$$;

revoke all on function public.puede_capturar_auditoria() from public, anon;
grant execute on function public.puede_capturar_auditoria() to authenticated;

commit;

-- =============================================================================
-- VERIFICACIÓN
--
--   select full_name, role, area_auditoria, modulos
--     from public.profiles where baja_at is null order by area_auditoria desc, full_name;
--
-- ROLLBACK (antes de quitar esto hay que quitar 20261022010000_auditoria.sql,
-- cuyas políticas usan puede_capturar_auditoria)
--
--   begin;
--   drop trigger if exists profiles_guard_permisos_trg on public.profiles;
--   drop function if exists public.profiles_guard_permisos();
--   drop function if exists public.puede_capturar_auditoria();
--   alter table public.profiles drop constraint if exists profiles_modulos_check;
--   alter table public.profiles drop column if exists modulos;
--   alter table public.profiles drop column if exists area_auditoria;
--   commit;
-- =============================================================================
