// Unit tests for the host wiring (lib/index.js) run against a fake ctx.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Config, DEFAULT_CONFIG, unwrapVolatile } from "../lib/config.js";
import { apply, inject, name, SETTINGS_NS, resolveConfig } from "../lib/index.js";
import { createFakeCtx } from "./helpers.mjs";

test("module exports the Cordis contract", () => {
  assert.equal(name, "dsh-sound-notify");
  assert.ok(Array.isArray(inject));
  assert.equal(inject.length, 0); // no required services
  assert.equal(typeof apply, "function");
  // DSH reads the Config schema off the plugin module to validate the row and
  // to publish the settings namespace; without a volatile field the entry has
  // no form and the browser half finds no namespace.
  assert.ok(Config, "Config schema exported");
  assert.equal(typeof Config.toJSON, "function");
  assert.equal(Config({}).soundDone.get(), true); // fields are volatile
});

test("apply registers lifecycle hooks and no settings namespace", () => {
  const ctx = createFakeCtx();
  apply(ctx, {});
  assert.ok((ctx.lifecycle.ready ?? []).length >= 1);
  assert.ok((ctx.lifecycle.dispose ?? []).length >= 1);
  assert.ok(ctx.effects.length >= 1);
  // Since DSH 0.1.7-rc.2 the plugin no longer registers a namespace: DSH
  // derives it from the entry's Config schema, so apply() must not need
  // `ctx.settings` at all.
  assert.equal(ctx.get("settings"), undefined);
  assert.equal("namespaces" in ctx, false);
});

test("disabled config wires nothing", () => {
  const ctx = createFakeCtx();
  apply(ctx, { enabled: false });
  assert.equal((ctx.lifecycle.ready ?? []).length, 0);
  assert.equal(ctx.effects.length, 0);
});

test("apply tolerates an absent config block", () => {
  const ctx = createFakeCtx();
  apply(ctx);
  assert.ok((ctx.lifecycle.ready ?? []).length >= 1);
});

test("apply rejects a mistyped config", () => {
  const ctx = createFakeCtx();
  assert.throws(() => apply(ctx, "nope"), /needs an object/);
});

test("the settings namespace id is the patch entry id", () => {
  // Settings writes are addressed by the profile entry id (`entry.options.id`),
  // which is the `id` written in cordis.patch.yml.
  assert.equal(SETTINGS_NS, "dsh-sound-notify");
});

test("Config resolves every field, defaults included", () => {
  assert.deepEqual(unwrapVolatile(Config({})), DEFAULT_CONFIG);
  assert.deepEqual(unwrapVolatile(Config(undefined)), DEFAULT_CONFIG);
});

test("Config keeps explicit values", () => {
  const resolved = unwrapVolatile(Config({ volume: 0.8, soundDone: false }));
  assert.equal(resolved.volume, 0.8);
  assert.equal(resolved.soundDone, false);
  assert.equal(resolved.soundAttention, true, "untouched fields keep their default");
});

test("Config rejects a mistyped field", () => {
  assert.throws(() => Config({ enabled: "yes" }), /enabled/);
  assert.throws(() => Config({ volume: "0.5" }), /volume/);
});

test("Config rejects an out-of-range value", () => {
  assert.throws(() => Config({ volume: -0.1 }), /volume/);
  assert.throws(() => Config({ volume: 1.1 }), /volume/);
});

test("resolveConfig unwraps volatile references", () => {
  // This is the production path: DSH resolves the row's `config` against the
  // exported Config schema, so every `.volatile()` field arrives as a cosmokit
  // volatile reference. A naive `typeof x === "boolean"` check misses it and
  // the host silently falls back to the built-in defaults.
  const resolved = Config({ soundDone: false, volume: 0.8, onlyWhenHidden: true });
  assert.equal(typeof resolved.soundDone, "object", "raw resolution is volatile-wrapped");
  assert.equal(typeof resolved.soundDone.get, "function");
  assert.deepEqual(resolveConfig(resolved), {
    enabled: true,
    soundDone: false,
    soundAttention: true,
    onlyWhenHidden: true,
    volume: 0.8,
  });
});

test("resolveConfig ignores unknown keys for the values it resolves", () => {
  // Lenient by design: the loader (and schemastery) already validate the row,
  // and an older settings document may carry orphaned keys — e.g. the nested
  // `defaults` block this plugin used before v0.2. Those fall back to defaults.
  const resolved = resolveConfig({ soundDone: false, defaults: { volume: 0.9 } });
  assert.equal(resolved.soundDone, false);
  assert.equal(resolved.volume, 0.25);
  assert.equal(resolved.defaults, undefined);
});

test("SETTINGS_NS matches the inserted row id in cordis.patch.yml", () => {
  // This is the one real drift risk of the entry-keyed settings contract: the
  // browser half asks configForms for SETTINGS_NS, while the harness publishes
  // the namespace under the row id. If they diverge, the entry has no form and
  // the client stays at "pending (waiting for service: settingsScope)" while
  // every other test still passes.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const patch = fs.readFileSync(path.join(here, "..", "cordis.patch.yml"), "utf8");
  // Line-ending agnostic: with a CRLF checkout (core.autocrlf=true) an anchored
  // `$` never matches, and this test would silently pass on any drift.
  const ids = [...patch.matchAll(/^ {4}- id: ([^\s\r\n]+)/gm)].map((m) => m[1]);
  assert.deepEqual(
    ids,
    [SETTINGS_NS],
    "exactly one inserted row, and its id is the settings namespace"
  );
  const names = [...patch.matchAll(/^ {6}name: ([^\s\r\n]+)/gm)].map((m) => m[1]);
  assert.deepEqual(names, [name], "the inserted row loads this module");
  assert.equal(SETTINGS_NS, name, "one identity for the module and its settings namespace");
});
