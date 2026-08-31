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

Il plugin è già installato nel tuo profilo web (`C:\Users\jacob\.dsh\profiles\web`):
- dipendenza `dsh-sound-notify` in `package.json` (file: → `C:\Users\jacob\Desktop\dsh-plugins\dsh-sound-notify`),
- riga `sound-notify` in `cordis.patch.yml`.

**Basta riavviare l'app**: arresta `dsh web` e rilancia. Al prossimo avvio il bundle client viene servito e montato dal loader.

Se lo installi da zero in un'altra macchina:

```sh
# 1. installa il package nel profilo (pnpm deve essere su PATH oppure usa corepack)
dsh plugin --profile web add "file:C:/percorso/dsh-sound-notify"

# 2. aggiungi la riga al cordis.patch.yml del profilo
- insert:
    - id: sound-notify
      name: 'dsh-sound-notify'

# 3. riavvia
```

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

```sh
# rimuovi la riga sound-notify da cordis.patch.yml (o commentala)
dsh plugin --profile web remove dsh-sound-notify
# riavvia dsh web
```

## Struttura

```
dsh-sound-notify/
├── package.json        # manifest con dichiarazione dsh.client (platform: web)
├── lib/
│   ├── index.js        # metà host: registra il namespace settings "sound-notify"
│   └── client.js       # metà browser (bundle ModuleLoader): audio + watcher + UI
└── test/
    └── smoke.mjs       # smoke test (node test/smoke.mjs) — 20 asserzioni
```

## Come funziona (per chi vuole modificarlo)

- Il client si sottoscrive a `ctx.sessions.list` (il list store di `SessionRuntime`): ogni `SessionSummary` espone `running` e `pendingInteraction`, e lo store notifica su ogni cambiamento. Un semplice diff tra snapshot consecutivi rileva i due bordi: `running true→false` → suono "fine"; `pendingInteraction undefined→presente` → suono "attenzione".
- La riga impostazioni è registrata nello slot `settings.general.item`; il namespace `sound-notify` è registrato dalla metà host su `settings` (schema scritto come funzione chiamabile per evitare dipendenze esterne).
