-- Crea la tabla de historial que respalda la pestaña "Historial" del dashboard.
create table if not exists public.change_history (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  changed_by text,
  changed_by_name text,
  changed_by_role text,
  changes jsonb,
  previous_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists change_history_created_at_idx on public.change_history (created_at desc);
create index if not exists change_history_table_idx on public.change_history (table_name);
