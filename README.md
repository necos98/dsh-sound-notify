# dsh-sound-notify

A plugin for the **DSH** (DeepSeek Harness) web profile that beeps in the
**browser** when:

1. the model **finishes responding** — a session leaves the running state
   (background sessions included), or
2. the model **asks for your input** — questions (`ask_user_question`), tool
   approvals (`approval/requested`) or plan reviews.

Everything happens client-side (Web Audio API, no dependencies, no audio
files): the sounds are synthesized tones.

## What it does

| Situation | Sound |
|---|---|
| The model finishes a response (turn over, stopped, or errored) | Ascending "ding" (2 notes) |
| The model asks a question / needs an approval | Double beep + tone (3 notes) |

## Structure

| Path | Role |
|---|---|
| `lib/index.js` | **Host** wiring (Cordis): settings namespace + lifecycle hooks. Pure logic lives in the files below. |
| `lib/config.js` | Pure config domain: `resolveConfig`, `resolveSettings`, `createSoundNotifySchema`, namespace brand. Unit-tested directly. |
| `lib/client.js` | **Browser** half (web): Web Audio engine, session watcher, settings row synced with the host namespace, i18n dictionaries, UI slot. |
| `test/helpers.mjs` | Micro test framework: fake `ctx`, `window.__ModuleLoader__` shim, fake client services (settingsScope, locale, slots, sessions, audio). |
| `test/*.test.mjs` | Unit tests: config domain, host wiring, browser half. |
| `eval/framework.mjs` + `eval/run.mjs` | Micro eval framework: behavior evals (free, no tokens). |
| `eval/cases/` | Behavior eval cases. |
| `docs/surfaces.md` | Copy-paste snippets for extra surfaces (tool, HTTP route, UI slots, host↔browser RPC channel). |
| `cordis.patch.yml` | Row that inserts the plugin into the profile; config defaults are changed here (or in the profile's own `cordis.patch.yml`, which takes precedence). |
| `package.json` | `exports` (`.` + `./client` + `./cordis.patch.yml`), `dsh.bundle.patch`, `dsh.client`, scripts (`check`, `test`, `eval`). |

## Install

Installation is automatic: the plugin declares `dsh.bundle.patch`, so
`dsh plugin add` installs it into the profile **and** registers it as a
bundle layer by itself (`dsh.profile.bundles` in the profile's `package.json`).
No manual edit of the profile's `cordis.patch.yml` is needed.

From the profile that runs the web app (the folder where `dsh` boots):

```
dsh plugin add <path-to-dsh-sound-notify>
dsh plugin list
```

then restart the profile process (`dsh web`). The mount row lives in the
package's own `cordis.patch.yml` and is applied as a bundle layer at boot.

> **Migrating from a manually added row** (a `sound-notify` line hand-written
> into the profile's `cordis.patch.yml`): run `dsh plugin add` as above — the
> CLI moves the plugin into `dsh.profile.bundles` — then remove the manual row
> from the profile's `cordis.patch.yml` to avoid a duplicate insert.

## Settings

Open **Settings → General**: the "Sound notifications" row offers:

- **Response finished** — toggle (default: on)
- **Input needed** — toggle (default: on)
- **Only when hidden** — play only while the browser tab is not visible (default: off)
- **Volume** — 0–100% slider (default 25%)
- **Test sound** — plays both sounds (also unlocks the browser audio)

Preferences are saved in the host settings document under the `sound-notify`
namespace. Deployment defaults can be changed in `cordis.patch.yml`
(`config.defaults`) and are validated at plugin load.

## Adding host dependencies

The host module (`lib/index.js`) stays import-free on purpose. Out-of-tree
plugins are mounted through a pnpm link inside the profile, so a bare import
in the host module resolves from the plugin's **real folder**, not the
profile's `node_modules`. A plugin that imports a package the profile does not
have fails the whole profile boot at startup.

To give your plugin host-side dependencies, declare them as real
`dependencies` (NOT `peerDependencies`) and install them inside the plugin
folder, so the plugin carries its own `node_modules`. Never declare host
dependencies as peers: the profile `node_modules` is not guaranteed to resolve
them.

The browser half is different: client modules are loaded by
`window.__ModuleLoader__` and resolved from the web app bundle, so they must
stay dependency-free (or depend only on injected `@deepseek-ai/*` client
modules, e.g. `@deepseek-ai/dsh-client-connection` for the RPC channel — see
`docs/surfaces.md`).

## Compatibility

Built and verified against **DSH 0.1.1-rc.2** (the channel the current harness
runs on). Peer dependency range:

| Package | Range |
|---|---|
| `@deepseek-ai/cordis` | `^4.0.1` |

Client modules are injected by name (`dsh.client.inject`) and resolved from
the web app bundle, so they need no version pin.

## Testing

Zero dependencies: Node's built-in test runner + the helpers in
`test/helpers.mjs`.

```
npm test          # node --test test/
npm run check     # node --check on every JS/MJS file
```

The helpers let tests drive the real plugin entry points without booting DSH:
`createFakeCtx()` records what the host `apply(ctx, config)` registers
(namespaces, hooks, effects), `createFakeClientCtx()` fakes the client
services (settingsScope, locale, slots, sessions), and `loadClientModule()`
runs `lib/client.js` inside a fake `window` so the browser half is testable
too — including the audio output, through a recording fake `AudioContext`.
New tests are just files named `*.test.mjs` under `test/`.

## Evals

```
npm run eval         # behavior evals (deterministic, free)
```

Behavior evals (`eval/cases/behavior.mjs`) run the host `apply()` against the
fake ctx — e.g. "the settings namespace is registered and resolves for the
client", "config validation rejects unknown keys". Free and CI-safe. New cases
are just exported entries in files under `eval/cases/`.

## CI

`.github/workflows/ci.yml` runs `npm run check`, `npm test` and `npm run eval`
on every push and pull request — free, no tokens.

## Dev loop

From the profile that runs the web app (the folder where `dsh` boots):

```
dsh plugin add .            # self-link from the plugin checkout
dsh plugin list
```

Edit `lib/*.js` and `cordis.patch.yml`, then restart the profile process (the
web client hot-reloads via `dsh-plugin-hmr`). To remove:

```
dsh plugin remove dsh-sound-notify
```

## Cordis patch rows: entry ids vs `options.id`

The loader prefixes every entry id with its tree namespace: an entry mounted
through an include shows up in runtime logs and loader APIs as
`include:dsh-sound-notify`. A patch row, however, must target the entry's
**composed id** — the `id` written in the entry list (`dsh-sound-notify`),
i.e. `entry.options.id`:

```yaml
- id: dsh-sound-notify
  disabled: true
```

Writing the namespaced id (`include:dsh-sound-notify`) matches nothing: the
include logs `patch: entry not found` and skips the row, so it silently does
nothing.

## Removal

Everything is automatic here too: `dsh plugin remove` uninstalls and the
reconcile drops the plugin from `dsh.profile.bundles`.

```
dsh plugin remove dsh-sound-notify
# restart dsh web
```

## Notes

- **Browser autoplay policy**: audio can only start after a first user gesture
  on the page (click/keystroke). The plugin unlocks the `AudioContext` on the
  first gesture; the "Test sound" button unlocks and plays immediately.
- Sounds cover **all** sessions (background ones included), not only the
  selected one. The client watches `ctx.sessions.list`; every `SessionSummary`
  exposes `running` and `pendingInteraction`, and a diff between consecutive
  snapshots detects the two edges (`running true→false` → "done",
  `pendingInteraction` appearing → "attention").
- No network logs: the plugin runs entirely in the browser; the only
  communication with the host is the settings namespace.
