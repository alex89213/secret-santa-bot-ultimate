-- Description:  Full database schema for Secret Santa Bot Ultimate: tables, row-level security,
--               private helpers and the service-only functions the server calls.
-- Author:       Alex Wu
-- Dependencies: Supabase Auth (auth.users, auth.identities, auth.uid())
-- Usage:        npx supabase db push

-- ---------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------

-- private schema for draw candidates, audit records, rate limits and helper functions
create schema ssbu_private;
revoke all on schema ssbu_private from public, anon, authenticated;
grant usage on schema ssbu_private to authenticated, service_role;

create table public.ssbu_profiles (
  id uuid primary key references auth.users(id),
  discord_id text not null unique check (discord_id ~ '^[1-9][0-9]{16,19}$'),
  display_name text not null check (length(display_name) between 1 and 100),
  created_at timestamptz not null default now()
);

-- one row at most: the site owner
create table public.ssbu_instance_roles (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references public.ssbu_profiles(id),
  role text not null default 'owner' check (role = 'owner'),
  created_at timestamptz not null default now()
);

-- one group per Discord server
create table public.ssbu_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  guild_id text not null unique check (guild_id ~ '^[1-9][0-9]{16,19}$'),
  created_by uuid not null references public.ssbu_profiles(id),
  revision integer not null default 0,
  created_at timestamptz not null default now()
);
create index ssbu_groups_creator_idx on public.ssbu_groups(created_by);

-- past_only people only appear in imported history: no access, no new draws, no DMs
create table public.ssbu_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.ssbu_groups(id),
  discord_id text check (discord_id ~ '^[1-9][0-9]{16,19}$'),
  display_name text not null check (length(display_name) between 1 and 100),
  role text not null default 'member' check (role in ('admin', 'member')),
  active boolean not null default true,
  past_only boolean not null default false,
  created_at timestamptz not null default now(),
  unique (group_id, discord_id),
  unique (id, group_id),
  check (discord_id is not null or past_only),
  check (not (past_only and active))
);
create index ssbu_members_discord_idx on public.ssbu_group_members(discord_id, group_id) where active;

-- sequence orders exchanges within a group, so past years can be placed between others
create table public.ssbu_exchanges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.ssbu_groups(id),
  name text not null check (length(name) between 1 and 100),
  budget numeric(12, 2) check (budget between 0 and 99999999),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft' check (status in ('draft', 'finalized', 'completed')),
  historical boolean not null default false,
  history_complete boolean not null default false,
  mode text not null default 'strict' check (mode in ('strict', 'recent', 'minimize')),
  recent_count integer not null default 1 check (recent_count between 1 and 100),
  revision integer not null default 0,
  sequence numeric not null,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, group_id)
);
create index ssbu_exchanges_sequence_idx on public.ssbu_exchanges(group_id, sequence);

create table public.ssbu_exchange_participants (
  exchange_id uuid not null,
  group_id uuid not null,
  member_id uuid not null,
  primary key (exchange_id, member_id),
  unique (exchange_id, member_id, group_id),
  foreign key (exchange_id, group_id) references public.ssbu_exchanges(id, group_id),
  foreign key (member_id, group_id) references public.ssbu_group_members(id, group_id)
);
create index ssbu_participants_member_idx on public.ssbu_exchange_participants(member_id, group_id);

-- locked-in matches of live exchanges
create table public.ssbu_assignments (
  exchange_id uuid not null,
  group_id uuid not null,
  giver uuid not null,
  recipient uuid not null,
  primary key (exchange_id, giver),
  unique (exchange_id, recipient),
  check (giver <> recipient),
  foreign key (exchange_id, giver, group_id)
    references public.ssbu_exchange_participants(exchange_id, member_id, group_id),
  foreign key (exchange_id, recipient, group_id)
    references public.ssbu_exchange_participants(exchange_id, member_id, group_id)
);
create index ssbu_assignments_group_idx on public.ssbu_assignments(group_id);

-- known matches of imported past years
create table public.ssbu_historical_assignments (
  exchange_id uuid not null,
  group_id uuid not null,
  giver uuid not null,
  recipient uuid not null,
  primary key (exchange_id, giver),
  unique (exchange_id, recipient),
  check (giver <> recipient),
  foreign key (exchange_id, group_id) references public.ssbu_exchanges(id, group_id),
  foreign key (giver, group_id) references public.ssbu_group_members(id, group_id),
  foreign key (recipient, group_id) references public.ssbu_group_members(id, group_id)
);
create index ssbu_history_group_idx on public.ssbu_historical_assignments(group_id);
create index ssbu_history_giver_idx on public.ssbu_historical_assignments(giver, group_id);
create index ssbu_history_recipient_idx on public.ssbu_historical_assignments(recipient, group_id);

-- wishlists belong to a Discord account and are shared across every group
create table public.ssbu_wishlist_items (
  id uuid primary key default gen_random_uuid(),
  discord_id text not null check (discord_id ~ '^[1-9][0-9]{16,19}$'),
  title text not null check (length(title) between 1 and 120),
  description text not null default '' check (length(description) <= 2000),
  url text check (length(url) <= 2048 and url ~ '^https?://'),
  price numeric(12, 2) check (price between 0 and 99999999),
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ssbu_wishlist_position_idx on public.ssbu_wishlist_items(discord_id, position);

-- validation summary of the current draft draw, never the matches themselves
create table public.ssbu_draw_reports (
  exchange_id uuid primary key references public.ssbu_exchanges(id),
  report jsonb not null,
  optimal boolean not null,
  created_at timestamptz not null default now()
);

create table ssbu_private.candidates (
  exchange_id uuid primary key references public.ssbu_exchanges(id),
  pairs jsonb not null,
  revision integer not null,
  group_revision integer not null,
  created_at timestamptz not null default now()
);

create table ssbu_private.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  attempts integer not null
);

-- the version of a past year from before each correction
create table ssbu_private.history_audit (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null references public.ssbu_exchanges(id),
  changed_by uuid not null references auth.users(id),
  previous_exchange jsonb not null,
  previous_pairs jsonb not null,
  previous_roster jsonb not null,
  created_at timestamptz not null default now()
);
create index ssbu_history_audit_exchange_idx on ssbu_private.history_audit(exchange_id, created_at);
create index ssbu_history_audit_actor_idx on ssbu_private.history_audit(changed_by);

-- one DM per giver per exchange, claimed with a lease while it is being sent
create table public.ssbu_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  exchange_id uuid not null,
  giver uuid not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  lease_id uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  message_id text,
  error_code text,
  channel_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (exchange_id, giver),
  foreign key (exchange_id, giver) references public.ssbu_assignments(exchange_id, giver)
);
create index ssbu_delivery_queue_idx on public.ssbu_notification_deliveries(next_attempt_at)
  where status in ('pending', 'sending');

