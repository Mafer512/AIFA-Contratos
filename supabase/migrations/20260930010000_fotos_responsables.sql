-- =============================================================================
-- Almacén de fotografías del personal
--
-- QUÉ RESUELVE
-- Hasta ahora la única forma de ponerle foto a alguien era copiar el archivo a
-- public/images/responsables/ y volver a desplegar el sitio. El área no puede
-- hacer eso, así que las altas se quedaban sin fotografía indefinidamente.
-- Con este bucket la sube quien da de alta a la persona, desde la aplicación.
--
-- POR QUÉ EL BUCKET ES PÚBLICO
-- Estas fotos ya se servían desde public/images/, que es tan público como esto:
-- no cambia quién las puede ver. A cambio, una URL pública se puede poner
-- directo en un <img> sin renovar enlaces firmados cada hora, que es lo que
-- haría falta con un bucket privado y catorce fotos en pantalla.
--
-- SUBIR SÍ ESTÁ RESTRINGIDO: sólo ADMIN y OPERATOR, el mismo criterio que para
-- editar la plantilla.
--
-- LAS FOTOS VIEJAS NO SE TOCAN
-- Siguen siendo rutas /images/... servidas por el propio sitio y funcionan
-- igual. No hay que migrarlas; conviven sin problema.
--
-- IDEMPOTENTE: se puede correr más de una vez.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1) El bucket
--
-- file_size_limit en 2 MB: el navegador ya redimensiona a 512 px antes de
-- subir, así que una foto normal ronda los 100 KB. El límite es una red por si
-- alguien sube por otra vía, no el tamaño esperado.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'responsables',
  'responsables',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public             = true,
  file_size_limit    = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- -----------------------------------------------------------------------------
-- 2) Quién puede hacer qué
--
-- Las políticas van sobre storage.objects, acotadas a este bucket para no
-- tocar ningún otro almacén del proyecto.
-- -----------------------------------------------------------------------------
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

-- Ver: cualquiera. Es lo que hace que <img src="..."> funcione sin sesión, y
-- es también lo que ya ocurría con las fotos servidas desde el sitio.
drop policy if exists fotos_responsables_ver on storage.objects;
create policy fotos_responsables_ver
  on storage.objects for select
  using (bucket_id = 'responsables');

-- Subir: sólo quien puede mantener la plantilla.
drop policy if exists fotos_responsables_subir on storage.objects;
create policy fotos_responsables_subir
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'responsables'
    and public.current_app_role() in ('ADMIN', 'OPERATOR')
  );

-- Reemplazar.
drop policy if exists fotos_responsables_actualizar on storage.objects;
create policy fotos_responsables_actualizar
  on storage.objects for update to authenticated
  using (
    bucket_id = 'responsables'
    and public.current_app_role() in ('ADMIN', 'OPERATOR')
  )
  with check (
    bucket_id = 'responsables'
    and public.current_app_role() in ('ADMIN', 'OPERATOR')
  );

-- Borrar: al cambiar una foto, la anterior se retira para no dejar basura.
drop policy if exists fotos_responsables_borrar on storage.objects;
create policy fotos_responsables_borrar
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'responsables'
    and public.current_app_role() in ('ADMIN', 'OPERATOR')
  );

commit;

-- =============================================================================
-- VERIFICACIÓN
--
--   select id, public, file_size_limit from storage.buckets where id = 'responsables';
--
--   select policyname from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname like 'fotos_responsables%';
--   -- deben salir las cuatro
--
-- ROLLBACK
--
--   begin;
--   drop policy if exists fotos_responsables_ver         on storage.objects;
--   drop policy if exists fotos_responsables_subir       on storage.objects;
--   drop policy if exists fotos_responsables_actualizar  on storage.objects;
--   drop policy if exists fotos_responsables_borrar      on storage.objects;
--   -- Vaciar el bucket antes de poder borrarlo:
--   delete from storage.objects where bucket_id = 'responsables';
--   delete from storage.buckets where id = 'responsables';
--   commit;
-- =============================================================================
