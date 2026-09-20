# Agents

Server-side agents live in `agents/` and are exposed through the Pages
Function at `/api/agents/*`. They run Claude with server-side web tools; the
Anthropic key is a Pages secret and never reaches the browser.

## Place agent — keywords in, a Place draft out

`POST /api/agents/place`

Takes a keyword string about **one venue** and returns a draft of its Place
record, shaped exactly for `save_place_with_spaces()`: `draft.place` is
`p_place`, `draft.spaces` is `p_spaces`. Every fact the agent could not
establish from a source is `null`; nothing is written to the database — the
caller decides what to save.

Model: `claude-opus-5` with `web_search` and `web_fetch`, structured output
constrained to `src/agents/place/schema.ts`. Contract, prompt and loop:
`agents/place/agent.ts`. Venue sites rarely publish coordinates, so when the
model leaves them null the address it found is geocoded afterwards with
OpenStreetMap Nominatim (`agents/geocode.ts`); the note says so and the
request URL is added to `sources`. A city-only match is not used.

### Request

```json
{ "keywords": "Club Space; Miami; https://www.instagram.com/clubspacemiami" }
```

Keywords are separated by `;` — a name, a city, an Instagram profile, a
website. One venue per call.

### Response

```json
{
  "data": {
    "draft": {
      "matched": true,
      "place": { "name": "Club Space", "lifecycle_type": "permanent", "city": "Miami", "...": "…" },
      "spaces": [{ "name": "Terrace", "space_type": "terrace", "capacity": null, "notes": null, "is_primary": true }],
      "sources": ["https://www.clubspace.com/"],
      "confidence": 0.9,
      "notes": "Capacity per room is not published."
    },
    "keywords": ["Club Space", "Miami", "https://www.instagram.com/clubspacemiami"],
    "model": "claude-opus-5",
    "usage": { "input_tokens": 12345, "output_tokens": 1234, "web_searches": 3 }
  }
}
```

`matched: false` means the keywords did not identify one venue; the draft then
carries only what is certain and `notes` says why. A call takes 20–60 s.

`GET /api/agents/place/schema` returns the JSON schema of `draft` — register it
as the result schema when another agent wraps this endpoint as a tool.

### Authentication — two ways in

| Caller | How | Who may |
|---|---|---|
| The admin UI | `Authorization: Bearer <Supabase session token>` (what `apiFetch()` sends) | any active operator or admin |
| Another agent or script | `x-api-key: <AGENT_API_KEY>` | whoever holds the shared secret |

```bash
curl -s https://lineapp-admin.pages.dev/api/agents/place \
  -H "x-api-key: $AGENT_API_KEY" -H "content-type: application/json" \
  -d '{"keywords":"Club Space; Miami"}'
```

Errors: `400` invalid payload, `401` no or wrong credentials, `403` inactive
user, `429` rate-limited upstream, `502` the agent or the Anthropic API
failed, `503` the Function has no `ANTHROPIC_API_KEY`.

## Geocoder — address in, coordinates out

`POST /api/agents/geocode` `{ "address"?, "city"?, "region"?, "country"?, "name"? }`
→ `{ "data": { latitude, longitude, display_name, kind, approximate, source } | null }`

OpenStreetMap Nominatim, no model. Tries the street address with the city,
then the venue name with the city (Nominatim lists many clubs as POIs), then
the city alone — that last result comes back with `approximate: true` and
should not be stored as a venue position. Same authentication as the place
agent. Nominatim's policy: one request per second, no bulk runs — this is for
one operator action at a time, never a loop over a table. In the UI: the
**Find** button next to Longitude on the Place record.

### Configuration

Pages secrets on `lineapp-admin` (`npx wrangler pages secret put <NAME> --project-name lineapp-admin`):

- `ANTHROPIC_API_KEY` — required for the agent to run at all.
- `AGENT_API_KEY` — only if other agents should call it; any long random
  string. Without it, only signed-in users can call the agent.

Locally, put both in `.dev.vars` and run `npm run dev:full`.

### In the UI

Places → **New place** → the *Create from keywords* block at the top: enter
the keywords, press **Fill the form**. Every field and the rooms block are
filled from the draft; sources and confidence are shown; the operator reviews
and presses **Create place**. Only that press writes anything.