-- ---------------------------------------------------------------------------------------------
-- Identity and permission checks
-- ---------------------------------------------------------------------------------------------

-- the Discord ID comes from auth.identities, never from user-editable metadata
create function ssbu_private.discord_id(uid uuid) returns text
language sql stable security definer set search_path = '' as $$
  select provider_id from auth.identities where user_id = uid and provider = 'discord' limit 1
$$;

create function ssbu_private.is_owner(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ssbu_instance_roles where user_id = uid)
    and ssbu_private.discord_id(uid) is not null
$$;

create function ssbu_private.is_member(gid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select ssbu_private.is_owner(uid) or exists (
    select 1 from public.ssbu_group_members
    where group_id = gid and discord_id = ssbu_private.discord_id(uid) and active)
$$;

create function ssbu_private.is_admin(gid uuid, uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select ssbu_private.is_owner(uid) or exists (
    select 1 from public.ssbu_group_members
    where group_id = gid and discord_id = ssbu_private.discord_id(uid) and active and role = 'admin')
$$;

-- people can read their own wishlist and the wishlist of whoever they are giving to
create function ssbu_private.can_read_wishlist(did text, uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (did = ssbu_private.discord_id(uid) and (ssbu_private.is_owner(uid)
      or exists (select 1 from public.ssbu_group_members where discord_id = did and active)))
    or exists (
      select 1 from public.ssbu_assignments a
      join public.ssbu_exchanges e on e.id = a.exchange_id
      join public.ssbu_group_members g on g.id = a.giver
      join public.ssbu_group_members r on r.id = a.recipient
      where g.discord_id = ssbu_private.discord_id(uid) and g.active and r.discord_id = did
        and e.status in ('finalized', 'completed') and ssbu_private.is_member(e.group_id, uid))
$$;

create function ssbu_private.require_actor(actor uuid) returns text
language plpgsql stable set search_path = '' as $$
declare did text;
begin
  did := ssbu_private.discord_id(actor);
  if did is null then raise exception 'Discord authentication required' using errcode = '42501'; end if;
  return did;
end $$;

create function ssbu_private.require_owner(actor uuid) returns text
language plpgsql stable set search_path = '' as $$
declare did text;
begin
  did := ssbu_private.require_actor(actor);
  if not ssbu_private.is_owner(actor) then
    raise exception 'Instance owner access required' using errcode = '42501';
  end if;
  return did;
end $$;

create function ssbu_private.require_member(gid uuid, actor uuid) returns text
language plpgsql stable set search_path = '' as $$
declare did text;
begin
  did := ssbu_private.require_actor(actor);
  if gid is null or not ssbu_private.is_member(gid, actor) then
    raise exception 'Group access denied' using errcode = '42501';
  end if;
  return did;
end $$;

create function ssbu_private.require_admin(gid uuid, actor uuid) returns text
language plpgsql stable set search_path = '' as $$
declare did text;
begin
  did := ssbu_private.require_actor(actor);
  if gid is null or not ssbu_private.is_admin(gid, actor) then
    raise exception 'Group administrator access required' using errcode = '42501';
  end if;
  return did;
end $$;

-- the group always comes from the stored exchange, never from a second client value
create function ssbu_private.exchange_group(eid uuid) returns uuid
language plpgsql stable set search_path = '' as $$
declare gid uuid;
begin
  select group_id into gid from public.ssbu_exchanges where id = eid;
  if gid is null then raise exception 'Exchange unavailable' using errcode = '42501'; end if;
  return gid;
end $$;

-- wishlists are open to the owner and anyone active in at least one group
create function ssbu_private.require_wishlist_owner(actor uuid) returns text
language plpgsql stable set search_path = '' as $$
declare did text;
begin
  did := ssbu_private.require_actor(actor);
  if not ssbu_private.is_owner(actor)
     and not exists (select 1 from public.ssbu_group_members where discord_id = did and active) then
    raise exception 'Group membership required' using errcode = '42501';
  end if;
  return did;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------------------------

create function ssbu_private.wishlist_items(did text) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(w) - 'discord_id' order by w.position, w.created_at, w.id), '[]'::jsonb)
  from public.ssbu_wishlist_items w where w.discord_id = did
$$;

-- ordering key for a past year placed right after `after_id`, or first when it is null
create function ssbu_private.sequence_after(gid uuid, after_id uuid) returns numeric
language plpgsql stable set search_path = '' as $$
declare a numeric; nxt numeric;
begin
  if after_id is null then
    select min(sequence) into nxt from public.ssbu_exchanges where group_id = gid;
    return coalesce(nxt - 1, 1);
  end if;
  select sequence into a from public.ssbu_exchanges where id = after_id and group_id = gid;
  if a is null then raise exception 'Choose an exchange from this server'; end if;
  select min(sequence) into nxt from public.ssbu_exchanges where group_id = gid and sequence > a;
  return case when nxt is null then a + 1 else (a + nxt) / 2 end;
end $$;

-- counts how a set of matches compares to the exchange's participants, without revealing them
create function ssbu_private.validate_pairs(eid uuid, pairs jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare n int; ac int; dc int; rc int; bad int; self_count int; reached int; repeats int; start_id uuid;
begin
  select count(*), min(member_id::text)::uuid into n, start_id
    from public.ssbu_exchange_participants where exchange_id = eid;
  select count(*), count(distinct x.giver), count(distinct x.recipient),
      count(*) filter (where x.giver = x.recipient),
      count(*) filter (where not exists (select 1 from public.ssbu_exchange_participants p
          where p.exchange_id = eid and p.member_id = x.giver::uuid)
        or not exists (select 1 from public.ssbu_exchange_participants p
          where p.exchange_id = eid and p.member_id = x.recipient::uuid))
    into ac, dc, rc, self_count, bad
    from jsonb_to_recordset(pairs) x(giver text, recipient text);
  -- follow the matches from one person and count how many people the loop reaches
  with recursive chain(id) as (
    select start_id
    union
    select x.recipient::uuid from chain c
    join jsonb_to_recordset(pairs) x(giver text, recipient text) on x.giver::uuid = c.id
  ) select count(*) into reached from chain;
  select count(*) into repeats from jsonb_to_recordset(pairs) x(giver text, recipient text)
  where exists (select 1 from public.ssbu_exchanges e
      join public.ssbu_historical_assignments h on h.group_id = e.group_id
      where e.id = eid and h.exchange_id <> eid and h.giver = x.giver::uuid and h.recipient = x.recipient::uuid)
    or exists (select 1 from public.ssbu_exchanges e
      join public.ssbu_assignments h on h.group_id = e.group_id
      where e.id = eid and h.exchange_id <> eid and h.giver = x.giver::uuid and h.recipient = x.recipient::uuid);
  return jsonb_build_object(
    'participantCount', n,
    'assignmentCount', ac,
    'cycles', case when reached = n and ac = n and dc = n and rc = n then 1 else 0 end,
    'historicalRepeats', repeats,
    'selfAssignments', self_count,
    'missingAssignments', greatest(n - least(dc, rc), 0),
    'duplicateGivers', ac - dc,
    'duplicateRecipients', ac - rc,
    'unknownParticipants', bad,
    'valid', n >= 2 and ac = n and dc = n and rc = n and bad = 0 and self_count = 0 and reached = n);
end $$;

-- counts matches that break the exchange's repeat rule (never repeat, or avoid the last N)
create function ssbu_private.hard_repeats(eid uuid, pairs jsonb) returns integer
language sql stable set search_path = '' as $$
  with target as (select * from public.ssbu_exchanges where id = eid),
  history as (
    select h.exchange_id, h.group_id, h.giver, h.recipient from public.ssbu_historical_assignments h
    union all
    select a.exchange_id, a.group_id, a.giver, a.recipient from public.ssbu_assignments a
  ), previous as (
    select x.id, dense_rank() over (order by x.sequence desc, x.id desc) as recency
    from public.ssbu_exchanges x, target t
    where x.group_id = t.group_id and x.id <> eid and exists (select 1 from history h where h.exchange_id = x.id)
  )
  select count(*)::integer from jsonb_to_recordset(pairs) p(giver text, recipient text), target t
  where t.mode <> 'minimize' and exists (
    select 1 from history h join previous x on x.id = h.exchange_id
    where h.group_id = t.group_id and h.giver = p.giver::uuid and h.recipient = p.recipient::uuid
      and (t.mode = 'strict' or x.recency <= t.recent_count))
$$;

-- writes a past year's people and known matches, then records whether it is one full circle
create function ssbu_private.write_history(eid uuid, gid uuid, members jsonb, pairs jsonb) returns boolean
language plpgsql set search_path = '' as $$
declare n int; rep jsonb; stored jsonb;
begin
  if jsonb_typeof(members) <> 'array' or jsonb_typeof(pairs) <> 'array' then raise exception 'Invalid past year'; end if;
  n := jsonb_array_length(members);
  if n < 2 then raise exception 'A past year needs at least two people'; end if;
  if (select count(distinct value) from jsonb_array_elements_text(members)) <> n then
    raise exception 'Each person can only be listed once';
  end if;
  if jsonb_array_length(pairs) < 1 then raise exception 'Add at least one known match'; end if;

  insert into public.ssbu_exchange_participants(exchange_id, group_id, member_id)
    select eid, gid, m.id
    from jsonb_array_elements_text(members) ids(id)
    join public.ssbu_group_members m on m.id = ids.id::uuid and m.group_id = gid;
  if (select count(*) from public.ssbu_exchange_participants where exchange_id = eid) <> n then
    raise exception 'Everyone in a past year must be one of this server''s people';
  end if;

  -- check every match before saving any of them
  if exists (select 1 from jsonb_to_recordset(pairs) x(giver uuid, recipient uuid) where x.giver = x.recipient) then
    raise exception 'Nobody can give to themselves';
  end if;
  if exists (select 1 from jsonb_to_recordset(pairs) x(giver uuid, recipient uuid)
             where not (members ? x.giver::text) or not (members ? x.recipient::text)) then
    raise exception 'Every match must be between people in this year';
  end if;
  if exists (select 1 from jsonb_to_recordset(pairs) x(giver uuid, recipient uuid) group by x.giver having count(*) > 1)
     or exists (select 1 from jsonb_to_recordset(pairs) x(giver uuid, recipient uuid) group by x.recipient having count(*) > 1) then
    raise exception 'Each person can give once and receive once';
  end if;

  insert into public.ssbu_historical_assignments(exchange_id, group_id, giver, recipient)
    select eid, gid, x.giver, x.recipient from jsonb_to_recordset(pairs) x(giver uuid, recipient uuid);
  select coalesce(jsonb_agg(jsonb_build_object('giver', giver, 'recipient', recipient)), '[]'::jsonb)
    into stored from public.ssbu_historical_assignments where exchange_id = eid;
  rep := ssbu_private.validate_pairs(eid, stored);
  update public.ssbu_exchanges set history_complete = (rep->>'valid')::boolean where id = eid;
  return (rep->>'valid')::boolean;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------

-- browsers may read some rows directly, but every write goes through the server functions below
do $$
declare t text;
begin
  foreach t in array array['ssbu_profiles', 'ssbu_instance_roles', 'ssbu_groups', 'ssbu_group_members',
    'ssbu_exchanges', 'ssbu_exchange_participants', 'ssbu_assignments', 'ssbu_historical_assignments',
    'ssbu_wishlist_items', 'ssbu_draw_reports', 'ssbu_notification_deliveries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
alter table ssbu_private.candidates enable row level security;
alter table ssbu_private.rate_limits enable row level security;
alter table ssbu_private.history_audit enable row level security;
revoke all on ssbu_private.history_audit from public, anon, authenticated;

create policy ssbu_profiles_self on public.ssbu_profiles for select to authenticated
  using (id = (select auth.uid()));
create policy ssbu_roles_self on public.ssbu_instance_roles for select to authenticated
  using (user_id = (select auth.uid()));
create policy ssbu_groups_member on public.ssbu_groups for select to authenticated
  using (ssbu_private.is_member(id, (select auth.uid())));
create policy ssbu_members_group on public.ssbu_group_members for select to authenticated
  using (ssbu_private.is_member(group_id, (select auth.uid())));
create policy ssbu_exchanges_group on public.ssbu_exchanges for select to authenticated
  using (ssbu_private.is_member(group_id, (select auth.uid())));
create policy ssbu_participants_group on public.ssbu_exchange_participants for select to authenticated
  using (ssbu_private.is_member(group_id, (select auth.uid())));
-- a person sees only the match where they are the giver, once matches are locked in
create policy ssbu_assignments_own on public.ssbu_assignments for select to authenticated using (
  ssbu_private.is_member(group_id, (select auth.uid()))
  and exists (select 1 from public.ssbu_group_members m
    where m.id = giver and m.discord_id = ssbu_private.discord_id((select auth.uid())) and m.active)
  and exists (select 1 from public.ssbu_exchanges e where e.id = exchange_id and e.status in ('finalized', 'completed'))
);
-- past-year matches and draft candidates have no select policy, even for admins
create policy ssbu_wishlists_recipient on public.ssbu_wishlist_items for select to authenticated
  using (ssbu_private.can_read_wishlist(discord_id, (select auth.uid())));
create policy ssbu_reports_admin on public.ssbu_draw_reports for select to authenticated
  using (exists (select 1 from public.ssbu_exchanges e
    where e.id = exchange_id and ssbu_private.is_admin(e.group_id, (select auth.uid()))));
create policy ssbu_notifications_admin on public.ssbu_notification_deliveries for select to authenticated
  using (exists (select 1 from public.ssbu_exchanges e
    where e.id = exchange_id and ssbu_private.is_admin(e.group_id, (select auth.uid()))));

-- ---------------------------------------------------------------------------------------------
-- Operations called by the server as public.ssbu_<operation>(actor, payload)
-- every function checks the actor itself and is callable only by the service role
-- ---------------------------------------------------------------------------------------------

-- saves the cosmetic display name and returns the actor's groups and exchanges
create function public.ssbu_context(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare did text; name text;
begin
  did := ssbu_private.require_actor(actor);
  name := left(coalesce(nullif(payload->>'display_name', ''), 'Discord member'), 100);
  insert into public.ssbu_profiles(id, discord_id, display_name) values (actor, did, name)
    on conflict (id) do update set display_name = excluded.display_name
    where public.ssbu_profiles.display_name is distinct from excluded.display_name;
  return jsonb_build_object(
    'user', jsonb_build_object('id', actor, 'discord_id', did, 'display_name', name),
    'owner', ssbu_private.is_owner(actor),
    'setup_available', not exists (select 1 from public.ssbu_instance_roles),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'guild_id', g.guild_id, 'admin', ssbu_private.is_admin(g.id, actor),
        'member_count', (select count(*) from public.ssbu_group_members m where m.group_id = g.id and m.active),
        'exchanges', coalesce((select jsonb_agg(to_jsonb(x) order by x.sequence desc)
                               from public.ssbu_exchanges x where x.group_id = g.id), '[]'::jsonb))
        order by g.name)
      from public.ssbu_groups g where ssbu_private.is_member(g.id, actor)), '[]'::jsonb));
