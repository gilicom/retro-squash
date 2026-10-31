# World ranking

Every player has a nickname and a rating; finished matches against the
computer are sent to a small backend that validates them, updates the
rating and keeps the leaderboard. The game is fully playable without the
backend: results queue locally and the ranking screen says it is
unavailable.

Hebrew summary at the end (תקציר בעברית בסוף).

## Client

| Module | Role |
| --- | --- |
| `src/config/backend.js` | Public backend configuration (`provider`, `url`, `anonKey`). Shipped to every browser; only public keys belong here. |
| `src/ranking/identity.js` | The local player: a random UUID (public), a 64-hex secret key and the nickname, in `localStorage` (`retro-squash.player.v1`). Nickname rules: 2–16 characters, letters in any script, digits, space, `.`, `_`, `-`. |
| `src/ranking/rating.js` | Reference implementation of the rating formula (below). Used by the tests and for the provisional estimate shown while results are queued. |
| `src/ranking/ranking.js` | `Ranking`: queue (`retro-squash.ranking.queue.v1`), last known standing (`retro-squash.ranking.state.v1`), flush on start / `online` / next submission, leaderboard fetch, nickname change. |
| `src/ranking/providers/` | Provider adapters, loaded lazily. `supabase.js` talks to PostgREST with `fetch`; no SDK. |

`Game` collects statistics during a match (rallies, longest rally, points
per game, wall-clock duration) and calls `onMatchFinished(result)` once when
a **non-demo** match ends. `main.js` hands the result to `Ranking.submit`.
The result shape (`MatchResult` in `ranking.js`):

```json
{
  "difficulty": "normal", "bestOf": 3, "pace": "normal", "autoT": true,
  "won": true, "games": [2, 1], "gameScores": [[11, 7], [9, 11], [11, 5]],
  "rallies": 54, "longestRally": 14, "duration": 312, "startedAt": 1793440000000
}
```

The client never sends a rating. The server computes it, stores the match
and returns the new standing (`rating`, `delta`, `rank`, `matches`, `wins`),
which the end-of-match panel shows. A result the server rejects (bad shape,
rate limit, wrong key) is dropped and reported as "not accepted"; a network
failure keeps it queued. Queued results older than 7 days are discarded.

## Rating formula (Elo against fixed opponents)

The three computer levels have fixed ratings; the player is rated like a
chess player who keeps meeting the same three opponents.

| Constant | Value |
| --- | --- |
| Initial rating | 1000 |
| Floor | 100 |
| Easy / Normal / Hard | 900 / 1200 / 1500 |
| K, first 20 matches (provisional) | 40 |
| K afterwards | 24 |
| Match length factor (1 game / best of 3 / best of 5) | 0.6 / 1.0 / 1.2 |
| Pace factor (relaxed / normal / fast) | 0.8 / 1.0 / 1.0 |

```
E      = 1 / (1 + 10 ^ ((R_cpu − R) / 400))        expected score
Δ      = round(K × length × pace × (S − E))          S = 1 win, 0 loss
R_new  = max(100, R + Δ)
```

Examples for a new player (K = 40, best of 3): beating Hard is worth +38,
beating Normal +30, beating Easy +14; losing to Easy costs −26, to Hard −2.
Ratings cannot be lost by not playing. The leaderboard orders by rating,
then wins, then fewer matches, then who registered first; players with no
finished match are not listed.

Why not a points ladder: points-per-match ladders reward volume (whoever
plays most is first). Elo rewards beating the hardest level consistently and
settles at a level that reflects skill, which is what a "world ranking"
should mean. Rounding: the client uses `Math.round` and Postgres `round()`,
which differ only on exact halves; the server's value is authoritative.

## Anti-abuse

The backend is public (the anon key is in the bundle), so protection is on
the server:

- **Identity**: results are accepted only with the player's secret key; the
  server stores `sha256(key)` and rejects a mismatch, so nobody can post
  under another nickname. Losing the device loses the identity (no accounts
  by design).
- **Shape validation** in SQL: difficulty, length and pace from the allowed
  sets; the number of games matches `bestOf`; each game is won 11+ with a
  2-point margin and at most 40 points; `games` agrees with `won`;
  `rallies` at least the points played; duration at least 2 s per rally and
  at most 3 hours; longest rally at most 500 hits.
