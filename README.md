# Simplified Identity

> Simplify SailPoint admin and user experience.

Simplified Identity is a web app that wraps SailPoint Identity Security Cloud (ISC) with a simpler admin UI and an end-user experience that doesn't feel like 2012 enterprise software.

It replaces an earlier effort, **Keel** (open-core ISC dev platform), which was abandoned on 2026-05-05 in favor of a broader scope: not just a transform tester for ISC devs, but the whole admin + user surface for ISC tenants. The project was originally named "SailSimplified" and renamed to "Simplified Identity" the same day.

## Status

🚧 Early. Auth (email/password + optional Sign-in-with-SailPoint), protected dashboard placeholder, no real product features yet.

## Stack

- **Next.js 16** — App Router, Server Components
- **better-auth** — email/password + organization plugin + generic OAuth 2.0 for SailPoint sign-in
- **drizzle-orm** + **@libsql/client** (SQLite, local file)
- **shadcn/ui** + **Tailwind 4**
- **Dokploy** (self-hosted VPS) + Traefik (planned)

## Monorepo layout

```
simplified-identity/
├── apps/
│   └── web/                                # Next.js application
├── packages/
│   ├── sailpoint-client/                   # pure SailPoint ISC HTTP client (CRUD + usages walker)
│   └── transforms/                         # transform engine (types, registry, specs, evaluator, recipe, graph)
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

Both packages live under `@simplified-identity/<name>` and ship raw TypeScript — Turbopack (Next.js) transpiles them on the fly. Decision recorded in `vault/Projects/Simplified Identity/2026-05-12-monorepo-split.md`.

## Local development

```bash
cp apps/web/.env.example apps/web/.env.local      # then fill BETTER_AUTH_SECRET (32 bytes random base64)
pnpm install
pnpm --filter web db:push                          # creates apps/web/data/simplified-identity.sqlite + tables
pnpm dev                                           # turbo run dev → next dev -p 3200 → http://localhost:3200
```

Root scripts (`dev`, `build`, `lint`, `typecheck`, `start`) delegate to Turbo and fan out across workspace members. To target a single package: `pnpm --filter web <script>` or `pnpm --filter @simplified-identity/transforms <script>`.

## Configuring "Sign in with SailPoint"

The button is **always visible** on `/sign-in` and `/sign-up`. When the workspace isn't configured, clicking it shows a friendly "not configured" message — no network call. To make the button actually sign people in via your SailPoint ISC tenant, follow these three steps.

### 1. Find your tenant slug

In your ISC instance:

- Open **Dashboard** → **Overview**
- In the **Org Details** section, copy the **Org Name** value

That's your tenant slug. Example: if your ISC URL is `https://acme-sb.identitynow.com/`, your slug is `acme-sb`.

The slug is used to derive the OAuth endpoints automatically:

- Authorize: `https://<slug>.login.sailpoint.com/oauth/authorize`
- Token: `https://<slug>.api.identitynow.com/oauth/token`

### 2. Register an API client in ISC

Go to **Administrator** → **API Management** → **+** (New).

| Field | Value |
|---|---|
| **Description** | Anything readable, e.g. `Simplified Identity sign-in` |
| **Types d'autorisation** (grant types) | Tick **Code d'autorisation** (Authorization Code) **and** **Jeton de rafraîchissement** (Refresh Token). Leave **Identifiants du client** unchecked. |
| **URL de redirection** (redirect URI) | `<BETTER_AUTH_URL>/api/auth/oauth2/callback/sailpoint` — for local dev: `http://localhost:3200/api/auth/oauth2/callback/sailpoint` |
| **Portées** (scopes) | Toggle **`sp:scopes:all`** ON. Leave `sp:scopes:default` OFF — having both enabled at the same time triggers `invalid_scope` at the authorize endpoint on at least some tenants. |

Click **Créer**. SailPoint will display the generated **Client ID** (UUID) and **Client Secret** on the next screen.

