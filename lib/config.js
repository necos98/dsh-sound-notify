// dsh-sound-notify — pure config domain.
//
// NS, DEFAULT_CONFIG, settingsNamespace, resolveConfig and the settings
// schema live here (not in index.js) so unit tests and evals can import them
// without booting Cordis. This module must stay free of `ctx` and of package
// imports.

/** Default client settings, used when the patch config or the settings document omit a field. */
export const DEFAULT_CONFIG = {
  soundDone: true,
  soundAttention: true,
  onlyWhenHidden: false,
  volume: 0.25,
};

/** Settings namespace shared with the web client (lib/client.js). */
export const NS = "sound-notify";

/** Accepted top-level config keys, for the unknown-key guard. */
export const CONFIG_KEYS = ["enabled", "defaults"];

/** Accepted keys inside the `defaults` config block, for the unknown-key guard. */
export const SETTINGS_KEYS = ["soundDone", "soundAttention", "onlyWhenHidden", "volume"];

/**
 * settingsNamespace() in @deepseek-ai/dsh-settings is only a branded string
 * with a validation pattern; inlined so the host module stays free of imports
 * that the profile node_modules might not resolve.
 */
export function settingsNamespace(value) {
  if (!/^[a-z][a-z0-9-]*$/.test(value)) {
    throw new TypeError(
      'settings namespace "' + value + '" must match /^[a-z][a-z0-9-]*$/'
    );
  }
  return value;
}

/**
 * Coerce a raw settings object into a complete settings value. Used both by
 * resolveConfig (for the `defaults` block) and by the namespace schema (for
 * the stored settings document), so both sides always agree.
 * @param raw Partial settings object (may be undefined).
 * @param defaults Fallback values for missing or mistyped fields.
 * @returns A complete settings object.
 */
export function resolveSettings(raw, defaults = DEFAULT_CONFIG) {
  const v = raw ?? {};
  return {
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
 * Validate deployment-owned config. Missing, mistyped, or unknown fields fail
 * at plugin load rather than being ignored.
 * @param config Raw plugin config ({ enabled, defaults }).
 * @returns A detached validated config with defaults applied.
 */
export function resolveConfig(config) {
  const raw = config ?? {};
  const enabled = raw.enabled ?? true;
  if (typeof enabled !== "boolean") {
    throw new Error("SoundNotifyConfig needs a boolean `enabled`");
  }
  const defaults = resolveSettings(raw.defaults);
  const unknown = Object.keys(raw).filter((key) => !CONFIG_KEYS.includes(key));
  if (unknown.length > 0) {
    throw new Error(
      "SoundNotifyConfig has unknown key(s) " + unknown.join(", ") +
        " — config is { enabled, defaults: { soundDone, soundAttention, onlyWhenHidden, volume } }"
    );
  }
  if (raw.defaults !== undefined) {
    const bad = Object.keys(raw.defaults).filter((key) => !SETTINGS_KEYS.includes(key));
    if (bad.length > 0) {
      throw new Error(
        "SoundNotifyConfig `defaults` has unknown key(s) " + bad.join(", ") +
          " — defaults accepts { soundDone, soundAttention, onlyWhenHidden, volume }"
      );
    }
  }
  return { enabled, defaults };
}

/**
 * Build the settings namespace schema. The schema resolves the stored
 * settings document with `schema(section)` (schemastery schemas are invoked
 * as functions), so a callable with toJSON is enough and needs no
 * @deepseek-ai/schemastery import.
 * @param defaults Fallback values for fields missing from the stored section.
 * @returns A callable schema with toJSON.
 */
export function createSoundNotifySchema(defaults = DEFAULT_CONFIG) {
  // Partial custom defaults override the module defaults field by field.
  const base = { ...DEFAULT_CONFIG, ...defaults };
  function soundNotifySchema(section) {
    return resolveSettings(section, base);
  }
  soundNotifySchema.toJSON = () => ({ type: "object", dict: {} });
  return soundNotifySchema;
}

/** Default namespace schema (falls back to DEFAULT_CONFIG). */
export const soundNotifySchema = createSoundNotifySchema();
