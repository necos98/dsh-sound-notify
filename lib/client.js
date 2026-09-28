// dsh-sound-notify — browser half (web).
//
// Plays synthesized sounds (Web Audio API, no assets) when the model finishes
// responding or asks for your input, and renders one row in the General
// settings with the sound preferences. Uses four client services:
// configForms (the settings domain service that owns this entry's shared
// config), locale (i18n dictionaries), slots (UI injection points) and
// sessions (the session list store it watches).
//
// The factory is CommonJS-style on purpose: the client bundle is loaded by
// window.__ModuleLoader__ and gets react through require(), not import.
// No build step: this file is served as-is.

window.__ModuleLoader__.load({
  id: "dsh-sound-notify",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");

    // #region audio engine (Web Audio API, no dependencies)
    let audioCtx = null;

    function ensureAudio() {
      if (audioCtx !== null) return audioCtx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        audioCtx = new AC();
      } catch (error) {
        return null;
      }
      // Browsers only allow audio after a user gesture: unlock the context on
      // the first pointer/key event.
      const resume = () => {
        if (audioCtx !== null && audioCtx.state === "suspended") {
          audioCtx.resume().catch(() => {});
        }
      };
      window.addEventListener("pointerdown", resume, { once: true });
      window.addEventListener("keydown", resume, { once: true });
      return audioCtx;
    }

    /** Play a single note on the shared context. */
    function tone(freq, start, dur, type, gain) {
      const c = ensureAudio();
      if (c === null) return;
      if (c.state === "suspended") c.resume().catch(() => {});
      const t0 = c.currentTime + start;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.06);
    }

    /** Ascending ding: the model finished responding. */
    function playDone(volume) {
      tone(880, 0, 0.28, "sine", 0.28 * volume);
      tone(1318.51, 0.14, 0.42, "sine", 0.22 * volume);
    }

    /** Double beep plus a tone: the model is waiting for your input. */
    function playAttention(volume) {
      tone(659.25, 0, 0.2, "square", 0.1 * volume);
      tone(659.25, 0.24, 0.2, "square", 0.1 * volume);
      tone(987.77, 0.48, 0.36, "sine", 0.22 * volume);
    }
    // #endregion

    // #region configuration (defaults + settings namespace)
    // Locale/UI namespace: the i18n dictionary key and the slot id.
    const NS = "sound-notify";
    // Settings namespace: the id of this plugin's Cordis patch row
    // (cordis.patch.yml). Since DSH 0.1.7-rc.2 a plugin does not register a
    // namespace itself — `settings.describe()` publishes one namespace per live
    // entry, keyed by the entry id, and the host half's volatile `Config` fields
    // are what appear in it. The browser half reads and writes it through
    // `ctx.configForms.get(SETTINGS_NS)`; the former `settingsScope` service and
    // `settings.register(ns, schema)` no longer exist.
    const SETTINGS_NS = "dsh-sound-notify";
    // The settings form is a flat projection of the host Config's volatile
    // fields, so every key below is read from the TOP LEVEL of the snapshot
    // value — never from a nested `defaults` block.
    const DEFAULT_CONFIG = {
      enabled: true,
      soundDone: true,
      soundAttention: true,
      onlyWhenHidden: false,
      volume: 0.25,
    };

    let config = { ...DEFAULT_CONFIG };

    function readConfig(snapshot) {
      const v = snapshot.value ?? {};
      config = {
        enabled: v.enabled !== false,
        soundDone: v.soundDone !== false,
        soundAttention: v.soundAttention !== false,
        onlyWhenHidden: v.onlyWhenHidden === true,
        volume:
          typeof v.volume === "number" && Number.isFinite(v.volume)
            ? Math.max(0, Math.min(1, v.volume))
            : DEFAULT_CONFIG.volume,
      };
    }

    function maybePlay(kind) {
      if (!config.enabled) return; // deployment kill switch
      if (config.onlyWhenHidden && !document.hidden) return;
      if (kind === "done" && config.soundDone) playDone(config.volume);
      else if (kind === "attention" && config.soundAttention) playAttention(config.volume);
    }
    // #endregion

    // #region session watcher (all sessions)
    // Every SessionSummary exposes running / pendingInteraction; the list
    // store (ctx.sessions.list) notifies on any change, so a diff between
    // consecutive snapshots detects the two edges.
    function derive(state) {
      const out = new Map();
      for (const id of state.ids) {
        const s = state.byId[id];
        if (s === undefined) continue;
        out.set(id, {
          running: s.running === true,
          pending: s.pendingInteraction ?? null,
        });
      }
      return out;
    }

    function diff(prev, next) {
      let done = false;
      let attention = false;
      for (const [id, info] of next) {
        const old = prev.get(id);
        if (old === undefined) continue;
        // running true -> false: the model finished (or was stopped).
        if (old.running && !info.running) done = true;
        // no pending -> pending: a question/approval is waiting for the user.
        if (old.pending === null && info.pending !== null) attention = true;
      }
      return { done, attention };
    }
    // #endregion

    // #region settings row (settings.general.item)
    function SoundNotifyRow({ scope, t }) {
      if (scope === undefined) return null;
      // subscribe must be called with the right receiver (React calls the
      // callback without `this` and the controller uses this.store).
      const snapshot = React.useSyncExternalStore(
        (listener) => scope.subscribe(listener),
        () => scope.getSnapshot()
      );
      const v = snapshot.value ?? {};
      const soundDone = v.soundDone !== false;
      const soundAttention = v.soundAttention !== false;
      const onlyWhenHidden = v.onlyWhenHidden === true;
      const volume =
        typeof v.volume === "number" && Number.isFinite(v.volume)
          ? Math.max(0, Math.min(1, v.volume))
          : DEFAULT_CONFIG.volume;
      const set = (field, value) => {
        scope.set(field, value).catch(() => {});
      };

      const styles = {
        row: {
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: "16px 0",
          borderBottom: "1px solid var(--dsw-alias-border-l2)",
        },
        head: { display: "flex", alignItems: "center", gap: 8 },
        text: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4, paddingRight: 12 },
        title: { color: "var(--dsw-alias-label-primary)", fontSize: 14, lineHeight: "22px" },
        desc: { color: "var(--dsw-alias-label-tertiary)", fontSize: 12, lineHeight: "18px" },
        controls: { display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" },
        pill: { display: "flex", gap: 8, alignItems: "center" },
        pillLabel: { color: "var(--dsw-alias-label-secondary)", fontSize: 12, lineHeight: "18px", whiteSpace: "nowrap" },
        volume: { display: "flex", gap: 8, alignItems: "center", color: "var(--dsw-alias-label-secondary)", fontSize: 12, lineHeight: "18px" },
        range: { width: 120, accentColor: "var(--dsw-alias-brand-primary)" },
        test: {
          background: "var(--dsw-alias-bg-module-platform)",
          color: "var(--dsw-alias-label-primary)",
          border: "1px solid var(--dsw-alias-border-l2)",
          borderRadius: 14,
          height: 28,
          padding: "0 12px",
          fontSize: 12,
          lineHeight: "18px",
          cursor: "pointer",
        },
      };

      const toggle = (checked, accent, onToggle) =>
        React.createElement(
          "button",
          {
            type: "button",
            role: "switch",
            "aria-checked": checked,
            style: {
              background: checked ? accent : "var(--dsw-alias-label-tertiary)",
              border: "none",
              borderRadius: 10,
              width: 36,
              height: 20,
              position: "relative",
              cursor: "pointer",
              padding: 0,
            },
            onClick: () => onToggle(!checked),
          },
          React.createElement("span", {
            style: {
              background: "var(--dsw-alias-bg-base)",
              borderRadius: "50%",
              width: 16,
              height: 16,
              position: "absolute",
              top: 2,
              left: checked ? 18 : 2,
              transition: "left .15s",
            },
          })
        );

      return React.createElement(
        "div",
        { style: styles.row },
        React.createElement(
          "div",
          { style: styles.head },
          React.createElement(
            "div",
            { style: styles.text },
            React.createElement("div", { style: styles.title }, t("row.title")),
            React.createElement("div", { style: styles.desc }, t("row.desc"))
          )
        ),
        React.createElement(
          "div",
          { style: styles.controls },
          React.createElement(
            "div",
            { style: styles.pill },
            toggle(soundDone, "var(--dsw-alias-state-success-primary)", (next) => set("soundDone", next)),
            React.createElement("span", { style: styles.pillLabel }, t("done.label"))
          ),
          React.createElement(
            "div",
            { style: styles.pill },
            toggle(soundAttention, "var(--dsw-alias-state-warn-primary)", (next) => set("soundAttention", next)),
            React.createElement("span", { style: styles.pillLabel }, t("attention.label"))
          ),
          React.createElement(
            "div",
            { style: styles.pill },
            toggle(onlyWhenHidden, "var(--dsw-alias-brand-primary)", (next) => set("onlyWhenHidden", next)),
            React.createElement("span", { style: styles.pillLabel }, t("hidden.label"))
          ),
          React.createElement(
            "label",
            { style: styles.volume },
            t("volume.label"),
            React.createElement("input", {
              type: "range",
              min: 0,
              max: 1,
              step: 0.05,
              style: styles.range,
              value: volume,
              onChange: (event) => set("volume", Number(event.target.value)),
            }),
            React.createElement("span", null, Math.round(volume * 100) + "%")
          ),
          React.createElement(
            "button",
            {
              type: "button",
              style: styles.test,
              onClick: () => {
                // The click is a user gesture: it also unlocks the audio context.
                playDone(volume);
                playAttention(volume);
              },
            },
            t("test.label")
          )
        )
      );
    }
    // #endregion

    // #region plugin body
    // `configForms` is the settings domain's service: it owns the Host
    // configuration mirror and the per-entry write queue. It replaces the
    // removed `settingsScope` service.
    const inject = ["slots", "sessions", "locale", "configForms"];

    function apply(ctx) {
      console.log("[dsh-sound-notify] client activated");

      // 1) Configuration: read this entry's Config form. Without a live Config
      //    form (no volatile field on the host schema, or a drifted entry id)
      //    the snapshot value stays undefined and readConfig() silently falls
      //    back to the built-in defaults.
      const scope = ctx.configForms.get(SETTINGS_NS);
      const sync = () => readConfig(scope.getSnapshot());
      sync();
      const unsubScope = scope.subscribe(sync);
      ctx.effect(() => unsubScope, "dsh-sound-notify: settings sync");

      // 2) Session watcher: play sounds on running/pending edges.
      const sessions = ctx.get("sessions");
      if (sessions !== undefined) {
        const list = sessions.list;
        let prev = derive(list.getSnapshot());
        const unsubList = list.subscribe(() => {
          const next = derive(list.getSnapshot());
          const ev = diff(prev, next);
          if (ev.done) maybePlay("done");
          if (ev.attention) maybePlay("attention");
          prev = next;
        });
        ctx.effect(() => unsubList, "dsh-sound-notify: session watcher");
      }

      // 3) i18n dictionaries.
      const locale = ctx.get("locale");
      if (locale !== undefined) {
        ctx.effect(
          () =>
            locale.register(NS, {
              en: {
                "row.title": "Sound notifications",
                "row.desc": "Beep when the model finishes responding or asks for your input.",
                "done.label": "Response finished",
                "attention.label": "Input needed",
                "hidden.label": "Only when hidden",
                "volume.label": "Volume",
                "test.label": "Test sound",
              },
              // Add more locales here as needed.
            }),
          "dsh-sound-notify: dictionaries"
        );
      }

      // 4) UI slot: one row in General settings.
      const slots = ctx.get("slots");
      if (slots !== undefined) {
        const t = locale !== undefined ? locale.bind(NS) : (key) => key;
        slots.inject("settings.general.item", () =>
          slots.register(
            {
              name: "settings.general.item",
              id: "dsh-sound-notify",
              order: 90,
              locale: NS,
              inject: () => ({ scope }),
            },
            SoundNotifyRow
          )
        );
      }
    }
    // #endregion

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
