// dsh-sound-notify — nodo host.
//
// Mezzo host minimale: registra il namespace di impostazioni "sound-notify"
// sul servizio `settings` (quando presente), cosicché la metà browser possa
// leggere/scrivere le preferenze (suoni on/off, volume) attraverso lo
// `settingsScope` client. Non serve nessun altro comportamento host: la
// logica di notifica sonora vive interamente nel browser (lib/client.js).
//
// La registrazione è un effetto sul fiber del plugin: alla rimozione del
// plugin il namespace viene ripulito automaticamente.

const NS = "sound-notify";

// settingsNamespace() in @deepseek-ai/dsh-settings è solo una stringa
// "brandizzata" con un pattern di validazione; lo inliniamo per tenere il
// package privo di dipendenze esterne non risolvibili dal node_modules del
// profilo.
function settingsNamespace(value) {
  if (!/^[a-z][a-z0-9-]*$/.test(value)) {
    throw new TypeError(
      'settings namespace "' + value + '" must match /^[a-z][a-z0-9-]*$/'
    );
  }
  return value;
}

// Schema del namespace, scritto come funzione chiamabile (schemastery i
// propri schema li invoca come funzioni): `settings.register(ns, schema)`
// risolve il valore con `schema(sezione)`, quindi una funzione con
// `toJSON` è sufficiente e non richiede l'import di @deepseek-ai/schemastery.
function soundNotifySchema(section) {
  const v = section ?? {};
  return {
    soundDone: typeof v.soundDone === "boolean" ? v.soundDone : true,
    soundAttention: typeof v.soundAttention === "boolean" ? v.soundAttention : true,
    onlyWhenHidden: typeof v.onlyWhenHidden === "boolean" ? v.onlyWhenHidden : false,
    volume:
      typeof v.volume === "number" && Number.isFinite(v.volume)
        ? Math.max(0, Math.min(1, v.volume))
        : 0.25,
  };
}
soundNotifySchema.toJSON = () => ({ type: "object", dict: {} });

/**
 * Plugin body (host): registra il namespace di impostazioni quando il
 * servizio `settings` è montato.
 * @param ctx - contesto cordis host.
 */
function apply(ctx) {
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.settings.register(settingsNamespace(NS), soundNotifySchema);
  });
}

export { apply };
