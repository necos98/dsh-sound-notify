// Unit tests for the host wiring (lib/index.js) run against a fake ctx.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, inject, name, NS, soundNotifySchema } from "../lib/index.js";
import { createFakeCtx } from "./helpers.mjs";

test("module exports the Cordis contract", () => {
  assert.equal(name, "dsh-sound-notify");
  assert.ok(Array.isArray(inject));
  assert.equal(inject.length, 0); // no required services
  assert.equal(typeof apply, "function");
});

test("apply registers the settings namespace and lifecycle hooks", () => {
  const ctx = createFakeCtx();
  apply(ctx, {});
  assert.equal(ctx.namespaces.length, 1);
  assert.equal(ctx.namespaces[0].ns, NS);
  assert.equal(typeof ctx.namespaces[0].schema, "function");
  assert.ok((ctx.lifecycle.ready ?? []).length >= 1);
  assert.ok((ctx.lifecycle.dispose ?? []).length >= 1);
  assert.ok(ctx.effects.length >= 1);
});

test("apply builds the schema from the config defaults", () => {
  const ctx = createFakeCtx();
  apply(ctx, { defaults: { volume: 0.8 } });
  const schema = ctx.namespaces[0].schema;
  assert.equal(schema({}).volume, 0.8); // deployment default
  assert.equal(schema({ volume: 0.1 }).volume, 0.1); // stored value wins
});

test("disabled config registers nothing", () => {
  const ctx = createFakeCtx();
  apply(ctx, { enabled: false });
  assert.equal(ctx.namespaces.length, 0);
});

test("invalid config fails at load", () => {
  const ctx = createFakeCtx();
  assert.throws(() => apply(ctx, { enabled: "yes" }), /boolean `enabled`/);
  assert.throws(() => apply(ctx, { nope: true }), /unknown key\(s\) nope/);
});

test("settings namespace schema resolves client values", () => {
  const ctx = createFakeCtx();
  apply(ctx, {});
  const schema = ctx.namespaces[0].schema;
  assert.deepEqual(schema({ soundDone: false }), {
    soundDone: false,
    soundAttention: true,
    onlyWhenHidden: false,
    volume: 0.25,
  });
  assert.equal(typeof soundNotifySchema, "function");
});
