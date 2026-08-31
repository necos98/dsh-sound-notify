// Unit tests for the pure config domain (lib/config.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIG_KEYS,
  DEFAULT_CONFIG,
  NS,
  SETTINGS_KEYS,
  createSoundNotifySchema,
  resolveConfig,
  resolveSettings,
  settingsNamespace,
  soundNotifySchema,
} from "../lib/config.js";

test("resolveConfig applies defaults", () => {
  const resolved = resolveConfig({});
  assert.deepEqual(resolved, {
    enabled: true,
    defaults: { ...DEFAULT_CONFIG },
  });
});

test("resolveConfig tolerates an undefined config", () => {
  assert.deepEqual(resolveConfig(), { enabled: true, defaults: { ...DEFAULT_CONFIG } });
});

test("resolveConfig passes explicit values through", () => {
  const resolved = resolveConfig({
    enabled: false,
    defaults: { soundDone: false, volume: 0.8 },
  });
  assert.equal(resolved.enabled, false);
  assert.equal(resolved.defaults.soundDone, false);
  assert.equal(resolved.defaults.volume, 0.8);
  assert.equal(resolved.defaults.soundAttention, true); // missing -> default
});

test("resolveConfig clamps and coerces the defaults block", () => {
  const resolved = resolveConfig({ defaults: { volume: 2, onlyWhenHidden: "yes" } });
  assert.equal(resolved.defaults.volume, 1); // clamped to [0, 1]
  assert.equal(resolved.defaults.onlyWhenHidden, false); // mistyped -> default
});

test("resolveConfig rejects unknown keys", () => {
  assert.throws(() => resolveConfig({ nope: 1 }), /unknown key\(s\) nope/);
  assert.throws(() => resolveConfig({ defaults: { extra: true } }), /`defaults` has unknown key\(s\) extra/);
});

test("resolveConfig rejects mistyped fields", () => {
  assert.throws(() => resolveConfig({ enabled: "yes" }), /boolean `enabled`/);
});

test("settingsNamespace validates the namespace pattern", () => {
  assert.equal(settingsNamespace("sound-notify"), "sound-notify");
  assert.throws(() => settingsNamespace("Uppercase!"), /must match/);
});

test("resolveSettings applies defaults, keeps booleans and clamps volume", () => {
  assert.deepEqual(resolveSettings(undefined), { ...DEFAULT_CONFIG });
  assert.deepEqual(resolveSettings({ soundDone: false }), {
    soundDone: false,
    soundAttention: true,
    onlyWhenHidden: false,
    volume: 0.25,
  });
  assert.equal(resolveSettings({ volume: -1 }).volume, 0);
  assert.equal(resolveSettings({ volume: 2 }).volume, 1);
  assert.equal(resolveSettings({ soundAttention: "x" }).soundAttention, true);
});

test("soundNotifySchema applies defaults and clamps", () => {
  assert.deepEqual(soundNotifySchema({ soundDone: false, volume: 2 }), {
    soundDone: false,
    soundAttention: true,
    onlyWhenHidden: false,
    volume: 1,
  });
  assert.equal(soundNotifySchema(undefined).volume, 0.25);
  assert.equal(typeof soundNotifySchema.toJSON, "function");
});

test("createSoundNotifySchema honors custom defaults", () => {
  const schema = createSoundNotifySchema({ soundDone: false, volume: 0.9 });
  const s = schema({});
  assert.equal(s.soundDone, false);
  assert.equal(s.volume, 0.9);
  assert.equal(s.soundAttention, true);
  assert.equal(typeof schema.toJSON, "function");
});

test("module exports are stable", () => {
  assert.equal(NS, "sound-notify");
  assert.deepEqual(CONFIG_KEYS, ["enabled", "defaults"]);
  assert.deepEqual(SETTINGS_KEYS, ["soundDone", "soundAttention", "onlyWhenHidden", "volume"]);
});
