// Unit tests for the pure config domain (lib/config.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Config,
  CONFIG_KEYS,
  DEFAULT_CONFIG,
  NS,
  SETTINGS_NS,
  resolveConfig,
  resolveSettings,
  unwrapVolatile,
} from "../lib/config.js";

test("resolveConfig applies defaults", () => {
  assert.deepEqual(resolveConfig({}), { ...DEFAULT_CONFIG });
});

test("resolveConfig tolerates an undefined config", () => {
  assert.deepEqual(resolveConfig(), { ...DEFAULT_CONFIG });
  assert.deepEqual(resolveConfig(null), { ...DEFAULT_CONFIG });
});

test("resolveConfig passes explicit values through", () => {
  const resolved = resolveConfig({
    enabled: false,
    soundDone: false,
    volume: 0.8,
  });
  assert.equal(resolved.enabled, false);
  assert.equal(resolved.soundDone, false);
  assert.equal(resolved.volume, 0.8);
  assert.equal(resolved.soundAttention, true); // missing -> default
});

test("resolveConfig clamps and coerces", () => {
  const resolved = resolveConfig({ volume: 2, onlyWhenHidden: "yes" });
  assert.equal(resolved.volume, 1); // clamped to [0, 1]
  assert.equal(resolved.onlyWhenHidden, false); // mistyped -> default
});

test("resolveConfig rejects a non-object", () => {
  assert.throws(() => resolveConfig("nope"), /needs an object/);
  assert.throws(() => resolveConfig([]), /needs an object/);
});

test("resolveConfig unwraps volatile references", () => {
  const resolved = resolveConfig(Config({ soundDone: false, volume: 0.5 }));
  assert.deepEqual(resolved, {
    enabled: true,
    soundDone: false,
    soundAttention: true,
    onlyWhenHidden: false,
    volume: 0.5,
  });
});

test("unwrapVolatile leaves plain values alone", () => {
  const plain = { enabled: true, soundDone: false, volume: 0.25 };
  assert.deepEqual(unwrapVolatile(plain), plain);
  assert.equal(unwrapVolatile(undefined), undefined);
  assert.equal(unwrapVolatile("x"), "x");
});

test("resolveSettings applies defaults, keeps booleans and clamps volume", () => {
  assert.deepEqual(resolveSettings(undefined), { ...DEFAULT_CONFIG });
  assert.deepEqual(resolveSettings({ soundDone: false }), {
    enabled: true,
    soundDone: false,
    soundAttention: true,
    onlyWhenHidden: false,
    volume: 0.25,
  });
  assert.equal(resolveSettings({ volume: -1 }).volume, 0);
  assert.equal(resolveSettings({ volume: 2 }).volume, 1);
  assert.equal(resolveSettings({ soundAttention: "x" }).soundAttention, true);
});

test("resolveSettings honors custom defaults", () => {
  const defaults = { ...DEFAULT_CONFIG, soundDone: false, volume: 0.9 };
  const resolved = resolveSettings({}, defaults);
  assert.equal(resolved.soundDone, false);
  assert.equal(resolved.volume, 0.9);
  assert.equal(resolved.soundAttention, true);
});

test("Config exposes five top-level volatile fields with defaults", () => {
  const json = Config.toJSON();
  const root = json.refs[json.uid];
  assert.equal(root.type, "object");
  const dict = root.dict ?? {};
  assert.deepEqual(Object.keys(dict).sort(), [...CONFIG_KEYS].sort());
  for (const key of CONFIG_KEYS) {
    const node = json.refs[dict[key]] ?? dict[key];
    assert.ok(node, key + " is declared");
    assert.equal(node.meta.volatile, true, key + " must be volatile or the entry has no form");
    assert.equal(node.meta.default, DEFAULT_CONFIG[key], key + " declares its default");
  }
  const volume = json.refs[dict.volume] ?? dict.volume;
  assert.equal(volume.meta.min, 0);
  assert.equal(volume.meta.max, 1);
});

test("Config is not flat-nested: no `defaults` block is declared", () => {
  const json = Config.toJSON();
  const dict = json.refs[json.uid].dict ?? {};
  assert.equal("defaults" in dict, false);
});

test("module exports are stable", () => {
  assert.equal(NS, "sound-notify");
  assert.equal(SETTINGS_NS, "dsh-sound-notify");
  assert.deepEqual(CONFIG_KEYS, [
    "enabled",
    "soundDone",
    "soundAttention",
    "onlyWhenHidden",
    "volume",
  ]);
});
