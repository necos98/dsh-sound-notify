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
| `lib/index.js` | **Host** wiring (Cordis): exports the `Config` schema and owns the lifecycle hooks. Pure logic lives in the file below. |
| `lib/config.js` | Pure config domain: the `Config` schema (five volatile fields), `resolveConfig`, `resolveSettings`, `unwrapVolatile`, `SETTINGS_NS`. Unit-tested directly. |
| `lib/client.js` | **Browser** half (web): Web Audio engine, session watcher, settings row bound to this entry's `configForms` form, i18n dictionaries, UI slot. |
| `test/helpers.mjs` | Micro test framework: fake `ctx`, `window.__ModuleLoader__` shim, fake client services (configForms, locale, slots, sessions, audio). |
| `test/*.test.mjs` | Unit tests: config domain, host wiring, browser half, patch-row drift. |
| `eval/framework.mjs` + `eval/run.mjs` | Micro eval framework: behavior evals (free, no tokens). |
| `eval/cases/` | Behavior eval cases. |
| `docs/surfaces.md` | Copy-paste snippets for extra surfaces (tool, HTTP route, UI slots, host↔browser RPC channel). |
| `cordis.patch.yml` | Row that inserts the plugin into the profile; the sound defaults are changed here (or in the profile's own `cordis.patch.yml`, which takes precedence). |
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

The plugin's own folder must be installed too (`npm ci` inside the plugin
folder), because the host half imports `@deepseek-ai/schemastery`; see
[Adding host dependencies](#adding-host-dependencies).

## Settings

Open **Settings → General**: the "Sound notifications" row offers:

- **Response finished** — toggle (default: on)
- **Input needed** — toggle (default: on)
- **Only when hidden** — play only while the browser tab is not visible (default: off)
- **Volume** — 0–100% slider (default 25%)
- **Test sound** — plays both sounds (also unlocks the browser audio)

Preferences are saved in the host settings document under the **`dsh-sound-notify`
namespace** — the id of the plugin's row in `cordis.patch.yml`. Deployment
defaults are the `config:` block of that row and are validated against the
plugin's exported `Config` schema at load.

Since DSH 0.1.7-rc.2 the namespace is not registered by the plugin: the harness
publishes one settings namespace per live profile entry, keyed by the entry id,
built **only** from the volatile fields of the entry's exported `Config` schema
(`dsh-settings`' `describe()`). The five config fields are top-level — there is
no nested `defaults` block any more — and the browser half reads and writes them
through `ctx.configForms.get("dsh-sound-notify")`.

### Upgrading from 0.1.x

0.2.0 requires **DSH ≥ 0.1.7-rc.2** and changes three things at once: the config
shape is flat (five top-level fields instead of `{ enabled, defaults: { … } }`),
the settings namespace is keyed by the profile entry id, and the host registers
nothing itself.

**Preferences saved by 0.1.x under the old `sound-notify` namespace are NOT
migrated.** The namespace no longer exists; the harness only publishes the entry
id (`dsh-sound-notify`), so a browser that had custom volume/toggles saved will
fall back to the row's `config:` defaults and start from there. Copy your old
`sound-notify` section into the row's `config:` block (or re-set the toggles
once in **Settings → General**) if you had non-default values.

## Adding host dependencies

The host half now imports `@deepseek-ai/schemastery`, because the settings
namespace *is* the volatile projection of the exported `Config` schema and that
schema must be a real schemastery object. It is declared as a real
**`dependencies`** entry (NOT a peer) and installed inside the plugin folder, so
the plugin carries its own `node_modules`.

Out-of-tree plugins are mounted through a pnpm link inside the profile, so a
bare import in the host module resolves from the plugin's **real folder**, not
from the profile's `node_modules`. A plugin that imports a package the profile
does not have fails the whole profile boot at startup. That is why host
dependencies must be real `dependencies`: the profile `node_modules` is not
guaranteed to resolve them.

The browser half is different: client modules are loaded by
`window.__ModuleLoader__` and resolved from the web app bundle, so they must
stay dependency-free (or depend only on injected `@deepseek-ai/*` client
modules, e.g. `@deepseek-ai/dsh-client-connection` for the RPC channel — see
`docs/surfaces.md`).

## Compatibility

Built and verified against **DSH 0.1.7-rc.2** — the release that replaced
`ctx.settings.register(namespace, schema)` / the client `settingsScope` service
with the entry-keyed `Config` + `configForms` contract. Requires DSH
**≥ 0.1.7-rc.2**; on older releases this version has no settings form at all.

| Package | Range | Kind |
|---|---|---|
| `@deepseek-ai/cordis` | `~4.0.4` | peer |
| `@deepseek-ai/schemastery` | `~3.18.4` | dependency |

Client modules are injected by name (`dsh.client.inject`) and resolved from
the web app bundle, so they need no version pin. `@deepseek-ai/dsh-client-ui-settings`
is in that list because it provides the `configForms` client service.

## Testing

One dependency (`@deepseek-ai/schemastery`), installed with the committed
lockfile:

```
npm ci
npm test          # node --test
npm run check     # node --check on every JS/MJS file
```

In a sandbox that blocks a child process's piped stdio (the error looks like
`spawn EPERM`), Node's test runner cannot fork per-file workers; run
`node --test --experimental-test-isolation=none` locally instead. CI uses the
plain `npm test` invocation.