end $$;

-- allows five setup secret attempts per account every 15 minutes
create function public.ssbu_setup_attempt(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare rate ssbu_private.rate_limits;
begin
  perform ssbu_private.require_actor(actor);
  insert into ssbu_private.rate_limits(key, window_start, attempts) values ('setup:' || actor, now(), 1)
    on conflict (key) do update set
      attempts = case when ssbu_private.rate_limits.window_start < now() - interval '15 minutes'
        then 1 else ssbu_private.rate_limits.attempts + 1 end,
      window_start = case when ssbu_private.rate_limits.window_start < now() - interval '15 minutes'
        then now() else ssbu_private.rate_limits.window_start end
    returning * into rate;
  return jsonb_build_object('allowed', rate.attempts <= 5);
end $$;

-- the unique singleton row makes sure only the first claim succeeds
create function public.ssbu_claim_owner(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare changed int;
begin
  perform ssbu_private.require_actor(actor);
  insert into public.ssbu_instance_roles(user_id) values (actor) on conflict do nothing;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'Instance ownership has already been established'; end if;
  return '{"claimed":true}'::jsonb;
end $$;

create function public.ssbu_owner_check(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform ssbu_private.require_owner(actor);
  return '{"owner":true}'::jsonb;
end $$;

-- only the owner adds servers, since nothing here can prove someone else controls one
create function public.ssbu_activate_group(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare did text; gid uuid;
begin
  did := ssbu_private.require_owner(actor);
  insert into public.ssbu_groups(name, guild_id, created_by)
    values (payload->>'name', payload->>'guild_id', actor) returning id into gid;
  insert into public.ssbu_group_members(group_id, discord_id, display_name, role)
    values (gid, did, (select display_name from public.ssbu_profiles where id = actor), 'admin');
  return jsonb_build_object('id', gid);
end $$;

create function public.ssbu_wishlist(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return ssbu_private.wishlist_items(ssbu_private.require_wishlist_owner(actor));
end $$;

-- updates an item when payload has an id, otherwise adds a new item at the end of the list
create function public.ssbu_wishlist_save(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare did text; changed int;
begin
  did := ssbu_private.require_wishlist_owner(actor);
  if payload ? 'id' then
    update public.ssbu_wishlist_items set title = payload->>'title', description = coalesce(payload->>'description', ''),
      url = nullif(payload->>'url', ''), price = (payload->>'price')::numeric, updated_at = now()
      where id = (payload->>'id')::uuid and discord_id = did;
    get diagnostics changed = row_count;
    if changed <> 1 then raise exception 'Wishlist item not found' using errcode = '42501'; end if;
  else
    -- lock the person's profile so two adds can't take the same position
    perform 1 from public.ssbu_profiles where discord_id = did for update;
    if (select count(*) from public.ssbu_wishlist_items where discord_id = did) >= 100 then
      raise exception 'Wishlist limit reached';
    end if;
    insert into public.ssbu_wishlist_items(discord_id, title, description, url, price, position)
      values (did, payload->>'title', coalesce(payload->>'description', ''), nullif(payload->>'url', ''),
        (payload->>'price')::numeric,
        coalesce((select max(position) from public.ssbu_wishlist_items where discord_id = did), 0) + 1);
  end if;
  return ssbu_private.wishlist_items(did);
end $$;

create function public.ssbu_wishlist_delete(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare did text;
begin
  did := ssbu_private.require_wishlist_owner(actor);
  delete from public.ssbu_wishlist_items where id = (payload->>'id')::uuid and discord_id = did;
  return ssbu_private.wishlist_items(did);
end $$;

-- `ids` must list every one of the person's items exactly once, in the new order
create function public.ssbu_wishlist_reorder(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare did text; n int;
begin
  did := ssbu_private.require_wishlist_owner(actor);
  n := jsonb_array_length(payload->'ids');
  if n <> (select count(*) from public.ssbu_wishlist_items where discord_id = did)
     or n <> (select count(distinct value) from jsonb_array_elements_text(payload->'ids'))
     or exists (select 1 from jsonb_array_elements_text(payload->'ids') ids(id)
                where not exists (select 1 from public.ssbu_wishlist_items w where w.id = ids.id::uuid and w.discord_id = did)) then
    raise exception 'The wishlist changed. Refresh and try again';
  end if;
  update public.ssbu_wishlist_items w set position = o.place, updated_at = now()
    from jsonb_array_elements_text(payload->'ids') with ordinality o(id, place)
    where w.id = o.id::uuid and w.discord_id = did;
  return ssbu_private.wishlist_items(did);
end $$;

create function public.ssbu_group(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare gid uuid := (payload->>'group_id')::uuid;
begin
  perform ssbu_private.require_member(gid, actor);
  return (select jsonb_build_object(
    'group', to_jsonb(g),
    'admin', ssbu_private.is_admin(gid, actor),
    'members', coalesce((select jsonb_agg(to_jsonb(m) order by m.past_only, not m.active, lower(m.display_name))
                         from public.ssbu_group_members m where m.group_id = gid), '[]'::jsonb),
    'exchanges', coalesce((select jsonb_agg(to_jsonb(x) order by x.sequence desc)
                           from public.ssbu_exchanges x where x.group_id = gid), '[]'::jsonb))
    from public.ssbu_groups g where g.id = gid);
end $$;

-- returns one exchange with only the actor's own match, and draw details for admins
create function public.ssbu_exchange(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare eid uuid := (payload->>'exchange_id')::uuid; gid uuid; did text; e public.ssbu_exchanges;
  isadmin boolean; ownmid uuid; recipient jsonb;
begin
  gid := ssbu_private.exchange_group(eid);
  did := ssbu_private.require_member(gid, actor);
  select * into e from public.ssbu_exchanges where id = eid;
  isadmin := ssbu_private.is_admin(gid, actor);
  select p.member_id into ownmid from public.ssbu_exchange_participants p
    join public.ssbu_group_members m on m.id = p.member_id
    where p.exchange_id = eid and m.discord_id = did and m.active;
  select jsonb_build_object('id', r.id, 'display_name', r.display_name, 'wishlist', ssbu_private.wishlist_items(r.discord_id))
    into recipient
    from public.ssbu_assignments a join public.ssbu_group_members r on r.id = a.recipient
    where a.exchange_id = eid and a.giver = ownmid and e.status in ('finalized', 'completed');
  return jsonb_build_object(
    'exchange', to_jsonb(e),
    'group_name', (select name from public.ssbu_groups where id = gid),
    'admin', isadmin,
    'own_member_id', ownmid,
    'recipient', recipient,
    'participants', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'display_name', m.display_name,
        'discord_id', m.discord_id, 'past_only', m.past_only) order by lower(m.display_name))
      from public.ssbu_exchange_participants p join public.ssbu_group_members m on m.id = p.member_id
      where p.exchange_id = eid), '[]'::jsonb),
    'validation', case when isadmin then
      (select to_jsonb(r) - 'exchange_id' from public.ssbu_draw_reports r where r.exchange_id = eid) end,
    'candidate_available', isadmin and exists (select 1 from ssbu_private.candidates where exchange_id = eid),
    'deliveries', case when isadmin then coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'giver', d.giver,
        'status', d.status, 'attempts', d.attempts, 'error_code', d.error_code, 'sent_at', d.sent_at)
        order by d.created_at, d.id)
      from public.ssbu_notification_deliveries d where d.exchange_id = eid), '[]'::jsonb) else '[]'::jsonb end);
end $$;

-- adds, removes or restores a server member, and only the owner can change roles
create function public.ssbu_member_save(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare gid uuid := (payload->>'group_id')::uuid; isowner boolean;
begin
  perform ssbu_private.require_admin(gid, actor);
  isowner := ssbu_private.is_owner(actor);
  if payload ? 'role' and not isowner then
    raise exception 'Only the owner can appoint administrators' using errcode = '42501';
  end if;
  perform 1 from public.ssbu_groups where id = gid for update;
  insert into public.ssbu_group_members(group_id, discord_id, display_name, role, active)
    values (gid, payload->>'discord_id', payload->>'display_name', coalesce(payload->>'role', 'member'),
      coalesce((payload->>'active')::boolean, true))
    on conflict (group_id, discord_id) do update set
      display_name = excluded.display_name,
      active = excluded.active,
      -- a past-only person who joins the server becomes a regular member
      past_only = case when excluded.active then false else public.ssbu_group_members.past_only end,
      role = case when isowner and payload ? 'role' then excluded.role else public.ssbu_group_members.role end;
  return '{"saved":true}'::jsonb;
end $$;

-- adds someone who only appears in past years, reusing the record when the Discord ID is known
create function public.ssbu_past_member_add(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare gid uuid := (payload->>'group_id')::uuid; mid uuid; did text := nullif(payload->>'discord_id', '');
begin
  perform ssbu_private.require_admin(gid, actor);
  perform 1 from public.ssbu_groups where id = gid for update;
  if did is not null then
    select id into mid from public.ssbu_group_members where group_id = gid and discord_id = did;
    if mid is not null then return jsonb_build_object('id', mid, 'existing', true); end if;
  end if;
  insert into public.ssbu_group_members(group_id, discord_id, display_name, role, active, past_only)
    values (gid, did, payload->>'display_name', 'member', false, true) returning id into mid;
  return jsonb_build_object('id', mid, 'existing', false);
end $$;

-- new exchanges go last in the group's order
create function public.ssbu_exchange_create(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare gid uuid := (payload->>'group_id')::uuid; new_id uuid;
begin
  perform ssbu_private.require_admin(gid, actor);
  perform 1 from public.ssbu_groups where id = gid for update;
  insert into public.ssbu_exchanges(group_id, name, budget, currency, mode, recent_count, sequence)
    values (gid, payload->>'name', (payload->>'budget')::numeric, coalesce(payload->>'currency', 'USD'),
      coalesce(payload->>'mode', 'strict'), coalesce((payload->>'recent_count')::int, 1),
      coalesce((select max(sequence) from public.ssbu_exchanges where group_id = gid), 0) + 1)
    returning id into new_id;
  return jsonb_build_object('id', new_id);
end $$;

-- replaces a draft's people and clears any draw made for the old list
create function public.ssbu_participants_set(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare eid uuid := (payload->>'exchange_id')::uuid; gid uuid; e public.ssbu_exchanges;
begin
  gid := ssbu_private.exchange_group(eid);
  perform ssbu_private.require_admin(gid, actor);
  perform 1 from public.ssbu_groups where id = gid for update;
  select * into e from public.ssbu_exchanges where id = eid;
  if e.status <> 'draft' or e.historical then raise exception 'Only live draft exchanges can change participants'; end if;
  delete from public.ssbu_exchange_participants where exchange_id = eid;
  insert into public.ssbu_exchange_participants(exchange_id, group_id, member_id)
    select eid, gid, m.id from jsonb_array_elements_text(payload->'members') ids(id)
    join public.ssbu_group_members m on m.id = ids.id::uuid
    where m.group_id = gid and m.active and not m.past_only;
  if (select count(*) from public.ssbu_exchange_participants where exchange_id = eid) <> jsonb_array_length(payload->'members') then
    raise exception 'Invalid or duplicate participant selection';
  end if;
  update public.ssbu_exchanges set revision = revision + 1 where id = eid;
  delete from ssbu_private.candidates where exchange_id = eid;
  delete from public.ssbu_draw_reports where exchange_id = eid;
  return '{"saved":true}'::jsonb;
end $$;

create function public.ssbu_history_import(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare gid uuid := (payload->>'group_id')::uuid; after_id uuid := nullif(payload->>'after', '')::uuid;
  new_id uuid; complete boolean;
begin
  perform ssbu_private.require_admin(gid, actor);
  perform 1 from public.ssbu_groups where id = gid for update;
  insert into public.ssbu_exchanges(group_id, name, status, historical, sequence)
    values (gid, payload->>'name', 'completed', true, ssbu_private.sequence_after(gid, after_id))
    returning id into new_id;
  complete := ssbu_private.write_history(new_id, gid, payload->'members', payload->'pairs');
  -- bump the group revision so any unlocked draw has to be redone
  update public.ssbu_groups set revision = revision + 1 where id = gid;
  return jsonb_build_object('id', new_id, 'complete', complete);
end $$;

-- replaces a past year's people and matches, keeping the old version in the audit table
create function public.ssbu_history_correct(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare eid uuid := (payload->>'exchange_id')::uuid; gid uuid; e public.ssbu_exchanges; complete boolean;
begin
  gid := ssbu_private.exchange_group(eid);
  perform ssbu_private.require_admin(gid, actor);
  perform 1 from public.ssbu_groups where id = gid for update;
  select * into e from public.ssbu_exchanges where id = eid;
  if not e.historical or coalesce((payload->>'acknowledge')::boolean, false) <> true then
    raise exception 'Only imported history can be corrected after acknowledgment';
  end if;
  insert into ssbu_private.history_audit(exchange_id, changed_by, previous_exchange, previous_pairs, previous_roster)
    values (eid, actor, to_jsonb(e),
      coalesce((select jsonb_agg(to_jsonb(h)) from public.ssbu_historical_assignments h where exchange_id = eid), '[]'),
      coalesce((select jsonb_agg(member_id) from public.ssbu_exchange_participants where exchange_id = eid), '[]'));
  delete from public.ssbu_historical_assignments where exchange_id = eid;
  delete from public.ssbu_exchange_participants where exchange_id = eid;
  update public.ssbu_exchanges set name = payload->>'name', revision = revision + 1 where id = eid;
  complete := ssbu_private.write_history(eid, gid, payload->'members', payload->'pairs');
  update public.ssbu_groups set revision = revision + 1 where id = gid;
  return jsonb_build_object('id', eid, 'complete', complete);
end $$;

-- returns the people and past matches the solver needs, with each past exchange's order
create function public.ssbu_draw_context(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare eid uuid := (payload->>'exchange_id')::uuid; gid uuid; e public.ssbu_exchanges;
begin
  gid := ssbu_private.exchange_group(eid);
  perform ssbu_private.require_admin(gid, actor);
  select * into e from public.ssbu_exchanges where id = eid;
  if e.status <> 'draft' or e.historical then raise exception 'Only live drafts can be drawn'; end if;
  return jsonb_build_object(
    'exchange', to_jsonb(e),
    'group_revision', (select revision from public.ssbu_groups where id = gid),
    'participants', coalesce((select jsonb_agg(member_id order by member_id)
      from public.ssbu_exchange_participants where exchange_id = eid), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('giver', h.giver, 'recipient', h.recipient, 'exchange', h.exchange_id,
        'order', hx.history_order))
      from (select exchange_id, group_id, giver, recipient from public.ssbu_historical_assignments
            union all select exchange_id, group_id, giver, recipient from public.ssbu_assignments) h
      join (select id, dense_rank() over (order by sequence, id) as history_order
            from public.ssbu_exchanges where group_id = gid) hx on hx.id = h.exchange_id
      where h.group_id = gid and h.exchange_id <> eid), '[]'::jsonb));
end $$;

-- re-checks a solver result and stores it as the draft's private candidate
create function public.ssbu_candidate_save(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare eid uuid := (payload->>'exchange_id')::uuid; gid uuid; e public.ssbu_exchanges; g public.ssbu_groups; rep jsonb;
begin
  gid := ssbu_private.exchange_group(eid);
  perform ssbu_private.require_admin(gid, actor);
  select * into g from public.ssbu_groups where id = gid for update;
  select * into e from public.ssbu_exchanges where id = eid;
  -- reject a draw made before the people or the history changed
  if e.status <> 'draft' or e.revision <> (payload->>'revision')::int or g.revision <> (payload->>'group_revision')::int then
    raise exception 'Exchange or history changed. Generate again.';
  end if;
  rep := ssbu_private.validate_pairs(eid, payload->'pairs');
  if not (rep->>'valid')::boolean then raise exception 'Candidate failed database validation'; end if;
  if ssbu_private.hard_repeats(eid, payload->'pairs') > 0 then
    raise exception 'Candidate violates configured historical restrictions';
  end if;
  insert into ssbu_private.candidates(exchange_id, pairs, revision, group_revision)
    values (eid, payload->'pairs', e.revision, g.revision)
    on conflict (exchange_id) do update set pairs = excluded.pairs, revision = excluded.revision,
      group_revision = excluded.group_revision, created_at = now();
  insert into public.ssbu_draw_reports(exchange_id, report, optimal) values (eid, rep, (payload->>'optimal')::boolean)
    on conflict (exchange_id) do update set report = excluded.report, optimal = excluded.optimal, created_at = now();
  return jsonb_build_object('report', rep, 'optimal', (payload->>'optimal')::boolean);
end $$;

-- locks in exactly the candidate the admin reviewed, identified by its timestamp
create function public.ssbu_finalize_reviewed_draw(actor uuid, eid uuid, expected_candidate_at timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare gid uuid; e public.ssbu_exchanges; g public.ssbu_groups; c ssbu_private.candidates; rep jsonb;
begin
  gid := ssbu_private.exchange_group(eid);
  perform ssbu_private.require_admin(gid, actor);
  select * into g from public.ssbu_groups where id = gid for update;
  select * into e from public.ssbu_exchanges where id = eid;
  select * into c from ssbu_private.candidates where exchange_id = eid;
  if c.exchange_id is null or expected_candidate_at is null or c.created_at <> expected_candidate_at then
    raise exception 'The candidate changed. Refresh the page and review it again';
  end if;
  if e.status <> 'draft' or c.revision <> e.revision or c.group_revision <> g.revision then
    raise exception 'Candidate is stale or exchange already finalized. Generate again.';
  end if;
  rep := ssbu_private.validate_pairs(eid, c.pairs);
  if not (rep->>'valid')::boolean then raise exception 'Draw validation failed'; end if;
  if ssbu_private.hard_repeats(eid, c.pairs) > 0 then raise exception 'Draw violates configured historical restrictions'; end if;
  insert into public.ssbu_assignments(exchange_id, group_id, giver, recipient)
    select eid, gid, x.giver::uuid, x.recipient::uuid from jsonb_to_recordset(c.pairs) x(giver text, recipient text);
  update public.ssbu_exchanges set status = 'finalized', finalized_at = now(), revision = revision + 1 where id = eid;
  update public.ssbu_groups set revision = revision + 1 where id = gid;
  delete from ssbu_private.candidates where exchange_id = eid;
  return '{"finalized":true}'::jsonb;
end $$;

-- returns the full match list to the server only, which then reveals just the requested part
create function public.ssbu_review_chain(actor uuid, eid uuid, expected_candidate_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare gid uuid; e public.ssbu_exchanges; g public.ssbu_groups; c ssbu_private.candidates; ownmid uuid; pairs jsonb;
begin
  gid := ssbu_private.exchange_group(eid);
  perform ssbu_private.require_admin(gid, actor);
  select * into g from public.ssbu_groups where id = gid for update;
  select * into e from public.ssbu_exchanges where id = eid;
  if e.historical then raise exception 'A live draw is required for chain inspection'; end if;
  if e.status = 'draft' then
    select * into c from ssbu_private.candidates where exchange_id = eid;
    if c.exchange_id is null then raise exception 'Generate a candidate before inspecting the chain'; end if;
    if expected_candidate_at is null or c.created_at <> expected_candidate_at
       or c.revision <> e.revision or c.group_revision <> g.revision then
      raise exception 'The candidate changed. Refresh the page and review it again';
    end if;
    pairs := c.pairs;
  else
    if expected_candidate_at is not null and expected_candidate_at is distinct from
       (select created_at from public.ssbu_draw_reports where exchange_id = eid) then
      raise exception 'The candidate changed. Refresh the page and review it again';
    end if;
    select jsonb_agg(jsonb_build_object('giver', giver, 'recipient', recipient)) into pairs
      from public.ssbu_assignments where exchange_id = eid;
  end if;
  select m.id into ownmid from public.ssbu_group_members m
    join public.ssbu_exchange_participants p on p.member_id = m.id and p.exchange_id = eid
    where m.group_id = gid and m.discord_id = ssbu_private.discord_id(actor) and m.active;
  return jsonb_build_object('own_member_id', ownmid, 'pairs', coalesce(pairs, '[]'::jsonb));
end $$;

create function public.ssbu_exchange_status(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare eid uuid := (payload->>'exchange_id')::uuid; gid uuid; e public.ssbu_exchanges;
begin
  gid := ssbu_private.exchange_group(eid);
  perform ssbu_private.require_admin(gid, actor);
  perform 1 from public.ssbu_groups where id = gid for update;
  select * into e from public.ssbu_exchanges where id = eid;
  if not (e.status = 'finalized' and payload->>'status' = 'completed') then
    raise exception 'Invalid exchange state transition';
  end if;
  update public.ssbu_exchanges set status = 'completed', revision = revision + 1 where id = eid;
  return '{"saved":true}'::jsonb;
end $$;

-- deletes an exchange and everything recorded for it after the exact name is typed
create function public.ssbu_delete_exchange(actor uuid, eid uuid, confirmation text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare gid uuid; e public.ssbu_exchanges;
begin
  gid := ssbu_private.exchange_group(eid);
  perform ssbu_private.require_admin(gid, actor);
  perform 1 from public.ssbu_groups where id = gid for update;
  select * into e from public.ssbu_exchanges where id = eid for update;
  if confirmation is distinct from e.name then raise exception 'Type the exact exchange name to confirm deletion'; end if;
  -- lock the delivery rows, then refuse while a DM is being sent
  perform 1 from public.ssbu_notification_deliveries where exchange_id = eid for update;
  if exists (select 1 from public.ssbu_notification_deliveries
             where exchange_id = eid and status = 'sending' and lease_until > clock_timestamp()) then
    raise exception 'Notifications are being delivered. Wait for the current batch to finish before deleting this exchange';
  end if;
  delete from ssbu_private.history_audit where exchange_id = eid;
  delete from public.ssbu_notification_deliveries where exchange_id = eid;
  delete from ssbu_private.candidates where exchange_id = eid;
  delete from public.ssbu_draw_reports where exchange_id = eid;
  delete from public.ssbu_historical_assignments where exchange_id = eid;
  delete from public.ssbu_assignments where exchange_id = eid;
  delete from public.ssbu_exchange_participants where exchange_id = eid;
  delete from public.ssbu_exchanges where id = eid;
  update public.ssbu_groups set revision = revision + 1 where id = gid;
  return jsonb_build_object('deleted', true, 'group_id', gid);
end $$;

-- queues one DM per giver; running twice adds nothing new
create function public.ssbu_notifications_queue(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare eid uuid := (payload->>'exchange_id')::uuid; gid uuid; e public.ssbu_exchanges;
begin
  gid := ssbu_private.exchange_group(eid);
  perform ssbu_private.require_admin(gid, actor);
  select * into e from public.ssbu_exchanges where id = eid;
  if e.status not in ('finalized', 'completed') or e.historical then
    raise exception 'Finalize the exchange before sending notifications';
  end if;
  insert into public.ssbu_notification_deliveries(exchange_id, giver)
    select eid, giver from public.ssbu_assignments where exchange_id = eid on conflict do nothing;
  return '{"queued":true}'::jsonb;
end $$;

create function public.ssbu_notifications_retry(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare eid uuid := (payload->>'exchange_id')::uuid;
begin
  perform ssbu_private.require_admin(ssbu_private.exchange_group(eid), actor);
  if coalesce((payload->>'acknowledge')::boolean, false) <> true then
    raise exception 'Acknowledge that uncertain deliveries may duplicate a message';
  end if;
  update public.ssbu_notification_deliveries
    set status = 'pending', error_code = null, next_attempt_at = now(), lease_id = null, lease_until = null
    where exchange_id = eid and status = 'failed' and attempts < 10;
  return '{"queued":true}'::jsonb;
end $$;

create function public.ssbu_notifications_authorize(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare eid uuid := (payload->>'exchange_id')::uuid;
begin
  perform ssbu_private.require_admin(ssbu_private.exchange_group(eid), actor);
  return jsonb_build_object('exchange_id', eid);
end $$;

-- returns sending progress per giver, never who they are giving to
create function public.ssbu_delivery_progress(actor uuid, eid uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform ssbu_private.require_admin(ssbu_private.exchange_group(eid), actor);
  select jsonb_build_object(
    'total', count(*),
    'pending', count(*) filter (where status = 'pending'),
    'sending', count(*) filter (where status = 'sending'),
    'sent', count(*) filter (where status = 'sent'),
    'failed', count(*) filter (where status = 'failed'),
    'next_attempt_at', case when count(*) filter (where status = 'pending' and next_attempt_at <= now()) > 0 then null
      else min(next_attempt_at) filter (where status = 'pending') end,
    'deliveries', coalesce(jsonb_agg(jsonb_build_object('id', id, 'giver', giver, 'status', status, 'attempts', attempts,
      'error_code', error_code, 'sent_at', sent_at, 'next_attempt_at', next_attempt_at) order by created_at, id), '[]'::jsonb))
    into result from public.ssbu_notification_deliveries where exchange_id = eid;
  return result;
end $$;

-- claims the next waiting DM with a two-minute lease and returns what the message needs
create function public.ssbu_claim_delivery(eid uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare d public.ssbu_notification_deliveries; result jsonb;
begin
  -- an expired lease means the send may or may not have happened, so never resend it silently
  update public.ssbu_notification_deliveries set status = 'failed', error_code = 'uncertain_delivery',
      lease_id = null, lease_until = null
    where status = 'sending' and lease_until < now() and (eid is null or exchange_id = eid);
  select * into d from public.ssbu_notification_deliveries
    where status = 'pending' and next_attempt_at <= now() and attempts < 10 and (eid is null or exchange_id = eid)
    order by created_at for update skip locked limit 1;
  if not found then return null; end if;
  update public.ssbu_notification_deliveries
    set status = 'sending', attempts = attempts + 1, lease_id = gen_random_uuid(), lease_until = now() + interval '2 minutes'
    where id = d.id returning * into d;
  select jsonb_build_object(
      'delivery', to_jsonb(d),
      'exchange', jsonb_build_object('id', e.id, 'name', e.name, 'budget', e.budget, 'currency', e.currency),
      'giver_discord_id', g.discord_id,
      'recipient_discord_id', r.discord_id)
    into result
    from public.ssbu_assignments a
    join public.ssbu_exchanges e on e.id = a.exchange_id
    join public.ssbu_group_members g on g.id = a.giver
    join public.ssbu_group_members r on r.id = a.recipient
    where a.exchange_id = d.exchange_id and a.giver = d.giver;
  return result;
end $$;

-- saves a send result, but only for the worker that still holds the lease
create function public.ssbu_finish_delivery(did uuid, lease uuid, outcome jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare changed int;
begin
  update public.ssbu_notification_deliveries set
      status = outcome->>'status',
      message_id = outcome->>'message_id',
      channel_id = coalesce(outcome->>'channel_id', channel_id),
      error_code = outcome->>'error_code',
      next_attempt_at = now() + make_interval(secs => least(greatest(coalesce((outcome->>'retry_after')::int, 1), 1), 86400)),
      sent_at = case when outcome->>'status' = 'sent' then now() else null end,
      lease_id = null,
      lease_until = null
    where id = did and lease_id = lease and status = 'sending';
  get diagnostics changed = row_count;
  return changed = 1;
end $$;

-- lists the exchange's people and whether each has added anything, never what they added
create function public.ssbu_wishlist_status(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare eid uuid := (payload->>'exchange_id')::uuid;
begin
  perform ssbu_private.require_admin(ssbu_private.exchange_group(eid), actor);
  return jsonb_build_object(
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', m.id,
          'display_name', m.display_name,
          'has_wishes', exists (select 1 from public.ssbu_wishlist_items w where w.discord_id = m.discord_id))
        order by lower(m.display_name))
      from public.ssbu_exchange_participants p
      join public.ssbu_group_members m on m.id = p.member_id
      where p.exchange_id = eid), '[]'::jsonb),
    'reminded_recently', exists (select 1 from ssbu_private.rate_limits
      where key = 'wishlist-reminder:' || eid and window_start > now() - interval '1 hour'));
end $$;

-- starts a reminder round and returns who to DM, refusing a second round within an hour
create function public.ssbu_wishlist_reminder(actor uuid, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare eid uuid := (payload->>'exchange_id')::uuid; gid uuid; e public.ssbu_exchanges; people jsonb;
begin
  gid := ssbu_private.exchange_group(eid);
  perform ssbu_private.require_admin(gid, actor);
  select * into e from public.ssbu_exchanges where id = eid;
  if e.historical or e.status = 'completed' then
    raise exception 'Reminders are only for exchanges that are still running';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('discord_id', m.discord_id, 'display_name', m.display_name)), '[]'::jsonb)
    into people
    from public.ssbu_exchange_participants p
    join public.ssbu_group_members m on m.id = p.member_id
    where p.exchange_id = eid and m.active and m.discord_id is not null
      and not exists (select 1 from public.ssbu_wishlist_items w where w.discord_id = m.discord_id);
  if jsonb_array_length(people) = 0 then raise exception 'Everyone has added something to their wishlist'; end if;
  -- claim this hour's reminder, which also stops two admins from sending at the same time
  insert into ssbu_private.rate_limits(key, window_start, attempts) values ('wishlist-reminder:' || eid, now(), 1)
    on conflict (key) do update set window_start = now(), attempts = ssbu_private.rate_limits.attempts + 1
    where ssbu_private.rate_limits.window_start < now() - interval '1 hour';
  if not found then raise exception 'A reminder was sent less than an hour ago. Try again later'; end if;
  return jsonb_build_object('exchange', jsonb_build_object('id', e.id, 'name', e.name), 'people', people);
end $$;

-- ---------------------------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------------------------

-- policy predicates need to run as the signed-in user, every other helper stays private
revoke all on all functions in schema ssbu_private from public, anon, authenticated;
grant execute on function ssbu_private.discord_id(uuid), ssbu_private.is_owner(uuid),
  ssbu_private.is_member(uuid, uuid), ssbu_private.is_admin(uuid, uuid),
  ssbu_private.can_read_wishlist(text, uuid) to authenticated, service_role;

-- new functions are executable by everyone by default, so lock each one down to the server
do $$
declare fn regprocedure;
begin
  for fn in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'ssbu\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;
