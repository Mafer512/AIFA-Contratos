-- =============================================================================
-- Foto de cada usuario
--
-- QUÉ ES
-- profiles.photo_url: la foto con la que se reconoce a la persona en Accesos
-- (lista de usuarios y bitácora) y en el encabezado de su propia sesión.
--
-- DE DÓNDE SALE
-- La primera vez se copió de su ficha del organigrama (tabla responsables),
-- emparejando por nombre con utils/coincidenciaNombres.ts. Después se cambia
-- desde Accesos → Usuarios. Es una copia a propósito: cambiar la foto de la
-- cuenta no toca la del organigrama, que tiene su propio editor.
--
-- QUIÉN LA CAMBIA
-- Un ADMIN, igual que el rol y los servicios (profiles_admin_update). La del
-- superadmin, sólo él (lo exige profiles_guard).
--
-- QUÉ ACEPTA
-- Sólo fotos del propio sitio (/images/responsables/…) o del almacén de fotos
-- de este proyecto. Sin la restricción, un admin podría apuntar la foto de
-- alguien a cualquier servidor de internet, que se enteraría de quién abre la
-- pantalla y cuándo.
--
-- IDEMPOTENTE: se puede correr más de una vez.
-- =============================================================================

begin;

alter table public.profiles
  add column if not exists photo_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.profiles'::regclass
       and conname  = 'profiles_photo_url_check'
  ) then
    alter table public.profiles
      add constraint profiles_photo_url_check check (
        photo_url is null
        or photo_url ~ '^/images/responsables/[A-Za-z0-9._-]+$'
        or photo_url ~ '^https://hvabkxgxmthyqbgsjqgr\.supabase\.co/storage/v1/object/public/responsables/[A-Za-z0-9._-]+$'
      );
  end if;
end $$;

commit;

-- =============================================================================
-- VERIFICACIÓN
--
--   select full_name, photo_url from public.profiles order by full_name;
--
--   -- Debe FALLAR (23514):
--   update public.profiles set photo_url = 'https://otro-sitio.com/x.jpg' where false;
--
-- ROLLBACK
--
--   alter table public.profiles drop constraint if exists profiles_photo_url_check;
--   alter table public.profiles drop column if exists photo_url;
-- =============================================================================
