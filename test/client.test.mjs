// Unit tests for the browser half (lib/client.js) loaded through the
// window.__ModuleLoader__ shim. The tone assertions use the recording fake
// AudioContext provided by loadClientModule.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFakeClientCtx, findElement, loadClientModule } from "./helpers.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { modules, document: sandboxDocument, tones } = loadClientModule(
  path.join(here, "..", "lib", "client.js")
);
const client = modules.get("dsh-sound-notify");

function sessionsOf(ctx) {
  return ctx.sessions.list;
}

test("client module loads and exposes the plugin contract", () => {
  assert.ok(client, "module should be registered under dsh-sound-notify");
  assert.equal(typeof client.apply, "function");
  assert.deepEqual(
    [...client.inject].sort(),
    ["locale", "sessions", "settingsScope", "slots"].sort()
  );
});

test("client registers dictionaries and a settings row", () => {
  const ctx = createFakeClientCtx({ settings: { soundDone: true, volume: 0.5 } });
  client.apply(ctx);
  assert.equal(ctx.dictionaries.length, 1);
  assert.equal(ctx.dictionaries[0].ns, "sound-notify");
  assert.ok(ctx.dictionaries[0].dict.en["row.title"]);
  assert.equal(ctx.slotRegistrations.length, 1);
  const slot = ctx.slotRegistrations[0];
  assert.equal(slot.name, "settings.general.item");
  assert.equal(typeof slot.factory().component, "function");
});

test("client skips UI registration when slots are missing", () => {
  const ctx = createFakeClientCtx({ slots: false });
  client.apply(ctx);
  assert.equal(ctx.slotRegistrations.length, 0);
});

test("client skips dictionaries when locale is missing", () => {
  const ctx = createFakeClientCtx({ locale: false });
  client.apply(ctx);
  assert.equal(ctx.dictionaries.length, 0);
});

test("client plays the done sound when a session finishes running", () => {
  const ctx = createFakeClientCtx();
  client.apply(ctx);
  const list = sessionsOf(ctx);
  list._set({ ids: ["s1"], byId: { s1: { running: true, pendingInteraction: undefined } } });
  tones.length = 0;
  list._set({ ids: ["s1"], byId: { s1: { running: false, pendingInteraction: undefined } } });
  assert.equal(tones.length, 2); // ascending ding = 2 notes
});

test("client plays the attention sound when the model asks for input", () => {
  const ctx = createFakeClientCtx();
  client.apply(ctx);
  const list = sessionsOf(ctx);
  list._set({ ids: ["s1"], byId: { s1: { running: false, pendingInteraction: undefined } } });
  tones.length = 0;
  list._set({ ids: ["s1"], byId: { s1: { running: false, pendingInteraction: "question" } } });
  assert.equal(tones.length, 3); // double beep + tone = 3 notes
});

test("client is silent on session start and for newly appearing sessions", () => {
  const ctx = createFakeClientCtx();
  client.apply(ctx);
  const list = sessionsOf(ctx);
  tones.length = 0;
  list._set({ ids: ["s1"], byId: { s1: { running: true, pendingInteraction: undefined } } });
  assert.equal(tones.length, 0); // start -> no sound
  list._set({
    ids: ["s1", "s2"],
    byId: {
      s1: { running: true, pendingInteraction: undefined },
      s2: { running: false, pendingInteraction: undefined },
    },
  });
  assert.equal(tones.length, 0); // a new session appearing is not an edge
});

test("client honors the hidden-tab rule", () => {
  const ctx = createFakeClientCtx({
    settings: { soundDone: true, soundAttention: true, onlyWhenHidden: true, volume: 0.25 },
  });
  client.apply(ctx);
  const list = sessionsOf(ctx);
  const finish = () => {
    list._set({ ids: ["s1"], byId: { s1: { running: true, pendingInteraction: undefined } } });
    list._set({ ids: ["s1"], byId: { s1: { running: false, pendingInteraction: undefined } } });
  };
  sandboxDocument.hidden = false;
  tones.length = 0;
  finish();
  assert.equal(tones.length, 0); // onlyWhenHidden + tab visible -> silent
  sandboxDocument.hidden = true;
  tones.length = 0;
  finish();
  assert.equal(tones.length, 2); // hidden tab -> done sound plays
  sandboxDocument.hidden = false;
});

test("client honors the sound toggles live", async () => {
  const ctx = createFakeClientCtx({
    settings: { soundDone: false, soundAttention: true, onlyWhenHidden: false, volume: 0.25 },
  });
  client.apply(ctx);
  const list = sessionsOf(ctx);
  const finish = () => {
    list._set({ ids: ["s1"], byId: { s1: { running: true, pendingInteraction: undefined } } });
    list._set({ ids: ["s1"], byId: { s1: { running: false, pendingInteraction: undefined } } });
  };
  tones.length = 0;
  finish();
  assert.equal(tones.length, 0); // soundDone=false -> no done sound
  await ctx.settingsScope.set("soundDone", true);
  tones.length = 0;
  finish();
  assert.equal(tones.length, 2); // toggled on -> done sound plays
  await ctx.settingsScope.set("soundAttention", false);
  tones.length = 0;
  list._set({ ids: ["s1"], byId: { s1: { running: false, pendingInteraction: undefined } } });
  list._set({ ids: ["s1"], byId: { s1: { running: false, pendingInteraction: "question" } } });
  assert.equal(tones.length, 0); // soundAttention=false -> no attention sound
});

test("settings row renders and the volume slider writes back to the scope", () => {
  const ctx = createFakeClientCtx({ settings: { volume: 0.25 } });
  client.apply(ctx);
  const row = ctx.slotRegistrations[0].factory().component;
  const rendered = row({ scope: ctx.settingsScope, t: (key) => key });
  assert.ok(rendered && Array.isArray(rendered.__element), "row renders an element tree");
  const range = findElement(rendered, (el) => el.__element[1] && el.__element[1].type === "range");
  assert.ok(range, "volume slider present");
  range.__element[1].onChange({ target: { value: "0.5" } });
  assert.equal(ctx.settingsScope.getSnapshot().value.volume, 0.5);
  assert.equal(row({ scope: undefined, t: (key) => key }), null); // defensive
});
