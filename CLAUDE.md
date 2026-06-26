# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Node.js library for sending notifications via the Apple Push Notification service (APNs) over Apple's HTTP/2 provider API. This is the **stage88 fork** of `parse-community/node-apn`. It exists for one reason: **to bump dependencies progressively and manage CVEs ahead of upstream**. Its **only** consumer is the austv server (`/Users/sam/Projects/austv/austv-server`), which pins it from GitHub by **branch** — `"node-apn": "github:stage88/node-apn#rel/v10.9.0"`. There are no npm publishes, git tags, or GitHub releases; the `rel/vX.Y.Z` branch *is* the release. These branches chain from each other (each is the previous plus a bump commit), and dependency bumps — the main kind of change here — are never merged back to master (master only tracks upstream). Keep changes minimal (KISS). See `HOWTO.md` for the release steps.

## Commands

```bash
npm test                  # run the full mocha suite (loads test/support.js globals)
npm run lint              # eslint (cached) + prettier --write
npm run lint:fix          # eslint --fix + prettier
npm run update-deps       # ncu -u then npm install --legacy-peer-deps (release-time only)

# Run a single test file:
npx mocha --require ./test/support.js test/provider.js

# Run tests matching a name:
npx mocha --require ./test/support.js 'test/**/*.js' --grep "manageChannels"
```

There is no build step — it's plain CommonJS shipped as-is (`index.js` / `index.d.ts`).

## Architecture

### Dependency-injection factory pattern (the key idea)

Almost every module under `lib/` exports a **factory**: `module.exports = function (dependencies) { ... return X }`. Modules never `require` their collaborators directly; they receive them. `index.js` is the composition root that wires everything together:

```
credentials ─┐
             ├─> config ─> Client ─> MultiClient
             │              │            │
             └──────────────┴─> Provider / MultiProvider ─> module.exports
```

When editing a module, look at how `index.js` constructs it to see what's in `dependencies`. This pattern exists primarily to enable testing: `mock/index.js` re-wires the **real** `Provider`/`MultiProvider` with a **mock** `Client` (`mock/client.js`), so consumers can `require('node-apn/mock')` to exercise the library with zero network traffic. Don't break this seam by hard-`require`-ing a collaborator that's currently injected.

### Request flow

- **`Provider`** (`lib/provider.js`) — the public surface: `send()`, `broadcast()`, `manageChannels()`, `shutdown()`. It's an `EventEmitter`. Each method builds `{ headers, body }` from a `Notification`, fans out over recipients with `Promise.allSettled`, and sorts outcomes into a `{ sent, failed }` result. A result counts as `failed` if it has a `status` or `error`.
- **`Client`** (`lib/client.js`) — owns the HTTP/2 connection(s) and all retry/timeout/heartbeat logic. It maintains **two independent sessions**:
  - `session` → push endpoint (`/3/device/...`, `/4/broadcasts/...`)
  - `manageChannelsSession` → channel-management endpoint (`/1/apps/.../channels`)

  `Client.write()` is the single entry point; it picks the session by whether the path contains `/1/apps/`. It lazily connects, retries on `[408, 429, 500, 502, 503, 504]` plus `403 ExpiredProviderToken` (up to `connectionRetryLimit`, honoring `Retry-After`), and regenerates the JWT on token expiry. `retryAfter` is internal and deleted before any error leaves the client.
- **`MultiClient`** (`lib/multiclient.js`) — a round-robin pool of `Client`s exposing the same `write()` interface. `MultiProvider` is just `Provider` injected with `MultiClient` instead of `Client`. Use it only to get past HTTP/2 concurrent-stream limits.

### Config & endpoints (`lib/config.js`)

Merges user options over defaults and resolves endpoint addresses. **Sandbox is the default**; production is selected by `NODE_ENV=production`, the `production: true` option, or passing a production address. There are separate address/port pairs for the push endpoint vs the manage-broadcast endpoint (ports 2196 prod / 2195 dev for channels). Two auth modes are mutually exclusive: **token** (JWT, preferred) or **certificate** (`cert`/`key`/`pfx`/`passphrase`).

### Notification (`lib/notification/`)

- `index.js` defines the `Notification` constructor, auto-generates `setX()` chainable setters for a fixed property list, and produces the wire format via two methods: `headers()` (apns-* headers) and `compile()`/`body` (JSON payload, memoized — **compilation is final**, later mutations are ignored).
- `apsProperties.js` is set as the prototype and holds the getters/setters that map friendly names (`alert`, `badge`, `sound`, `relevanceScore`, `contentState`, …) onto the nested `aps` object.
- `toJSON()` decides the actual JSON: `rawPayload` if set, else an MDM payload, else `{ ...payload, aps }`.

### Credentials (`lib/credentials/`)

- `token/prepare.js` — signs an ES256 JWT with `jsonwebtoken`; the returned token object self-tracks `generation`, `regenerate()`, and `isExpired()` (Client refreshes when older than ~3300s).
- `certificate/` — `node-forge`-based parsing of PEM and PKCS#12 (`.pfx`) key/cert material, plus validation.
- `token.js` (top level, distinct from the above) — normalizes a **device** token: hex-string/Buffer in, sanitized hex out.

## Testing conventions

Mocha + chai + sinon, wired through `test/support.js` (a `mochaGlobalSetup`) which installs `chai-as-promised`, `sinon-chai`, and a global `expect`. Don't `require('chai')` per-file — use the global `expect`. The `test/` tree mirrors `lib/`. Certificate/key fixtures live in `test/credentials/support/` and `test/support/`.

## Release workflow (see `HOWTO.md`)

Releases are cut on `rel/vX.Y.Z` branches: bump versions in `package.json` + `package-lock.json`, merge `parse-community/node-apn` master in (this is a fork that tracks upstream), run `npm run update-deps`, and re-run tests. Consumers pin to the branch/tag via GitHub, so the branch name *is* the released version.
