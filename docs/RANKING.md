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
2. In the dashboard open **SQL Editor → New query**, paste the whole of
   [supabase/schema.sql](../supabase/schema.sql) and press **Run**. The
   editor answers "Success. No rows returned".
3. Open **Project Settings → API** (or the **Connect** button). Copy two
   values: the **Project URL** (`https://<ref>.supabase.co`) and the
   **anon public** key. Those are the only two values the game needs; the
   `service_role` key and the database password stay private and are never
   put in the repository.
4. Replace the placeholders in `src/config/backend.js`:

   ```js
   export const BACKEND = Object.freeze({
     provider: 'supabase',
     url: 'https://xxxxxxxxxxxx.supabase.co',
     anonKey: 'eyJ...',
   });
   ```

   While the placeholders are in place `isBackendConfigured()` is false and
   the game behaves as if there were no backend.
5. `npm test`, then `npm run deploy`. Play a match on the deployed site; the
   end-of-match panel should show the new rating and rank, and
   **World ranking** in the menu should list the player.
6. (Optional) **Authentication**: nothing to set up; the game uses no
   accounts. **Table Editor** shows `players` and `matches` filling up.

### SQL

The complete schema is the file [supabase/schema.sql](../supabase/schema.sql).
It is idempotent: running it again on an existing project only replaces
the functions and the view, the tables and their rows stay. What it creates:

| Object | Role |
| --- | --- |
| `players` | One row per player id: nickname, hashed secret key, rating, matches, wins. RLS on, no policies: unreachable through the REST API. |
| `matches` | One row per submitted result (audit trail, rate limiting). Same protection. |
| `leaderboard` (view) | `rank, nickname, rating, matches, wins, player_id` for players with at least one match, ordered by rating. Readable by `anon`. |
| `rating_delta()` | The formula from the table above, in SQL. |
| `submit_match()` | The only write path: checks the key, the nickname, the result shape and the rate limits, then updates the rating and returns the new standing. `security definer`. |
| `set_nickname()` | Rename, with the same key check and uniqueness. |


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
בתור במכשיר ונשלחות כשיש רשת. הלקוח אינו קובע דירוג; רק הפונקציה
`submit_match` כותבת לטבלאות, עם בדיקת מבנה, מפתח סודי לכל שחקן והגבלת קצב.

ההגדרה, צעד אחר צעד:

1. יוצרים חשבון חינמי ב-https://supabase.com ופרויקט חדש (כל אזור; סיסמת
   מסד הנתונים לא תידרש).
2. בתפריט **SQL Editor → New query** מדביקים את כל הקובץ
   `supabase/schema.sql` ולוחצים **Run**.
3. ב-**Project Settings → API** מעתיקים שני ערכים בלבד: **Project URL**
   ו-**anon public key**. לא את `service_role` ולא את סיסמת מסד הנתונים.
4. מחליפים את שני ה-placeholders ב-`src/config/backend.js`, מריצים
   `npm test` ואז `npm run deploy`.
