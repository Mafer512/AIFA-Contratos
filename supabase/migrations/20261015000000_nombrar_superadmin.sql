-- =============================================================================
-- Un superadmin puede nombrar a otro superadmin
--
-- QUÉ CAMBIA
-- Hasta ahora la marca profiles.is_superadmin sólo se ponía desde el editor
-- SQL. Ahora un superadmin la pone desde Accesos → Usuarios con la función
-- nombrar_superadmin(), que valida y deja constancia en el historial.
--
-- REGLAS (las exige profiles_guard, aunque alguien actualice la tabla directo)
--   · Sólo un superadmin activo nombra superadmins, y sólo a un ADMIN activo.
--   · Quitar la marca sigue siendo sólo desde el editor SQL: así dos
--     superadmins no pueden quitársela uno al otro.
--   · Mientras tenga la marca, el rol de un superadmin queda fijo en ADMIN.
--     Bajarle el rol sería quitarle la marca por la puerta de atrás, porque
--     current_is_superadmin() exige rol ADMIN.
--   · Las bajas siguen igual: sólo la función baja-usuario (service_role), y
--     ahora se revisan aparte de la marca para que un mismo update no pueda
--     colar las dos cosas.
--
-- Mismo guardia de 20261008030000_baja_usuarios.sql con estos cambios
-- (marcados con ◆). Si se vuelve a correr aquélla, hay que correr ésta después.
--
-- IDEMPOTENTE: se puede correr más de una vez.
-- =============================================================================

begin;

create or replace function public.profiles_guard()
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
  if jwt_role = 'service_role' then
    return new;
  end if;

  if jwt_role = '' then
    if tg_op = 'INSERT' and session_user = 'supabase_auth_admin' then
      new.role := 'VIEWER';
      new.can_reset_passwords := false;
      new.is_superadmin := false;
      new.baja_at := null;
      new.baja_por := null;
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_superadmin := false;
    new.baja_at := null;
    new.baja_por := null;
  else
    if new.baja_at is distinct from old.baja_at or new.baja_por is distinct from old.baja_por then
      raise exception 'Las bajas sólo las hace el superadmin desde Accesos → Usuarios.'
        using errcode = '42501';
    end if;

    -- ◆ Poner la marca: un superadmin, a un ADMIN activo. Quitarla: sólo SQL.
    if new.is_superadmin is distinct from old.is_superadmin then
      if old.is_superadmin then
        raise exception 'La marca de superadmin sólo se quita desde el editor SQL de Supabase.'
          using errcode = '42501';
      end if;
      if not public.current_is_superadmin() then
        raise exception 'Sólo un superadmin puede nombrar a otro superadmin.'
          using errcode = '42501';
      end if;
      if new.role is distinct from 'ADMIN' or new.baja_at is not null then
        raise exception 'Sólo un administrador activo puede ser superadmin.'
          using errcode = '42501';
      end if;
    end if;

    -- ◆ El rol de un superadmin no se cambia mientras tenga la marca.
    if old.is_superadmin and new.role is distinct from old.role then
      raise exception 'Un superadmin siempre es Administrador. Para cambiarle el rol, primero quítale la marca desde el editor SQL.'
        using errcode = '42501';
    end if;
  end if;

  if public.current_app_role() = 'ADMIN' then
    if tg_op = 'UPDATE' and old.is_superadmin and not public.current_is_superadmin() then
      raise exception 'Sólo un superadmin puede modificar la cuenta de un superadmin.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Sólo un administrador puede dar de alta perfiles.'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.responsable is distinct from old.responsable
     or new.can_reset_passwords is distinct from old.can_reset_passwords
     or new.email is distinct from old.email then
    raise exception 'Sólo un administrador puede cambiar rol, servicios o correo de un perfil.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.profiles_guard() from public, anon, authenticated;

-- ◆ Lo que llama la aplicación. Revisa lo mismo que el guardia, pero con
-- mensajes para la persona, y registra quién nombró a quién.
create or replace function public.nombrar_superadmin(p_usuario uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  yo public.profiles%rowtype;
  destino public.profiles%rowtype;
begin
  if not public.current_is_superadmin() then
    raise exception 'Sólo un superadmin puede nombrar a otro superadmin.'
      using errcode = '42501';
  end if;

  select * into yo from public.profiles where id = auth.uid();
  select * into destino from public.profiles where id = p_usuario for update;

  if not found then
    raise exception 'Ese usuario ya no existe.' using errcode = 'P0002';
  end if;
  if destino.is_superadmin then
    raise exception '% ya es superadmin.', coalesce(destino.full_name, 'Esa cuenta') using errcode = '22023';
  end if;
  if destino.baja_at is not null then
    raise exception 'Esa cuenta está dada de baja. Reactívala primero.' using errcode = '22023';
  end if;
  if destino.role is distinct from 'ADMIN' then
    raise exception 'Primero cámbiale el rol a Administrador.' using errcode = '22023';
  end if;

  update public.profiles set is_superadmin = true where id = p_usuario;

  insert into public.change_history
    (table_name, record_id, action, changed_by, changed_by_name, changed_by_role, changes, previous_data, new_data)
  values (
    'profiles', p_usuario::text, 'UPDATE', auth.uid()::text, yo.full_name, 'ADMIN',
    jsonb_build_array(jsonb_build_object('field', 'superadmin', 'before', 'no', 'after', 'sí')),
    null,
    jsonb_build_object('email', destino.email, 'full_name', destino.full_name)
  );

  return json_build_object('ok', true, 'full_name', destino.full_name);
end;
$$;

revoke all on function public.nombrar_superadmin(uuid) from public, anon;
grant execute on function public.nombrar_superadmin(uuid) to authenticated;

commit;

-- =============================================================================
-- VERIFICACIÓN
--
--   select full_name, email from public.profiles where is_superadmin;
--
--   -- Con sesión de un ADMIN que no es superadmin debe FALLAR con 42501:
--   select public.nombrar_superadmin('<otro>');
--   update public.profiles set is_superadmin = true where id = '<otro>';
--
--   -- Quitar la marca (sólo aquí, en el editor SQL):
--   update public.profiles set is_superadmin = false where id = '<id>';
--
-- ROLLBACK
--
--   begin;
--   drop function if exists public.nombrar_superadmin(uuid);
--   -- volver a correr 20261008030000_baja_usuarios.sql (guardia anterior)
--   commit;
-- =============================================================================