> ⚠️ **Copy the Client Secret immediately.** It's only shown once and cannot be retrieved later. If you lose it, you have to delete the client and create a new one.

### 3. Set the env vars

Add these to `.env.local`:

```bash
SAILPOINT_TENANT=acme-sb        # the slug from step 1
SAILPOINT_CLIENT_ID=<uuid from step 2>
SAILPOINT_CLIENT_SECRET=<secret from step 2>
```

Restart the dev server. Clicking **Continue with SailPoint** now redirects to `https://<slug>.login.sailpoint.com/oauth/authorize?...`. After the user authenticates, ISC redirects back to the callback URL and better-auth exchanges the code for a token.

### Required scope: `sp:scopes:all`

The `/v2025/*` endpoints (transforms, identities, etc.) refuse calls whose token doesn't carry a scope that maps to the user's role-based permissions. `sp:scopes:default` is **not** that scope — its description ("Accordez l'accès aux API qui ne nécessitent aucune autorisation") is misleading: it covers public APIs only.

Use `sp:scopes:all` instead. With the user's existing role on the tenant (e.g. `ORG_ADMIN`), the token then has access to everything the user can already do in the ISC UI.

**Important quirk**: enabling **both** `sp:scopes:all` **and** `sp:scopes:default` on the OAuth client makes the authorize endpoint return `invalid_scope`. Keep only `sp:scopes:all` ON.

### How user identity is mapped

The SailPoint ISC access token is a JWT but does **not** carry the user's email or display name — those live on the identity record. After exchanging the authorization code for the access token, the app calls `https://<tenant>.api.identitynow.com/oauth/userinfo` with the bearer token. That endpoint returns the full identity payload (`id`, `email`, `firstname`, `lastname`, `displayName`, `alias`, …) and works with **no extra scope** beyond what the OAuth flow already grants.

If `/oauth/userinfo` is unavailable on a given tenant, the app falls back to `/v2025/identities/me` and an alias-based search on `/v2025/identities` — both of which **do** require an explicit scope (`sp:scopes:default` is the typical choice) to be enabled on the OAuth client. For the standard sign-in flow you don't need that.

## Authoring transforms — Recipe view

Transform authoring at `/sailpoint/transforms/new` and `/sailpoint/transforms/<id>/edit` defaults to a visual **Recipe view**: a vertical stack of cards, one per transform step, with nested sub-pipelines (concat/firstValid values) indented under a left guide. Each card surfaces the right form control per attribute (`text`, `bool`, `number`, `select`, `select-source`, `select-transform`, `kv`), with rarely-tweaked attributes folded behind an **Advanced** disclosure.

The CodeMirror Raw JSON editor stays one click away via the **Edit raw JSON** toggle for power users, debugging, and any transform type that isn't covered by the local catalogue.

| Layer | Path |
|---|---|
| Catalogue (per-type schema: `attrs[]`, `advancedAttrs[]`, `leaf`, `aggregator`) | `packages/transforms/src/catalog.ts` |
| Recipe model (typed tree + bidirectional JSON ↔ Recipe serializer + path-based immutable mutators) | `packages/transforms/src/recipe.ts` |
| UI — recursive node, step card, transform-list group, transform-map group | `apps/web/app/(app)/sailpoint/transforms/_components/recipe-node.tsx` |
| UI — per-attr-type form controls | `apps/web/app/(app)/sailpoint/transforms/_components/recipe-attr.tsx` |
| Editor + toggle (Recipe is default) | `apps/web/app/(app)/sailpoint/transforms/_components/transform-editor.tsx` |

The same catalogue feeds both the visual builder and the local evaluator/registry — a single source of truth for every supported type. If a type is missing from the catalogue, the card falls back to a "switch to Raw JSON" notice rather than rendering a broken form.

Design notes and the original tradeoff analysis live in `vault/Projects/Simplified Identity/2026-05-08-transform-recipe-view.md` (and the 2026-05-14 follow-up).

## License

MIT — see [LICENSE](LICENSE).
