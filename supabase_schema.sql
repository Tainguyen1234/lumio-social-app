-- Chạy trong Supabase SQL Editor. Dùng anon/publishable key ở client, KHÔNG dùng service_role.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Lumio Member',
  bio text default '',
  country text default '',
  interests text default '',
  mood text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Profiles are viewable by authenticated users" on public.profiles for select to authenticated using (true);
create policy "Users insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create table if not exists public.likes (
  id bigint generated always as identity primary key,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(from_user,to_user), check(from_user <> to_user)
);
alter table public.likes enable row level security;
create policy "Users can see likes they sent or received" on public.likes for select to authenticated using (auth.uid() = from_user or auth.uid() = to_user);
create policy "Users can send likes" on public.likes for insert to authenticated with check (auth.uid() = from_user);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
create policy "Participants can read messages" on public.messages for select to authenticated using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "Sender can create message" on public.messages for insert to authenticated with check (auth.uid() = sender_id);
