// Smoke test per dsh-sound-notify: esegue entrambe le metà (host + client)
// in Node con stub. Uso: node test/smoke.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log("  PASS:", msg);
  else { failures++; console.log("  FAIL:", msg); }
};

// ---------- 1) metà host ----------
console.log("[host half]");
const host = await import(pathToFileURL(join(root, "lib", "index.js")).href);
let registered = null;
const fakeSettings = {
  register(ns, schema, options) { registered = { ns, schema, options }; },
};
const hostCtx = {
  inject(list, cb) {
    ok(list.includes("settings"), "host inject dichiara settings");
    cb({ settings: fakeSettings });
  },
};
host.apply(hostCtx);
ok(registered !== null, "settings.register chiamato");
ok(registered.ns === "sound-notify", "namespace = sound-notify");
const s = registered.schema;
ok(typeof s.toJSON === "function", "schema.toJSON presente");
const v1 = s(undefined);
ok(v1.soundDone === true && v1.soundAttention === true && v1.onlyWhenHidden === false && v1.volume === 0.25, "default schema ok");
const v2 = s({ soundDone: false, volume: 2 });
ok(v2.soundDone === false && v2.volume === 1, "validazione/clamp ok");
const v3 = s({ soundAttention: "x", volume: -1 });
ok(v3.soundAttention === true && v3.volume === 0, "valori non validi -> default/clamp");

// ---------- 2) metà client ----------
console.log("[client half]");
const tones = [];
class FakeAC {
  constructor() { this.state = "running"; this.currentTime = 10; this.destination = {}; }
  resume() { this.state = "running"; return Promise.resolve(); }
  createOscillator() {
    const osc = { type: "", frequency: { setValueAtTime() {} }, connect() {}, start() {}, stop() {} };
    tones.push(osc);
    return osc;
  }
  createGain() {
    return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
  }
}
let registration = null;
const fakeWindow = {
  AudioContext: FakeAC,
  addEventListener() {},
  __ModuleLoader__: { load(reg) { registration = reg; } },
};
const fakeDocument = {
  hidden: false,
  querySelector() { return null; },
  createElement(tag) { return { tag, dataset: {}, textContent: "" }; },
  head: { appendChild() {} },
};
globalThis.window = fakeWindow;
globalThis.document = fakeDocument;
const clientSrc = readFileSync(join(root, "lib", "client.js"), "utf8");
(0, eval)(clientSrc);
ok(registration !== null, "ModuleLoader.load registra il bundle");
ok(registration.id === "dsh-sound-notify", "id bundle = dsh-sound-notify");

const fakeReact = {
  createElement: (...args) => ({ kind: "el", args }),
  useSyncExternalStore: (_sub, getSnap) => getSnap(),
};
const required = new Set();
const fakeRequire = (name) => {
  required.add(name);
  if (name === "react") return fakeReact;
  throw new Error("require inatteso: " + name);
};
const exportsObj = registration.factory(fakeRequire);
ok(typeof exportsObj.apply === "function", "exports.apply funzione");
ok(Array.isArray(exportsObj.inject) && exportsObj.inject.includes("sessions"), "exports.inject include sessions");
ok(exportsObj.inject.includes("settingsScope"), "exports.inject include settingsScope");
ok(required.has("react") && required.size === 1, "richiede solo react");

