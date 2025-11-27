-- Create feedback_messages table to store dashboard suggestions
create table if not exists public.feedback_messages (
  id bigserial primary key,
  name text,
  email text not null,
  phone text,
  message text not null,
  source text,
  target_email text not null,
  target_phone text,
  created_at timestamptz not null default now()
);

create index if not exists feedback_messages_created_at_idx
  on public.feedback_messages (created_at desc);

create index if not exists feedback_messages_email_idx
  on public.feedback_messages (lower(email));

alter table public.feedback_messages enable row level security;

drop policy if exists "Allow inserts from authenticated users" on public.feedback_messages;
create policy "Allow inserts from authenticated users"
  on public.feedback_messages
  for insert
  to authenticated
  with check (true);

drop policy if exists "Allow select for admins" on public.feedback_messages;
create policy "Allow select for admins"
  on public.feedback_messages
  for select
  to authenticated
  using (auth.role() = 'admin');
