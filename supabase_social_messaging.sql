-- LUMIO: mutual matches + private chat security
-- Run once in Supabase Dashboard > SQL Editor > New query.

create table if not exists public.matches (
  id bigint generated always as identity primary key,
  user1 uuid not null references auth.users(id) on delete cascade,
  user2 uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint matches_distinct_users check (user1 < user2),
  constraint matches_unique_pair unique (user1,user2)
);
alter table public.matches enable row level security;

drop policy if exists "Users can read their matches" on public.matches;
create policy "Users can read their matches" on public.matches
for select to authenticated using (auth.uid() = user1 or auth.uid() = user2);

create or replace function public.lumio_create_match_on_mutual_like()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if exists (
    select 1 from public.likes
    where from_user = new.to_user and to_user = new.from_user
  ) then
    insert into public.matches(user1,user2)
    values (least(new.from_user,new.to_user),greatest(new.from_user,new.to_user))
    on conflict (user1,user2) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists lumio_mutual_like_match on public.likes;
create trigger lumio_mutual_like_match
after insert on public.likes
for each row execute function public.lumio_create_match_on_mutual_like();

-- A match participant may read messages only within their matched pair.
drop policy if exists "Participants can read messages" on public.messages;
create policy "Matched users can read messages" on public.messages
for select to authenticated using (
  exists (
    select 1 from public.matches m
    where (m.user1 = auth.uid() and m.user2 = messages.receiver_id and messages.sender_id = auth.uid())
       or (m.user2 = auth.uid() and m.user1 = messages.receiver_id and messages.sender_id = auth.uid())
       or (m.user1 = auth.uid() and m.user2 = messages.sender_id and messages.receiver_id = auth.uid())
       or (m.user2 = auth.uid() and m.user1 = messages.sender_id and messages.receiver_id = auth.uid())
  )
);

drop policy if exists "Sender can create message" on public.messages;
create policy "Only matched users can send messages" on public.messages
for insert to authenticated with check (
  auth.uid() = sender_id and sender_id <> receiver_id and exists (
    select 1 from public.matches m
    where (m.user1 = sender_id and m.user2 = receiver_id)
       or (m.user1 = receiver_id and m.user2 = sender_id)
  )
);

-- Enable Realtime for messages, without failing if already added.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
