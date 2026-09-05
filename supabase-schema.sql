
create table if not exists public.listens (
  user_id uuid not null references auth.users(id) on delete cascade,
  album_id text not null,
  rating numeric(3,1) check (rating >= 0 and rating <= 10),
  favorite_track text,
  comment text,
  headphone_used text,
  favorite boolean not null default false,
  listened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, album_id)
);

alter table public.listens enable row level security;

drop policy if exists "read own listens" on public.listens;
create policy "read own listens" on public.listens
for select using (auth.uid() = user_id);

drop policy if exists "insert own listens" on public.listens;
create policy "insert own listens" on public.listens
for insert with check (auth.uid() = user_id);

drop policy if exists "update own listens" on public.listens;
create policy "update own listens" on public.listens
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete own listens" on public.listens;
create policy "delete own listens" on public.listens
for delete using (auth.uid() = user_id);
