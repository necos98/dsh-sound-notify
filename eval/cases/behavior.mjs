// Behavior evals: scenario-level checks that run the plugin's apply() against
// a fake ctx. Deterministic and free. Run with `npm run eval`.
export const cases = [
  {
    name: "settings namespace is registered and resolves for the client",
    run(t) {
      const ctx = t.fakeCtx({});
      t.assert.equal(ctx.namespaces[0].ns, "sound-notify");
      const resolved = ctx.namespaces[0].schema({ soundDone: false, volume: 2 });
      t.assert.deepEqual(resolved, {
        soundDone: false,
        soundAttention: true,
        onlyWhenHidden: false,
        volume: 1,
      });
    },
  },
  {
    name: "config validation rejects unknown keys",
    run(t) {
      t.assert.throws(() => t.fakeCtx({ nope: true }), /unknown key\(s\) nope/);
    },
  },
  {
    name: "disabled config registers no namespace",
    run(t) {
      const ctx = t.fakeCtx({ enabled: false });
      t.assert.equal(ctx.namespaces.length, 0);
    },
  },
  {
    name: "schema defaults come from the deployment config",
    run(t) {
      const ctx = t.fakeCtx({ defaults: { volume: 0.9 } });
      t.assert.equal(ctx.namespaces[0].schema({}).volume, 0.9);
    },
  },
];