- **Rate limits**: at most 30 results per player per hour and at least 20 s
  between two results. Results are replayable in principle (there is no
  proof of play without a server-side simulation); the limits bound the
  damage a scripted client can do, and the match log allows cleaning up.
- **No client-chosen rating**: the only write path is the `submit_match`
  function, which computes the rating; the tables themselves are not
  writable or readable by the anon role. The leaderboard view exposes only
  rank, nickname, rating, matches, wins and the public player id.
- **Nicknames**: 2–16 characters from a whitelist (no markup), unique
  case-insensitively.

## Setting up Supabase (recommended)

1. Create a free account at https://supabase.com and a new project (any
   region, any database password; you will not need it).
2. In the dashboard open **SQL Editor → New query**, paste the SQL below in
   full and run it.
3. Open **Project Settings → API** (or **Connect**). Copy the **Project URL**
   and the **anon public** key into `src/config/backend.js`:

   ```js
   export const BACKEND = Object.freeze({
     provider: 'supabase',
     url: 'https://xxxxxxxxxxxx.supabase.co',
     anonKey: 'eyJ...',
   });
   ```

4. `npm run build && npm run deploy`. Play a match on the deployed site; the
   end-of-match panel should show the new rating and rank, and
   **World ranking** in the menu should list the player.
5. (Optional) **Authentication → Settings**: nothing is needed; the game
   uses no accounts. **Database → Tables** shows `players` and `matches`.

### SQL

```sql
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
```

### Testing the backend without the game

```bash
curl -s "$URL/rest/v1/rpc/submit_match" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"p_player":"11111111-1111-4111-8111-111111111111","p_key":"'$(printf '0%.0s' {1..64})'","p_nickname":"Tester",
       "p_result":{"difficulty":"hard","bestOf":1,"pace":"normal","autoT":true,"won":true,"games":[1,0],"gameScores":[[11,6]],"rallies":17,"longestRally":9,"duration":70}}'
curl -s "$URL/rest/v1/leaderboard?select=rank,nickname,rating,matches,wins&order=rank.asc&limit=10" -H "apikey: $KEY"
```

Delete the tester afterwards in **Table Editor → players**.

### Maintenance

- **Remove a cheater**: `delete from public.players where nickname = '...'` (matches cascade).
- **Reset the season**: `truncate public.matches; update public.players set rating = 1000, matches = 0, wins = 0;`
- **Change the formula**: edit `rating_delta` in SQL *and* `src/ranking/rating.js`, run `npm test`, bump this document.
- Free-tier projects pause after a week without API traffic; opening the leaderboard wakes them (the first request may take a few seconds).

## Firebase (alternative, not implemented)

Firestore security rules can validate the result shape and the key, but
they cannot compute a rating transactionally without Cloud Functions, which
require the Blaze (pay-as-you-go) plan. A Firebase adapter would therefore
either trust a client-computed rating or need a billed function; this is
why Supabase is the recommended backend. If Firebase is required anyway,
implement `src/ranking/providers/firebase.js` with the same four methods
and a callable function `submitMatch` mirroring `submit_match` above.

## תקציר בעברית

לכל שחקן כינוי ודירוג. בסיום משחק (לא הדגמה) התוצאה נשלחת לשרת, שבודק
אותה, מחשב את הדירוג החדש (Elo מול שלוש רמות המחשב: קל 900, רגיל 1200, קשה
1500; דירוג התחלתי 1000) ומחזיר את המקום בטבלה. בלי חיבור התוצאות נשמרות
בתור במכשיר ונשלחות כשיש רשת. ההגדרה: ליצור פרויקט ב-Supabase, להדביק את
ה-SQL שלמעלה בעורך ה-SQL, ולהעתיק את כתובת הפרויקט ואת מפתח ה-anon אל
`src/config/backend.js`. הלקוח אינו קובע דירוג; רק הפונקציה `submit_match`
כותבת לטבלאות, עם בדיקת מבנה, מפתח סודי לכל שחקן והגבלת קצב.
