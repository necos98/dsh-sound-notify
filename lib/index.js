// dsh-sound-notify — host node (Cordis wiring only).
//
// Minimal host half: registers the "sound-notify" settings namespace (schema
// built from the deployment config defaults) so the browser half can
// read/write the sound preferences through its settingsScope. All sound logic
// lives in the browser (lib/client.js); the host only owns the namespace and
// the lifecycle hooks.
//
// Pure logic lives in lib/config.js so it can be unit tested and eval'd
// without booting DSH.
// @module dsh-sound-notify

import {
  CONFIG_KEYS,
  DEFAULT_CONFIG,
  NS,
  createSoundNotifySchema,
  resolveConfig,
  settingsNamespace,
  soundNotifySchema,
} from "./config.js";

/** Cordis plugin name. */
export const name = "dsh-sound-notify";

/** Required services: none — `settings` is injected optionally below. */
export const inject = [];

/**
 * Plugin body (host).
 * @param ctx - a context carrying the settings service.
 * @param config - the validated sound-notify config ({ enabled, defaults }).
 */
export function apply(ctx, config) {
  const resolved = resolveConfig(config);
  if (!resolved.enabled) return; // deployment kill switch: register nothing

  // 1) Settings namespace for the web client half.
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.settings.register(
      settingsNamespace(NS),
      createSoundNotifySchema(resolved.defaults)
    );
  });

  // 2) Lifecycle hooks: log readiness and clean up on dispose.
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

export { CONFIG_KEYS, DEFAULT_CONFIG, NS, resolveConfig, settingsNamespace, soundNotifySchema };
