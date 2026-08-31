# dsh-sound-notify

Plugin per **DeepSeek Harness (DSH, profilo web)** che emette un **suono nel browser** quando:

1. il modello **finisce di rispondere** (la sessione passa da *in esecuzione* a *ferma* — incluso il caso di una sessione in background), oppure
2. il modello **chiede il tuo input**: domande (`ask_user_question`), approvazioni di tool (`approval/requested`) o plan-review.

Tutto avviene lato client (Web Audio API, nessuna dipendenza, nessun file audio): i suoni sono sintetizzati come toni.

## Cosa fa esattamente

| Situazione | Suono |
| --- | --- |
| Il modello termina la risposta (turno finito) | "ding" ascendente (2 note) |
| Il modello pone una domanda / serve un'approvazione | doppio beep + tono (3 note) |
| Cancelli un turno o il turno finisce con errore | stesso suono di "fine" (il turno è comunque terminato) |

## Installazione

Installazione **automatica**: il plugin dichiara `dsh.bundle.patch`, quindi
`dsh plugin add` lo installa nel profilo **e** lo registra da solo come layer
(`dsh.profile.bundles` in `package.json` del profilo). Non serve modificare a
mano il `cordis.patch.yml` del profilo.

```sh
# 1. installa (pnpm deve essere su PATH oppure usa corepack)
dsh plugin --profile web add "file:C:/percorso/dsh-sound-notify"

# 2. riavvia l'app: arresta `dsh web` e rilancia
```

La riga di montaggio vive nel `cordis.patch.yml` del pacchetto e viene
applicata automaticamente come bundle layer al boot.

> **Migrazione dal vecchio metodo manuale** (riga `sound-notify` aggiunta a
> mano nel `cordis.patch.yml` del profilo): rilancia `dsh plugin add` come
> sopra — la CLI sposta il plugin in `dsh.profile.bundles` — poi rimuovi la
> riga manuale dal `cordis.patch.yml` del profilo per evitare un insert
> duplicato.

## Impostazioni

Apri **Settings → General**: appare la riga "Notifiche sonore" con:

- **Risposta terminata** — toggle (default: on)
- **Serve il tuo input** — toggle (default: on)
- **Solo se nascosto** — suona solo quando la scheda del browser non è visibile (default: off)
- **Volume** — slider 0–100% (default 25%)
- **Prova suono** — riproduce entrambi i suoni (utile anche per sbloccare l'audio del browser)

Le preferenze sono salvate nel documento di impostazioni dell'host (namespace `sound-notify`).

## Note

- **Autoplay dei browser**: il suono può partire solo dopo un primo gesto dell'utente sulla pagina (click/tasto). Il plugin sblocca automaticamente l'`AudioContext` al primo click; il pulsante "Prova suono" nelle impostazioni sblocca e riproduce subito.
- I suoni coprono **tutte** le sessioni (anche quelle in background), non solo quella selezionata.
- Niente log di rete: il plugin gira interamente nel browser; la sola comunicazione con l'host è il namespace di impostazioni.

## Rimozione

Anche qui è tutto automatico: `dsh plugin remove` disinstalla e il reconcile
toglie il plugin da `dsh.profile.bundles`.

```sh
dsh plugin --profile web remove dsh-sound-notify
# riavvia dsh web
```

## Struttura

```
dsh-sound-notify/
├── package.json        # manifest: dichiara dsh.bundle.patch + dsh.client (platform: web)
├── cordis.patch.yml    # bundle patch layer: monta il plugin (id: sound-notify)
├── lib/
│   ├── index.js        # metà host: registra il namespace settings "sound-notify"
│   └── client.js       # metà browser (bundle ModuleLoader): audio + watcher + UI
└── test/
    └── smoke.mjs       # smoke test (node test/smoke.mjs) — 20 asserzioni
```

## Come funziona (per chi vuole modificarlo)

- Il client si sottoscrive a `ctx.sessions.list` (il list store di `SessionRuntime`): ogni `SessionSummary` espone `running` e `pendingInteraction`, e lo store notifica su ogni cambiamento. Un semplice diff tra snapshot consecutivi rileva i due bordi: `running true→false` → suono "fine"; `pendingInteraction undefined→presente` → suono "attenzione".
- La riga impostazioni è registrata nello slot `settings.general.item`; il namespace `sound-notify` è registrato dalla metà host su `settings` (schema scritto come funzione chiamabile per evitare dipendenze esterne).
