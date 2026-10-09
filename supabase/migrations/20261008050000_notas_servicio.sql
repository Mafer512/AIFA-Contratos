-- =============================================================================
-- Notas de los servicios (se ven en el Diagrama de Gantt y en la ficha)
--
-- QUÉ ES
-- Una bitácora corta por servicio: "Se reprogramó el fallo", "DEFENSA pidió
-- otra versión del anexo", "Acuerdo con el área: publicar el lunes". Cada nota
-- lleva la FECHA a la que se refiere —ahí aparece su marcador en el Gantt—, un
-- TIPO (nota, alerta o acuerdo) y quién la escribió.
--
-- CÓMO SE LIGA AL SERVICIO
-- Por (anio, servicio_id), donde servicio_id es la columna "ID" de
-- estatus_<anio>. No hay llave foránea porque cada año vive en su propia
-- tabla; por eso se guarda también el nombre del servicio: la nota se puede
-- leer aunque el servicio cambie de nombre o se borre.
--
-- QUIÉN PUEDE QUÉ
--   · Ver: cualquiera con sesión y perfil vigente (quien ve el Gantt).
--   · Escribir: ADMIN y OPERATOR, los mismos que capturan el estatus.
--   · Corregir o borrar: quien la escribió, o un ADMIN.
-- El autor lo pone la base, no el navegador: nadie puede firmar una nota con
-- el nombre de otro.
--
-- IDEMPOTENTE: se puede correr más de una vez.
-- =============================================================================

begin;

create table if not exists public.notas_servicio (
  id              bigint generated always as identity primary key,
  anio            smallint not null,
  servicio_id     integer  not null,
  servicio_nombre text,
  fecha           date     not null default current_date,
  tipo            text     not null default 'nota',
  texto           text     not null,
  autor_id        uuid     not null default auth.uid(),
  autor_nombre    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notas_servicio_tipo_check') then
    alter table public.notas_servicio
      add constraint notas_servicio_tipo_check check (tipo in ('nota', 'alerta', 'acuerdo'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notas_servicio_texto_check') then
    alter table public.notas_servicio
      add constraint notas_servicio_texto_check check (char_length(btrim(texto)) between 1 and 1000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notas_servicio_anio_check') then
    alter table public.notas_servicio
      add constraint notas_servicio_anio_check check (anio between 2024 and 2040);
  end if;
end $$;

-- La pantalla siempre pide "las notas de este año", y la ficha "las de este
-- servicio".
create index if not exists notas_servicio_servicio_idx
  on public.notas_servicio (anio, servicio_id, fecha desc);

-- ── Autor y fechas los pone la base ──────────────────────────────────────────
create or replace function public.notas_servicio_firmar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    -- Con sesión, el autor es quien llama, diga lo que diga el navegador.
    if auth.uid() is not null then
      new.autor_id := auth.uid();
    end if;
    select p.full_name into new.autor_nombre from public.profiles p where p.id = new.autor_id;
    new.created_at := now();
  else
    -- Corregir una nota no la cambia de dueño ni de servicio.
    new.autor_id := old.autor_id;
    new.autor_nombre := old.autor_nombre;
    new.anio := old.anio;
    new.servicio_id := old.servicio_id;
    new.created_at := old.created_at;
  end if;
  new.texto := btrim(new.texto);
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.notas_servicio_firmar() from public, anon, authenticated;

drop trigger if exists notas_servicio_firmar_trg on public.notas_servicio;
create trigger notas_servicio_firmar_trg
  before insert or update on public.notas_servicio
  for each row execute function public.notas_servicio_firmar();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.notas_servicio enable row level security;

revoke all on public.notas_servicio from anon, public;
grant select, insert, update, delete on public.notas_servicio to authenticated;

-- current_app_role() ya ignora a los dados de baja (20261008030000).
drop policy if exists notas_servicio_select on public.notas_servicio;
create policy notas_servicio_select
  on public.notas_servicio for select to authenticated
  using (public.current_app_role() is not null);

drop policy if exists notas_servicio_insert on public.notas_servicio;
create policy notas_servicio_insert
  on public.notas_servicio for insert to authenticated
  with check (public.current_app_role() in ('ADMIN', 'OPERATOR'));

drop policy if exists notas_servicio_update on public.notas_servicio;
create policy notas_servicio_update
  on public.notas_servicio for update to authenticated
  using (
    public.current_app_role() = 'ADMIN'
    or (autor_id = auth.uid() and public.current_app_role() = 'OPERATOR')
  )
  with check (
    public.current_app_role() = 'ADMIN'
    or (autor_id = auth.uid() and public.current_app_role() = 'OPERATOR')
  );

drop policy if exists notas_servicio_delete on public.notas_servicio;
create policy notas_servicio_delete
  on public.notas_servicio for delete to authenticated
  using (
    public.current_app_role() = 'ADMIN'
    or (autor_id = auth.uid() and public.current_app_role() = 'OPERATOR')
  );

commit;

-- =============================================================================
-- VERIFICACIÓN
--
--   select anio, servicio_id, fecha, tipo, autor_nombre, left(texto, 60)
--     from public.notas_servicio order by created_at desc limit 20;
--
-- ROLLBACK
--
--   drop table if exists public.notas_servicio;
--   drop function if exists public.notas_servicio_firmar();
-- =============================================================================