// ctx finto
let listState = { ids: ["s1"], byId: { s1: { running: false, pendingInteraction: undefined } } };
let listSub = null;
const fakeList = {
  getSnapshot: () => listState,
  subscribe(fn) { listSub = fn; return () => { listSub = null; }; },
};
let scopeSnap = { status: "ready", value: { soundDone: true, soundAttention: true, onlyWhenHidden: false, volume: 0.25 }, writable: true };
const scopeSubs = [];
// subscribe usa this.store come il controller reale: se invocata senza
// receiver (come fa React.useSyncExternalStore) il vecchio codice esplodeva.
const fakeScope = {
  store: {
    subscribe(fn) { scopeSubs.push(fn); return () => {}; },
  },
  subscribe(listener) { return this.store.subscribe(listener); },
  getSnapshot: () => scopeSnap,
  set: async (field, value) => {
    scopeSnap = { ...scopeSnap, value: { ...scopeSnap.value, [field]: value } };
    scopeSubs.forEach((fn) => fn());
  },
};
const fakeSettingsScope = { bind: () => fakeScope };
const slotRegs = [];
const fakeSlots = {
  inject(name, cb) { cb(); },
  register(opts, comp) { slotRegs.push({ opts, comp }); },
};
let localeDicts = null;
const fakeLocale = { register(ns, dicts) { localeDicts = dicts; return () => {}; } };
const disposers = [];
const fakeCtx = {
  settingsScope: fakeSettingsScope,
  get(name) {
    if (name === "settingsScope") return fakeSettingsScope;
    if (name === "sessions") return { list: fakeList };
    if (name === "slots") return fakeSlots;
    if (name === "locale") return fakeLocale;
    return undefined;
  },
  effect(fn) { disposers.push(fn()); },
};
exportsObj.apply(fakeCtx);
ok(listSub !== null, "watcher sottoscritto al list store");
ok(localeDicts !== null && localeDicts.it !== undefined, "dizionari i18n registrati (it)");
ok(slotRegs.length === 1 && slotRegs[0].opts.name === "settings.general.item", "riga settings registrata");

// simulate: start running -> no sound; finish -> done sound; pending -> attention sound
const fire = () => { if (listSub) listSub(); };
listState = { ids: ["s1"], byId: { s1: { running: true, pendingInteraction: undefined } } };
fire();
ok(tones.length === 0, "avvio turno: nessun suono");
listState = { ids: ["s1"], byId: { s1: { running: false, pendingInteraction: undefined } } };
fire();
ok(tones.length > 0, "fine turno: suono 'done' emesso (" + tones.length + " note)");
const doneCount = tones.length;
listState = { ids: ["s1"], byId: { s1: { running: false, pendingInteraction: "question" } } };
fire();
ok(tones.length > doneCount, "pending question: suono 'attention' emesso");
ok(tones.length - doneCount === 3, "attention = 3 note (doppio beep + tono)");

// onlyWhenHidden=true sopprime i suoni quando la tab è visibile
tones.length = 0;
scopeSnap = { status: "ready", value: { soundDone: true, soundAttention: true, onlyWhenHidden: true, volume: 0.25 } };
scopeSubs.forEach((fn) => fn());
listState = { ids: ["s1"], byId: { s1: { running: true, pendingInteraction: undefined } } };
fire();
listState = { ids: ["s1"], byId: { s1: { running: false, pendingInteraction: undefined } } };
fire();
ok(tones.length === 0, "onlyWhenHidden + tab visibile: nessun suono");

// soundDone=false -> nessun ding alla fine turno
tones.length = 0;
scopeSnap = { status: "ready", value: { soundDone: false, soundAttention: true, onlyWhenHidden: false, volume: 0.25 } };
scopeSubs.forEach((fn) => fn());
listState = { ids: ["s1"], byId: { s1: { running: true, pendingInteraction: undefined } } };
fire();
listState = { ids: ["s1"], byId: { s1: { running: false, pendingInteraction: undefined } } };
fire();
ok(tones.length === 0, "soundDone=false: nessun suono alla fine");

// riga impostazioni: render + slider volume
const rowComp = slotRegs[0].comp;
const rendered = rowComp({ scope: fakeScope, t: (k) => k });
ok(rendered.kind === "el", "riga impostazioni renderizza");
ok(rowComp({ scope: undefined, t: (k) => k }) === null, "scope undefined -> rende null (difensivo)");
const findEl = (node, pred) => {
  if (node === null || node === undefined || typeof node !== "object") return undefined;
  if (node.kind === "el") {
    if (pred(node)) return node;
    for (const a of node.args ?? []) {
      const hit = findEl(a, pred);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
};
const rangeEl = findEl(rendered, (el) => el.args[1] && el.args[1].type === "range");
ok(rangeEl !== undefined, "slider volume presente");
await rangeEl.args[1].onChange({ target: { value: "0.5" } });
ok(scopeSnap.value.volume === 0.5, "set volume aggiorna lo scope");

// gli effect del plugin restituiscono tutti un disposer
ok(disposers.length >= 3 && disposers.every((d) => typeof d === "function"), "effect disposers registrati");

console.log("");
if (failures === 0) console.log("ALL TESTS PASSED");
else { console.log(failures + " FAILURES"); process.exit(1); }