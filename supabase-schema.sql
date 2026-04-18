-- Run this in your Supabase SQL editor (supabase.com → project → SQL editor)

create table if not exists voices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  hex text not null,
  color_name text not null,
  poem text not null,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table voices enable row level security;

-- Anyone can read all voices (for the shared map)
create policy "public read"
  on voices for select
  using (true);

-- Anyone can insert (no login required to save a voice)
create policy "public insert"
  on voices for insert
  with check (true);

-- Only the owner can delete their own voice
create policy "own delete"
  on voices for delete
  using (auth.uid() = user_id);
