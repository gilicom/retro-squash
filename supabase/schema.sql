-- Retro Squash world ranking ------------------------------------------------
-- Paste into the Supabase SQL editor. Idempotent: safe to run again.

create table if not exists public.players (
  id          uuid primary key,
  key_hash    text not null,
  nickname    text not null,
  rating      integer not null default 1000,
  matches     integer not null default 0,
  wins        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists players_nickname_lower on public.players (lower(nickname));

create table if not exists public.matches (
  id            bigint generated always as identity primary key,
  player_id     uuid not null references public.players(id) on delete cascade,
  played_at     timestamptz not null default now(),
  difficulty    text not null check (difficulty in ('easy', 'normal', 'hard')),
  best_of       smallint not null check (best_of in (1, 3, 5)),
  pace          text not null check (pace in ('relaxed', 'normal', 'fast')),
  auto_t        boolean not null,
  won           boolean not null,
  games_you     smallint not null,
  games_cpu     smallint not null,
  game_scores   jsonb not null,
  rallies       integer not null,
  longest_rally integer not null,
  duration      integer not null,
  rating_before integer not null,
  rating_after  integer not null
);
create index if not exists matches_player_time on public.matches (player_id, played_at desc);

-- Nobody reaches the tables directly through the API: RLS on, no policies.
alter table public.players enable row level security;
alter table public.matches enable row level security;
revoke all on public.players from anon, authenticated;
revoke all on public.matches from anon, authenticated;

-- Public leaderboard: only safe columns. The view runs as its owner, which is
-- how it can read the RLS-protected table.
create or replace view public.leaderboard with (security_invoker = false) as
  select rank() over (order by rating desc, wins desc, matches asc, created_at asc) as rank,
         id as player_id, nickname, rating, matches, wins
  from public.players
  where matches > 0;
grant select on public.leaderboard to anon, authenticated;

-- Rating formula: must stay identical to src/ranking/rating.js.
create or replace function public.rating_delta(
  p_rating int, p_matches int, p_difficulty text, p_won boolean, p_best_of int, p_pace text
) returns int
language sql immutable as $$
  select round(
      (case when p_matches < 20 then 40 else 24 end)
    * (case p_best_of when 1 then 0.6 when 3 then 1.0 when 5 then 1.2 else 1.0 end)
    * (case p_pace when 'relaxed' then 0.8 else 1.0 end)
    * ( (case when p_won then 1 else 0 end)
        - 1 / (1 + power(10, ((case p_difficulty when 'easy' then 900 when 'normal' then 1200 when 'hard' then 1500 end) - p_rating) / 400.0)) )
  )::int
$$;

create or replace function public.check_key(p_key text) returns text
language sql immutable as $$
  select case when p_key ~ '^[0-9a-f]{64}$' then encode(sha256(convert_to(p_key, 'UTF8')), 'hex') end
$$;

create or replace function public.check_nickname(p_nickname text) returns text
language sql immutable as $$
  select case when btrim(p_nickname) ~ '^[[:alnum:] ._-]{2,16}$' then btrim(p_nickname) end
$$;

-- Submit a finished match. Validates, rates, stores and returns the standing.
create or replace function public.submit_match(
  p_player uuid, p_key text, p_nickname text, p_result jsonb
) returns table (rating int, delta int, rank bigint, matches int, wins int)
language plpgsql security definer set search_path = public as $$
declare
  v_hash      text := public.check_key(p_key);
  v_nick      text := public.check_nickname(p_nickname);
  v_player    public.players%rowtype;
  v_diff      text := p_result->>'difficulty';
  v_best_of   int  := (p_result->>'bestOf')::int;
  v_pace      text := p_result->>'pace';
  v_won       boolean := (p_result->>'won')::boolean;
  v_gy        int  := (p_result->'games'->>0)::int;
  v_gc        int  := (p_result->'games'->>1)::int;
  v_scores    jsonb := p_result->'gameScores';
  v_rallies   int  := (p_result->>'rallies')::int;
  v_longest   int  := (p_result->>'longestRally')::int;
  v_duration  int  := (p_result->>'duration')::int;
  v_points    int  := 0;
  v_g         jsonb;
  v_a         int;
  v_b         int;
  v_recent    int;
  v_last      timestamptz;
  v_delta     int;
  v_new       int;
begin
  if v_hash is null then raise exception 'bad key'; end if;
  if v_nick is null then raise exception 'bad nickname'; end if;

  -- Shape.
  if v_diff not in ('easy', 'normal', 'hard') then raise exception 'bad difficulty'; end if;
  if v_best_of not in (1, 3, 5) then raise exception 'bad bestOf'; end if;
  if v_pace not in ('relaxed', 'normal', 'fast') then raise exception 'bad pace'; end if;
  if v_won is null or v_gy is null or v_gc is null then raise exception 'bad result'; end if;
  if jsonb_typeof(v_scores) <> 'array' or jsonb_array_length(v_scores) <> v_gy + v_gc then raise exception 'bad games'; end if;
  if v_gy + v_gc > v_best_of or (v_won and v_gy * 2 <= v_best_of) or (not v_won and v_gc * 2 <= v_best_of) then raise exception 'games do not match result'; end if;
  for v_g in select * from jsonb_array_elements(v_scores) loop
    v_a := (v_g->>0)::int; v_b := (v_g->>1)::int;
    if v_a is null or v_b is null or v_a < 0 or v_b < 0 or greatest(v_a, v_b) < 11 or greatest(v_a, v_b) > 40 or abs(v_a - v_b) < 2 then
      raise exception 'bad game score';
    end if;
    v_points := v_points + v_a + v_b;
  end loop;
  if v_rallies is null or v_rallies < v_points or v_rallies > 2000 then raise exception 'bad rallies'; end if;
  if v_longest is null or v_longest < 0 or v_longest > 500 then raise exception 'bad rally length'; end if;
  if v_duration is null or v_duration < v_rallies * 2 or v_duration > 10800 then raise exception 'bad duration'; end if;

  -- Player: create on first result, otherwise check the key and the nickname.
  select * into v_player from public.players p where p.id = p_player for update;
  if not found then
    if exists (select 1 from public.players p where lower(p.nickname) = lower(v_nick)) then raise exception 'nickname taken'; end if;
    insert into public.players (id, key_hash, nickname) values (p_player, v_hash, v_nick) returning * into v_player;
  else
    if v_player.key_hash <> v_hash then raise exception 'bad key'; end if;
    if lower(v_player.nickname) <> lower(v_nick) then
      if exists (select 1 from public.players p where lower(p.nickname) = lower(v_nick) and p.id <> p_player) then raise exception 'nickname taken'; end if;
    end if;
  end if;

  -- Rate limits.
  select count(*), max(played_at) into v_recent, v_last from public.matches m where m.player_id = p_player and m.played_at > now() - interval '1 hour';
  if v_recent >= 30 then raise exception 'rate limit'; end if;
  if v_last is not null and v_last > now() - interval '20 seconds' then raise exception 'too soon'; end if;

  -- Rate and store.
  v_delta := public.rating_delta(v_player.rating, v_player.matches, v_diff, v_won, v_best_of, v_pace);
  v_new := greatest(100, v_player.rating + v_delta);
  insert into public.matches (player_id, difficulty, best_of, pace, auto_t, won, games_you, games_cpu, game_scores, rallies, longest_rally, duration, rating_before, rating_after)
    values (p_player, v_diff, v_best_of, v_pace, coalesce((p_result->>'autoT')::boolean, true), v_won, v_gy, v_gc, v_scores, v_rallies, v_longest, v_duration, v_player.rating, v_new);
  update public.players p
     set rating = v_new, matches = p.matches + 1, wins = p.wins + (case when v_won then 1 else 0 end),
         nickname = v_nick, updated_at = now()
   where p.id = p_player;

  return query
    select l.rating::int, (v_new - v_player.rating)::int as delta, l.rank, l.matches::int, l.wins::int
      from public.leaderboard l where l.player_id = p_player;
end
$$;

-- Change the nickname (key required).
create or replace function public.set_nickname(p_player uuid, p_key text, p_nickname text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_hash text := public.check_key(p_key);
  v_nick text := public.check_nickname(p_nickname);
begin
  if v_hash is null then raise exception 'bad key'; end if;
  if v_nick is null then raise exception 'bad nickname'; end if;
  if exists (select 1 from public.players p where lower(p.nickname) = lower(v_nick) and p.id <> p_player) then raise exception 'nickname taken'; end if;
  update public.players p set nickname = v_nick, updated_at = now() where p.id = p_player and p.key_hash = v_hash;
  if not found then raise exception 'bad key'; end if;
end
$$;

revoke all on function public.submit_match(uuid, text, text, jsonb) from public;
revoke all on function public.set_nickname(uuid, text, text) from public;
grant execute on function public.submit_match(uuid, text, text, jsonb) to anon, authenticated;
grant execute on function public.set_nickname(uuid, text, text) to anon, authenticated;
