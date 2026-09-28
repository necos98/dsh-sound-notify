// dsh-sound-notify — pure config domain.
//
// SETTINGS_NS, NS, DEFAULT_CONFIG, CONFIG_KEYS, the Config schema and the
// resolve helpers live here (not in index.js) so unit tests and evals can
// import them without booting Cordis. The host module exports Config; this
// module must stay free of `ctx`.

import z from "@deepseek-ai/schemastery";

/**
 * Settings namespace, and the id of the Cordis patch row in
 * cordis.patch.yml. Since DSH 0.1.7-rc.2 the settings document is addressed by
 * the profile entry id (`entry.options.id`), not by a namespace a plugin
 * registers itself: `settings.describe()` publishes one namespace per live
 * entry, keyed by this id, and the browser half reads it with
 * `ctx.configForms.get(SETTINGS_NS)`. The host must therefore export a
 * `Config` schema — `describe()` drops an entry whose `volatileForm()` is
 * undefined (`dsh-settings/lib/index.js`, `if (form === void 0) return []`),
 * which is exactly why a Config with no volatile field shows up as
 * "pending (waiting for service: settingsScope)" in the web client.
 */
export const SETTINGS_NS = "dsh-sound-notify";

/** Locale/UI namespace: the i18n dictionary key and the slot id of the row. */
export const NS = "sound-notify";

/**
 * Accepted config keys, in the order the settings form presents them. The
 * loader validates the row's `config` block against {@link Config} before
 * `apply()` runs; the host only narrows the already-resolved values.
 */
export const CONFIG_KEYS = [
  "enabled",
  "soundDone",
  "soundAttention",
  "onlyWhenHidden",
  "volume",
];

/** Default config, used when the patch config or the settings document omit a field. */
export const DEFAULT_CONFIG = {
  enabled: true,
  soundDone: true,
  soundAttention: true,
  onlyWhenHidden: false,
  volume: 0.25,
};

/**
 * The cosmokit volatile-reference protocol.
 *
 * Spelled as a `Symbol.for` global rather than by importing `isVolatile` from
 * `@deepseek-ai/cosmokit`: the registry lookup makes the check independent of
 * which copy of the shared library registered it (ESM vs CJS, and the isolated
 * `node_modules` layouts a plugin can be installed under). `@deepseek-ai/cosmokit`
 * is only a transitive dependency of schemastery, so importing it directly would
 * add a second dependency for one boolean check.
 *
 * A `.volatile()` Config field resolves to such a reference, whose value is read
 * through `get()`; DSH hands that shape to `apply()` when the row's config was
 * resolved by the schema.
 */
const VOLATILE_WRITE = Symbol.for("cosmokit.volatile.write");

/** @returns whether `value` is a volatile Config reference. */
function isVolatileRef(value) {
  return typeof value === "object" && value !== null && VOLATILE_WRITE in value;
}

/**
 * Replace every volatile reference in a resolved Config section with its value,
 * so ordinary property reads work. Without this a volatile field reads back as
 * the reference object, every type check in {@link resolveSettings} misses, and
 * the caller silently gets the built-in defaults instead of the configured
 * values. This mirrors what DSH's own `plainConfig` does before it publishes a
 * section.
 * @param value - a resolved Config section (or any resolved Config value).
 * @returns The same shape with plain values.
 */
export function unwrapVolatile(value) {
  if (isVolatileRef(value)) return unwrapVolatile(value.get());
  if (Array.isArray(value)) return value.map(unwrapVolatile);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, unwrapVolatile(child)])
    );
  }
  return value;
}

/**
 * Coerce a raw (possibly volatile-wrapped) config object into a complete,
 * clamped config value. Used for the row's resolved config and by the browser
 * half's own reader, so both sides always agree.
 * @param raw Partial config object (may be undefined, may hold volatile refs).
 * @param defaults Fallback values for missing or mistyped fields.
 * @returns A complete, detached config object.
 */
export function resolveSettings(raw, defaults = DEFAULT_CONFIG) {
  const v = unwrapVolatile(raw) ?? {};
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : defaults.enabled,
    soundDone: typeof v.soundDone === "boolean" ? v.soundDone : defaults.soundDone,
    soundAttention: typeof v.soundAttention === "boolean" ? v.soundAttention : defaults.soundAttention,
    onlyWhenHidden: typeof v.onlyWhenHidden === "boolean" ? v.onlyWhenHidden : defaults.onlyWhenHidden,
    volume:
      typeof v.volume === "number" && Number.isFinite(v.volume)
        ? Math.max(0, Math.min(1, v.volume))
        : defaults.volume,
  };
}

/**
 * Narrow the row's config for the host's own use.
 *
 * The loader already validated and defaulted the row's `config` block against
 * {@link Config} before `apply()` runs, and schemastery drops unknown keys, so
 * this only unwraps the volatile references and clamps what arrives. A
 * hand-edited settings document therefore cannot push the host into a bad
 * state, and orphaned keys from an older version are ignored.
 * @param config Raw plugin config (already resolved, or raw in tests).
 * @returns A detached, clamped config with defaults applied.
 */
export function resolveConfig(config) {
  if (config === undefined || config === null) return { ...DEFAULT_CONFIG };
  if (typeof config !== "object" || Array.isArray(config)) {
    throw new Error("SoundNotifyConfig needs an object");
  }
  return resolveSettings(config, DEFAULT_CONFIG);
}

/**
 * The plugin's Config schema, exported from the host module as `Config`.
 *
 * Every field is `.volatile()`: that is what makes the entry appear in
 * `settings.describe()` as a live settings namespace and lets Settings write a
 * single field without remounting the plugin. Without at least one volatile
 * field the entry has no form at all and the browser half finds no namespace —
 * the client then stays at `pending (waiting for service: settingsScope)`.
 *
 * The fields are top-level on purpose: the settings form is a flat projection
 * of the volatile fields, and the browser half reads them from the top level of
 * the snapshot value.
 */
export const Config = z.object({
  /** Deployment kill switch: `false` skips the host wiring and silences the client. */
  enabled: z.boolean().default(DEFAULT_CONFIG.enabled).volatile(),
  /** Ascending "ding" when the model finishes a response. */
  soundDone: z.boolean().default(DEFAULT_CONFIG.soundDone).volatile(),
  /** Double beep + tone when the model asks for input. */
  soundAttention: z.boolean().default(DEFAULT_CONFIG.soundAttention).volatile(),
  /** Play only while the browser tab is not visible. */
  onlyWhenHidden: z.boolean().default(DEFAULT_CONFIG.onlyWhenHidden).volatile(),
  /** Output volume, 0–1. */
  volume: z.number().min(0).max(1).default(DEFAULT_CONFIG.volume).volatile(),
});
