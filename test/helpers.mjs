// test/helpers.mjs — micro test framework for DSH plugins.
//
// Zero dependencies: node:test (built-in) runs the tests; this file provides
// the plugin-specific pieces:
//   - createFakeCtx: a fake Cordis ctx that records what apply() registers
//     (settings namespaces, lifecycle hooks, effects) so tests can assert on
//     the registrations without booting DSH.
//   - createFakeSettingsScope / createFakeSessions: fake client services.
//   - createFakeClientCtx: fake client ctx combining those services.
//   - loadClientModule: execute lib/client.js inside a fake window so the
//     browser half can be tested under Node — including the audio output,
//     through a recording fake AudioContext.

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

/** Minimal react stub: tests assert registrations and light render shapes. */
const reactStub = {
  createElement: (...args) => ({ __element: args }),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
};

/**
 * Recording fake AudioContext: every oscillator the client creates is pushed
 * to `tones`, so tests can assert which sounds played.
 */
export function createFakeAudioContext(tones) {
  return class FakeAudioContext {
    constructor() {
      this.state = "running";
      this.currentTime = 10;
      this.destination = {};
    }
    resume() {
      this.state = "running";
      return Promise.resolve();
    }
    createOscillator() {
      const osc = {
        type: "",
        frequency: { setValueAtTime() {} },
        connect() {},
        start() {},
        stop() {},
      };
      tones.push(osc);
      return osc;
    }
    createGain() {
      return {
        gain: {
          setValueAtTime() {},
          linearRampToValueAtTime() {},
          exponentialRampToValueAtTime() {},
        },
        connect() {},
      };
    }
  };
}

/**
 * Build a fake Cordis context. inject() calls its callback immediately with
 * the fake ctx (services are assumed mounted), so apply() registers
 * everything synchronously and tests can inspect it.
 */
export function createFakeCtx(services = {}) {
  const ctx = {
    namespaces: [],
    lifecycle: {},
    effects: [],
    services: { ...services },
    settings: {
      register: (ns, schema) => {
        ctx.namespaces.push({ ns, schema });
      },
    },
    on: (event, callback) => {
      (ctx.lifecycle[event] ??= []).push(callback);
    },
    effect: (fn, label) => {
      ctx.effects.push({ fn, label });
      fn(); // Cordis runs effects on registration
    },
    inject: (_deps, callback) => {
      callback(ctx);
    },
    get: (serviceName) => ctx.services[serviceName],
  };
  return ctx;
}

/** Fake settingsScope: bind() returns a scope with getSnapshot/subscribe/set. */
export function createFakeSettingsScope(initial = {}) {
  const state = { value: { ...initial } };
  const listeners = new Set();
  return {
    bind() {
      return this;
    },
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async set(field, value) {
      state.value = { ...state.value, [field]: value };
      for (const listener of [...listeners]) listener();
    },
  };
}

/**
 * Fake sessions service: `list` is a snapshot store shaped like the real
 * SessionRuntime list (getSnapshot returns { ids, byId }); tests push new
 * snapshots with `_set` to trigger the watcher notifications.
 */
export function createFakeSessions(initial = { ids: [], byId: {} }) {
  let state = initial;
  const listeners = new Set();
  return {
    list: {
      getSnapshot: () => state,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      _set(next) {
        state = next;
        for (const listener of [...listeners]) listener();
      },
    },
  };
}

/**
 * Fake client ctx for the browser half: settingsScope always mounted,
 * locale/slots/sessions mounted by default (pass false to test the graceful
 * skip).
 */
export function createFakeClientCtx({ settings = {}, locale = true, slots = true, sessions = true } = {}) {
  const ctx = {
    settingsScope: createFakeSettingsScope(settings),
    dictionaries: [],
    slotRegistrations: [],
    effects: [],
    locale: locale
      ? {
          register: (ns, dict) => {
            ctx.dictionaries.push({ ns, dict });
            return () => {};
          },
          bind: (ns) => {
            const found = ctx.dictionaries.find((d) => d.ns === ns);
            const dict = found ? found.dict.en : {};
            return (key) => dict[key] ?? key;
          },
        }
      : undefined,
    slots: slots
      ? {
          inject: (name, factory) => {
            ctx.slotRegistrations.push({ name, factory });
          },
          register: (meta, component) => ({ meta, component }),
        }
      : undefined,
    sessions: sessions ? createFakeSessions() : undefined,
    effect: (fn, label) => {
      ctx.effects.push({ fn, label });
      fn(); // Cordis runs effects on registration
    },
    get: (serviceName) =>
      serviceName === "locale"
        ? ctx.locale
        : serviceName === "slots"
          ? ctx.slots
          : serviceName === "sessions"
            ? ctx.sessions
            : undefined,
  };
  return ctx;
}

/**
 * Execute lib/client.js inside a fake `window` and return the loaded modules
 * plus the sandbox pieces tests need. The file is a classic script that calls
 * window.__ModuleLoader__.load({ id, factory }), so it runs under vm.
 * @param absolutePath Absolute path to lib/client.js.
 * @returns { modules, window, document, tones }
 *   modules  - Map of module id -> exports;
 *   window   - the sandbox window (carries the recording AudioContext);
 *   document - the sandbox document ({ hidden: false });
 *   tones    - oscillators created by the fake AudioContext during the run.
 */
export function loadClientModule(absolutePath) {
  const modules = new Map();
  const tones = [];
  const window = {
    AudioContext: createFakeAudioContext(tones),
    addEventListener() {},
    __ModuleLoader__: {
      load({ id, factory }) {
        const require = (spec) => {
          if (spec === "react") return reactStub;
          throw new Error("Unhandled require in client module: " + spec);
        };
        modules.set(id, factory(require));
      },
    },
  };
  const document = { hidden: false };
  const code = fs.readFileSync(absolutePath, "utf8");
  vm.runInNewContext(code, { window, document, console }, { filename: absolutePath });
  return { modules, window, document, tones };
}

/** Depth-first search of a reactStub element tree for a matching node. */
export function findElement(node, predicate) {
  if (node === null || node === undefined || typeof node !== "object") return undefined;
  if (Array.isArray(node.__element)) {
    if (predicate(node)) return node;
    for (const arg of node.__element) {
      const hit = findElement(arg, predicate);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

export { assert };
