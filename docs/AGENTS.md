# Agents

Server-side research agents live in `agents/` and are exposed through the
Pages Function at `/api/agents/*`. They run Claude with the server-side web
search and web fetch tools; the Anthropic key is a Pages secret and never
reaches the browser. Nothing they return is written to the database — the
caller (the admin UI, or another agent) decides what to save.

## One shape for five kinds

`POST /api/agents/:kind` — `kind` is `place`, `artist`, `person`, `event` or
`lineup`.

```json
{ "keywords": "Tale Of Us; Berlin; https://www.instagram.com/taleofus" }
```

Keywords are separated by `;`. A request may also carry `instruction` — what
the operator knows and the record does not ("the bill is at …", "ignore the
last line"). The agent follows it for that run, and what is durable about it
comes back folded into the record's `news_pattern` / `lineup_pattern`, merged
with the ones the request carried.

The answer has one of three outcomes:

| `outcome` | Meaning | What is filled |
|---|---|---|
| `draft` | the keywords identify exactly one thing | `draft` |
| `ambiguous` | two or more different things fit about equally | `candidates` (2–6, most likely first: `label`, `description`, `sources`, `confidence`) |
| `not_found` | nothing fits | neither; `notes` says what was looked for |

After an `ambiguous` answer, call again with the chosen candidate and the
same keywords; the answer is then a `draft` for that one:

```json
{ "keywords": "Eagle; techno", "candidate": { "label": "…", "description": "…", "sources": ["…"], "confidence": 0.6 } }
```

Every answer also carries `sources` (URLs consulted), `confidence` (0..1),
`notes` (for the operator), `keywords`, `model` and `usage`. Unknown facts
inside a draft are `null` — never a guess. A call takes 20–60 s.

`GET /api/agents/:kind/schema` returns the JSON schema of the full answer —
register it as the result schema when another agent wraps the endpoint as a
tool.

### Drafts per kind

Contracts are in `src/agents/<kind>/schema.ts`; prompts in `agents/kinds.ts`
and `agents/place/agent.ts`; the shared loop in `agents/research.ts`.

- **place** — `draft.place` is `p_place` and `draft.spaces` is `p_spaces` of
  `save_place_with_spaces()`. When the model leaves coordinates null, the
  address it found is geocoded afterwards with OpenStreetMap Nominatim
  (`agents/geocode.ts`); the note says so. A city-only match is not used.
- **artist** — `draft.artist` maps onto `p_artist` of
  `save_artist_with_members()`; `draft.members` are the people behind the
  name (public names only). The UI links each member to an existing person
  by normalised name and creates the rest with the artist, in one
  transaction. `genres` is for recognition.
- **person** — `draft.person` maps onto `public.person`; `performs_as` lists
  the acts the person is publicly part of. Memberships are edited on the
  artist record, so the UI keeps that list in the note.
- **event** — `draft.event` maps onto `p_event` of
  `save_event_with_occurrences()`; `draft.occurrences` are the announced
  dates from today on (business day, venue name and city, times when
  announced). The UI matches each venue to a stored place by name; unmatched
  venues stay in the occurrence name for the operator to resolve. `part_of`
  names the umbrella a date is announced under (Miami Music Week, ADE); the
  form resolves it to the stored umbrella occurrence covering that date.
- **lineup** — reads labelled keywords (`event: …; date: …; place: …;
  occurrence: none in the system; current line-up: …`) and answers two
  questions in one draft: `draft.occurrence` — the night itself, filled when
  no stored occurrence was named or when the publication gives a different
  date or venue (`date_or_venue_changed`), null when the stored one is right;
  and `draft.lineup` — the announced roster as printed (billing order,
  headliner flags, `tbd`/`secret_guest` placeholders, room, note), `complete`
  false for "+ more TBA", `place_name` only when the announcement names the
  venue, `published_at` and `source_url` when shown. **One entry per printed
  line, not per artist**: `printed_as` (the line verbatim), `artists` (the
  acts on it) and `kind` — `solo`, `b2b`/`b3b`/`b4b`, `collaboration`,
  `featuring`, `multiple_guests`, `label_only`, or `unknown` with
  `kind_alternatives` when the wording allows more than one reading. The
  classification rules are in the prompt and in `SLOT_KIND_INFO`; the same
  text is shown to the operator. Each line also carries `format` (`dj_set`
  unless the bill states otherwise — "(live)", "live PA", "A/V"), `tags`
  (`all_night_long`, `opening`, `closing`, `sunrise`, `afterhours`, … — only
  what is printed), `room` (as the bill spells it; the generator matches it to
  the place's rooms with the fuzzy matcher and says which it could not place)
  and `date` (only for a run of several days whose bill names them). TBA and the other placeholders are acts, so
  "Solomun b2b TBA" is one b2b line. A line may carry `place` when the
  publication spreads its lines over several venues; the generator then asks
  which venue to fill. `place_lineup_pattern` reports how the venue writes
  its line-ups — which separator means a shared set — and the generator
  offers to store it on the place, so the next "A & B" is settled by evidence
  and not by a guess. `lineup` is null when
  nothing is published yet. Never invents names. The request may carry
  `site: https://…` (the venue's and the event's `website_url`): before the
  model runs, `agents/sitemap.ts` reads that site's sitemap and puts the
  page URLs for the date (or the brand) into the user message — web_fetch
  can only open URLs that already appeared in the conversation, and venue
  listings are JavaScript-rendered, so without this the model never reaches
  `hiibiza.com/events/2026/black-coffee/2026-09-26` and reports "not
  published".

### Names

Only publicly known names are stored for people (CLAUDE.md invariant). The
artist and person prompts say so explicitly; a legal or birth name that the
artist has not published is never returned.

## Geocoder — address in, coordinates out

`POST /api/agents/geocode` `{ "address"?, "city"?, "region"?, "country"?, "name"? }`
→ `{ "data": { latitude, longitude, display_name, kind, approximate, source } | null }`

OpenStreetMap Nominatim, no model. Tries the street address with the city,
then the venue name with the city (Nominatim lists many clubs as POIs), then
the city alone — that last result comes back with `approximate: true` and
should not be stored as a venue position. Nominatim's policy: one request per
second, no bulk runs — this is for one operator action at a time, never a
loop over a table. In the UI: the **Find** button next to Longitude on the
Place record.

## Authentication — two ways in

| Caller | How | Who may |
|---|---|---|
| The admin UI | `Authorization: Bearer <Supabase session token>` (what `apiFetch()` sends) | any active operator or admin |
| Another agent or script | `x-api-key: <AGENT_API_KEY>` | whoever holds the shared secret |

```bash
curl -s https://lineapp-admin.pages.dev/api/agents/artist \
  -H "x-api-key: $AGENT_API_KEY" -H "content-type: application/json" \
  -d '{"keywords":"Keinemusik; Berlin"}'
```

Errors: `400` invalid payload, `401` no or wrong credentials, `403` inactive
user, `404` unknown kind, `429` rate-limited upstream, `502` the agent or the
Anthropic API failed, `503` the Function has no `ANTHROPIC_API_KEY`.

`GET /api/agents/health` (no auth) says whether the keys are configured and
accepted — never their values.

## Configuration

Pages secrets on `lineapp-admin` (`npx wrangler pages secret put <NAME> --project-name lineapp-admin`):

- `ANTHROPIC_API_KEY` — required for the agents to run at all.
- `AGENT_API_KEY` — only if other agents should call them; any long random
  string. Without it, only signed-in users can call the agents.
- `SUPABASE_ANON_KEY` — the public anon key, so the Function can verify a
  session without the service-role key.

Locally, put them in `.dev.vars` and run `npm run dev:full`.

## In the UI

Every **New …** form (Places, Events, Artists, People) opens with a *Create
from keywords* block: enter the keywords, press **Fill the form**. If several
things fit, a chooser lists them with a line that tells them apart; pick one
and the agent researches exactly that one. The form is filled, sources and
confidence are shown, and only **Create** writes anything.

Every stored record of those four kinds also has **AI actualization**
(`src/agents/ActualizePanel.tsx`): the agent researches it again with an
optional instruction, and the answer is laid over the form as a diff — blue
frame, stored value in red — with nothing written until Save. A place refreshes
its rooms, an event gains dates it did not have, an artist gains members, and a
line-up is compared with its publication so the operator can correct the
version or publish the next one.

**New line-up** has *Find & AI generate* instead (`src/features/lineups/
LineupGenerate.tsx`): the finder resolves the night from the database, then
the line-up agent reads the publication. One occurrence without a line-up →
the form is filled (acts matched by normalised name, placeholders first;
unknown names become acts flagged *create*, which `save_lineup()` turns into
`unknown`-type artists with a review task; lines the agent could not classify
are listed for the operator to settle). One occurrence with a
line-up → the published roster is compared with the current version; if it
differs, the added and dropped names are shown and *Create v(n+1)* fills the
form, otherwise "nothing changed". Several occurrences → pick one. None →
the agent researches the night; *Create the night* stores event, occurrence
and, if missing, the place (tagged with the event name) and then fills the
form. A cancelled occurrence stops the flow; a publication with another date
or venue is noted for the operator, not applied.
