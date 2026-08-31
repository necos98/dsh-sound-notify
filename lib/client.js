window.__ModuleLoader__.load({
	id: "dsh-sound-notify",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");

		// #region dsh-sound-notify: motore audio (Web Audio API, nessuna dipendenza)
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
			// Sblocca il contesto audio al primo gesto utente (politica autoplay).
			const resume = () => {
				if (audioCtx !== null && audioCtx.state === "suspended") {
					audioCtx.resume().catch(() => {});
				}
			};
			window.addEventListener("pointerdown", resume, { once: true });
			window.addEventListener("keydown", resume, { once: true });
			return audioCtx;
		}

		/** Emette una singola nota. */
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

		/** Ding ascendente: risposta terminata. */
		function playDone(volume) {
			tone(880, 0, 0.28, "sine", 0.28 * volume);
			tone(1318.51, 0.14, 0.42, "sine", 0.22 * volume);
		}

		/** Doppio beep piu tono: serve l'input dell'utente. */
		function playAttention(volume) {
			tone(659.25, 0, 0.2, "square", 0.1 * volume);
			tone(659.25, 0.24, 0.2, "square", 0.1 * volume);
			tone(987.77, 0.48, 0.36, "sine", 0.22 * volume);
		}

		// #endregion

		// #region configurazione (default + namespace impostazioni)
		const NS = "sound-notify";
		const DEFAULT_CONFIG = {
			soundDone: true,
			soundAttention: true,
			onlyWhenHidden: false,
			volume: 0.25,
		};

		let config = { ...DEFAULT_CONFIG };

		function readConfig(snapshot) {
			const v = snapshot.value ?? {};
			config = {
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
			if (config.onlyWhenHidden && !document.hidden) return;
			if (kind === "done" && config.soundDone) playDone(config.volume);
			else if (kind === "attention" && config.soundAttention) playAttention(config.volume);
		}

		// #endregion

		// #region osservatore sessioni (tutte le sessioni)
		// SessionSummary espone running / pendingInteraction; il list store
		// (ctx.sessions.list) notifica su ogni cambiamento, quindi basta un diff.
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
				// running true -> false: il modello ha terminato (o e stato fermato).
				if (old.running && !info.running) done = true;
				// nessun pending -> pending: domanda/approvazione in attesa dell'utente.
				if (old.pending === null && info.pending !== null) attention = true;
			}
			return { done, attention };
		}

		// #endregion

		// #region riga impostazioni (settings.general.item)
		const css = "._sndRow{border-bottom:1px solid var(--dsw-alias-border-l2);flex-direction:column;gap:12px;padding:16px 0;display:flex}._sndHead{gap:8px;align-items:center;display:flex}._sndText{flex-direction:column;flex:1;gap:4px;min-width:0;padding-right:12px;display:flex}._sndTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px}._sndDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px}._sndControls{gap:16px;flex-wrap:wrap;align-items:center;display:flex}._sndPill{gap:8px;align-items:center;display:flex}._sndPillLabel{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;white-space:nowrap}._sndToggle{background:var(--dsw-alias-label-tertiary);cursor:pointer;border:none;border-radius:10px;flex:none;width:36px;height:20px;padding:0;position:relative;transition:background .15s}._sndToggle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}._sndKnob{background:var(--dsw-alias-bg-base);border-radius:50%;top:2px;left:2px;width:16px;height:16px;position:absolute;transition:transform .15s}._sndToggleOn ._sndKnob{transform:translateX(16px)}._sndVolume{gap:8px;align-items:center;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;display:flex}._sndRange{width:120px;accent-color:var(--dsw-alias-brand-primary)}._sndTest{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);cursor:pointer;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;height:28px;padding:0 12px;font-size:12px;line-height:18px;transition:background .15s}._sndTest:hover{background:var(--dsw-alias-interactive-bg-hover)}";
		const tagId = "dsh-sound-notify/SoundRow.module.css";
		if (
			typeof document !== "undefined" &&
			document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null
		) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-sound-notify";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		const C = {
			row: "_sndRow",
			head: "_sndHead",
			text: "_sndText",
			title: "_sndTitle",
			desc: "_sndDesc",
			controls: "_sndControls",
			pill: "_sndPill",
			pillLabel: "_sndPillLabel",
			toggle: "_sndToggle",
			toggleOn: "_sndToggleOn",
			knob: "_sndKnob",
			volume: "_sndVolume",
			range: "_sndRange",
			test: "_sndTest",
		};

		function Toggle({ checked, accent, onToggle }) {
			return React.createElement(
				"button",
				{
					type: "button",
					role: "switch",
					"aria-checked": checked,
					className: C.toggle + (checked ? " " + C.toggleOn : ""),
					style: checked ? { background: accent } : undefined,
					onClick: () => onToggle(!checked),
				},
				React.createElement("span", { className: C.knob })
			);
		}

		/** Riga unica nel General settings: notifiche sonore. */
		function SoundNotifyRow({ scope, t }) {
			if (scope === undefined) return null;
			// Nota: subscribe deve essere invocata col receiver corretto
			// (React chiama la callback senza `this`, e il controller usa this.store).
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
			return React.createElement(
				"div",
				{ className: C.row },
				React.createElement(
					"div",
					{ className: C.head },
					React.createElement(
						"div",
						{ className: C.text },
						React.createElement("div", { className: C.title }, t("row.title")),
						React.createElement("div", { className: C.desc }, t("row.desc"))
					)
				),
				React.createElement(
					"div",
					{ className: C.controls },
					React.createElement(
						"div",
						{ className: C.pill },
						React.createElement(Toggle, {
							checked: soundDone,
							accent: "var(--dsw-alias-state-success-primary)",
							onToggle: (next) => set("soundDone", next),
						}),
						React.createElement("span", { className: C.pillLabel }, t("done.label"))
					),
					React.createElement(
						"div",
						{ className: C.pill },
						React.createElement(Toggle, {
							checked: soundAttention,
							accent: "var(--dsw-alias-state-warn-primary)",
							onToggle: (next) => set("soundAttention", next),
						}),
						React.createElement("span", { className: C.pillLabel }, t("attention.label"))
					),
					React.createElement(
						"div",
						{ className: C.pill },
						React.createElement(Toggle, {
							checked: onlyWhenHidden,
							accent: "var(--dsw-alias-brand-primary)",
							onToggle: (next) => set("onlyWhenHidden", next),
						}),
						React.createElement("span", { className: C.pillLabel }, t("hidden.label"))
					),
					React.createElement(
						"label",
						{ className: C.volume },
						t("volume.label"),
						React.createElement("input", {
							type: "range",
							className: C.range,
							min: 0,
							max: 1,
							step: 0.05,
							value: volume,
							onChange: (event) => set("volume", Number(event.target.value)),
						}),
						React.createElement("span", null, Math.round(volume * 100) + "%")
					),
					React.createElement(
						"button",
						{
							type: "button",
							className: C.test,
							onClick: () => {
								// Il click e un gesto utente: sblocca anche il contesto audio.
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
		const inject = ["slots", "sessions", "locale", "settingsScope"];

		function apply(ctx) {
			console.log("[dsh-sound-notify] attivato");
			// 1) Preferenze: sincronizza la config con il namespace host (service iniettato).
			const scope = ctx.settingsScope.bind({ namespace: NS });
				const sync = () => readConfig(scope.getSnapshot());
			sync();
			const unsubScope = scope.subscribe(sync);
			ctx.effect(() => unsubScope, "dsh-sound-notify: settings sync");

			// 2) Osservatore sessioni: suona sui bordi running/pending.
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

			// 3) Riga impostazioni + dizionari i18n.
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
							it: {
								"row.title": "Notifiche sonore",
								"row.desc": "Suona quando il modello termina la risposta o chiede il tuo input.",
								"done.label": "Risposta terminata",
								"attention.label": "Serve il tuo input",
								"hidden.label": "Solo se nascosto",
								"volume.label": "Volume",
								"test.label": "Prova suono",
							},
						}),
					"dsh-sound-notify: dictionaries"
				);
			}

			const slots = ctx.get("slots");
			if (slots !== undefined) {
				slots.inject("settings.general.item", () =>
					slots.register(
						{
							name: "settings.general.item",
							id: "sound-notify",
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