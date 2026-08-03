alter table if exists public.estatus_servicios_2026
  add column if not exists convenio_modificatorio boolean not null default false;

alter table if exists public.estatus_2026
  add column if not exists convenio_modificatorio boolean not null default false;
