// Behavior evals: scenario-level checks that run the plugin's apply() against
// a fake ctx. Deterministic and free. Run with `npm run eval`.
import { Config, SETTINGS_NS, resolveConfig, unwrapVolatile } from "../../lib/config.js";

/**
 * Read the schema node of one Config field. schemastery's `toJSON()` returns
 * `{ uid, refs }`; the root object node lives at `refs[uid]` and each dict entry
 * is a reference (uid key) into the same map.
 */
function fieldNode(json, key) {
  const root = json.refs[json.uid];
  const ref = root.dict[key];
  return json.refs[ref] ?? ref;
}

export const cases = [
  {
    name: "Config exposes five top-level volatile fields (the describe() gate)",
    run(t) {
      const json = Config.toJSON();
      const root = json.refs[json.uid];
      const keys = Object.keys(root.dict);
      t.assert.deepEqual(keys, [
        "enabled",
        "soundDone",
        "soundAttention",
        "onlyWhenHidden",
        "volume",
      ]);
      // dsh-settings' describe() returns [] for an entry whose volatileForm()
      // is undefined, so at least one volatile field is the difference between
      // a mounted settings row and a detached one.
      for (const key of keys) {
        t.assert.equal(fieldNode(json, key).meta.volatile, true, key + " is volatile");
      }
    },
  },
  {
    name: "the entry id is the settings namespace",
    run(t) {
      t.assert.equal(SETTINGS_NS, "dsh-sound-notify");
    },
  },
  {
    name: "a schema-resolved (volatile-wrapped) config is unwrapped before use",
    run(t) {
      const resolved = Config({ soundDone: false, volume: 0.8 });
      // Raw resolution hands back cosmokit references, not plain values.
      t.assert.equal(typeof resolved.soundDone, "object");
      t.assert.deepEqual(resolveConfig(resolved), {
        enabled: true,
        soundDone: false,
        soundAttention: true,
        onlyWhenHidden: false,
        volume: 0.8,
      });
      t.assert.equal(unwrapVolatile(resolved).volume, 0.8);
    },
  },
  {
    name: "apply wires the lifecycle hooks and no settings namespace",
    run(t) {
      const ctx = t.fakeCtx({});
      t.assert.ok((ctx.lifecycle.ready ?? []).length >= 1);
      t.assert.ok(ctx.effects.length >= 1);
      // The plugin registers no namespace itself any more.
      t.assert.equal(ctx.get("settings"), undefined);
    },
  },
  {
    name: "disabled config wires nothing",
    run(t) {
      const ctx = t.fakeCtx({ enabled: false });
      t.assert.equal((ctx.lifecycle.ready ?? []).length, 0);
      t.assert.equal(ctx.effects.length, 0);
    },
  },
  {
    name: "config validation rejects a mistyped field",
    run(t) {
      t.assert.throws(() => t.fakeCtx("nope"), /needs an object/);
    },
  },
  {
    name: "Config rejects an out-of-range volume",
    run(t) {
      t.assert.throws(() => Config({ volume: 2 }), /volume/);
    },
  },
  {
    name: "legacy nested defaults are ignored, not read as top-level config",
    run(t) {
      const resolved = resolveConfig({ defaults: { volume: 0.9 } });
      t.assert.equal(resolved.volume, 0.25);
      t.assert.equal(resolved.defaults, undefined);
    },
  },
];