The helpers let tests drive the real plugin entry points without booting DSH:
`createFakeCtx()` records what the host `apply(ctx, config)` registers (hooks,
effects) and deliberately has **no** `settings` service, `createFakeClientCtx()`
fakes the client services (`configForms`, `locale`, `slots`, `sessions`) — the
fake `configForms.get(entryId)` records the ids it was asked for, so a drifted
namespace cannot pass silently — and `loadClientModule()` runs `lib/client.js`
inside a fake `window` so the browser half is testable too, including the audio
output through a recording fake `AudioContext`. New tests are just files named
`*.test.mjs` under `test/`.

`test/index.test.mjs` also asserts that `SETTINGS_NS` matches the `id` of the
inserted row in `cordis.patch.yml` (with a line-ending agnostic regex, so a CRLF
checkout cannot make the assertion vacuous). If you rename the row, the test
fails.

## Evals

```
npm run eval         # behavior evals (deterministic, free)
```

Behavior evals (`eval/cases/behavior.mjs`) run the host `apply()` against the
fake ctx and exercise the config domain — e.g. "Config exposes five top-level
volatile fields (the describe() gate)", "a schema-resolved (volatile-wrapped)
config is unwrapped before use", "legacy nested defaults are ignored". Free and
CI-safe. New cases are just exported entries in files under `eval/cases/`.

## CI

`.github/workflows/ci.yml` runs `npm ci` (the plugin has a real dependency and a
committed `package-lock.json` now), then `npm run check`, `npm test` and
`npm run eval` on every push and pull request — free, no tokens.

## Dev loop

From the profile that runs the web app (the folder where `dsh` boots):

```
dsh plugin add .            # self-link from the plugin checkout
dsh plugin list
```

Install the plugin's own dependencies once (`npm ci` in the plugin folder), edit
`lib/*.js` and `cordis.patch.yml`, then restart the profile process (the web
client hot-reloads via `dsh-plugin-hmr`). To remove:

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

The same composed id is the settings namespace, so the browser half asks
`configForms` for `dsh-sound-notify` and not for `include:dsh-sound-notify`.

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
- `enabled: false` in the row's `config:` is the deployment kill switch: the
  host wires nothing and the browser half stays silent.
- No network logs: the plugin runs entirely in the browser; its only host
  surface is the `Config` schema the harness turns into settings, read and
  written through the client `configForms` service.
