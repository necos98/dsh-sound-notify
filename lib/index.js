// dsh-sound-notify — host node (Cordis wiring only).
//
// The host half owns the plugin's Config schema and the lifecycle hooks. Since
// DSH 0.1.7-rc.2 a plugin does NOT register a settings namespace itself:
// `settings.describe()` publishes one namespace per live profile entry, keyed
// by the entry id (`dsh-sound-notify`, the id of the row in cordis.patch.yml),
// built from the volatile fields of the exported `Config` schema. The older
// `ctx.settings.register(namespace, schema)` / client `settingsScope` pair is
// gone; the browser half reads and writes the same namespace through
// `ctx.configForms.get(SETTINGS_NS)` (lib/client.js).
//
// All sound logic lives in the browser (lib/client.js); the host only owns the
// schema and the lifecycle hooks.
//
// Pure logic lives in lib/config.js so it can be unit tested and eval'd
// without booting DSH.
// @module dsh-sound-notify

import {
  Config,
  CONFIG_KEYS,
  DEFAULT_CONFIG,
  NS,
  SETTINGS_NS,
  resolveConfig,
} from "./config.js";

/** Cordis plugin name. */
export const name = "dsh-sound-notify";

/** Required services: none — there is nothing left to register on the host. */
export const inject = [];

/**
 * Plugin body (host).
 * @param ctx - a Cordis context.
 * @param config - the row's Config, already validated and defaulted against
 *   {@link Config} by the loader before activation.
 */
export function apply(ctx, config) {
  const resolved = resolveConfig(config);
  if (!resolved.enabled) return; // deployment kill switch: wire nothing

  // Lifecycle hooks: log readiness and clean up on dispose.
  ctx.on("ready", () => {
    console.log("[dsh-sound-notify] active");
  });
  ctx.on("dispose", () => {
    console.log("[dsh-sound-notify] removed");
  });
  ctx.effect(
    () => () => console.log("[dsh-sound-notify] effect cleanup"),
    "dsh-sound-notify: lifecycle effect"
  );
}

export { Config, CONFIG_KEYS, DEFAULT_CONFIG, NS, SETTINGS_NS, resolveConfig };
