# Campaign Manager v2 — Architecture

## 1. Obiettivo

Campaign Manager v2 è una ricostruzione completa del progetto originale.

La vecchia repository resta un riferimento funzionale e storico, ma **non è una base da refactorare**. La v2 nasce su una nuova codebase con confini chiari tra desktop, storage locale, board, live session, player client, Discord e IA.

Principio:

> costruire prima un campaign manager locale solido, poi aggiungere board, realtime, Discord e IA come strati separati.

---

## 2. Principi

### Local-first

La cartella della campagna sul computer del DM è la fonte autorevole dei dati persistenti.

Note, board, personaggi e asset devono poter esistere e funzionare anche senza Internet.

### Confini espliciti

Desktop, player client, Discord adapter, relay e IA sono sistemi distinti.

### Stato separato per natura

Non si mescolano:

1. **dati persistenti della campagna**;
2. **stato temporaneo della sessione live**;
3. **stato UI e preferenze locali**.

### Dati derivati ricostruibili

Search index, backlink cache, graph e altri dati tecnici devono essere eliminabili e rigenerabili.

### IA sotto controllo

L'IA può leggere, cercare e proporre; non scrive direttamente sul filesystem. Le modifiche persistenti passano dai normali servizi applicativi con approvazione.

### Compatibilità futura senza anticipazione

EcoGDR e compendio seguono `docs/FOUNDATION_GUARDRAILS.md`; V0.1 non introduce auth/sync/networking EcoGDR.

---

## 3. Struttura repository

```text
campaign-manager-v2/

  apps/
    desktop/
    activity/

  services/
    relay/

  packages/
    core/
    storage/
    protocol/
    ai/
    ui/
```

Monorepo TypeScript.

Nella V0.1 si creano solo i package necessari. `activity`, `protocol`, `ai` e `services/relay` entrano quando diventano reali nelle rispettive versioni.

---

## 4. `apps/desktop`

Prodotto principale.

Stack:

- Electron;
- React;
- TypeScript.

Responsabilità:

- campagne locali;
- note/editor/lettura;
- wikilink/backlink;
- ricerca e graph view;
- board;
- SessionService/live controls;
- pubblicazione contenuti e asset;
- configurazione DM;
- IA futura;
- collegamento outbound al relay.

Il renderer React **non accede direttamente al filesystem**.

Forma desiderata:

```text
UI
 ↓
servizio/use case applicativo
 ↓
repository / adapter
 ↓
filesystem / network / OS
```

Non:

```text
React component
 ↓
window.fs
 ↓
localStorage
 ↓
reindex
 ↓
altro stato globale
```

Per V0.1 valgono `docs/UI_UX_SPEC_V01.md` e le specifiche verticali indicate da `docs/SPEC_INDEX.md`.

---

## 5. `apps/activity`

È il player client.

### V0.3

Funziona prima come **web client standalone**.

### V0.4

Lo stesso player client viene adattato a Discord tramite Embedded App SDK.

Stack:

- React;
- TypeScript.

Principio:

> è il lato del tavolo visto dal giocatore, non un mini Campaign Manager.

Responsabilità:

- join/resume sessione;
- waiting state;
- board pubblica;
- snapshot + eventi realtime;
- pan/zoom;
- ping;
- token autorizzati;
- asset/contenuti pubblici.

Non conosce:

- filesystem del DM;
- API key;
- vault completo;
- note private;
- search index/graph privato;
- configurazione DM;
- IA;
- asset non pubblicati.

### Ingresso standalone

Usa il session join code definito da `LIVE_SESSION_SPEC.md`.

### Ingresso Discord

Discord usa la Activity instance e il pairing master; il canale vocale non è un session ID Campaign Manager.

Specifica: `docs/DISCORD_ACTIVITY_SPEC.md`.

---

## 6. `services/relay`

Il relay coordina desktop e player client.

Tecnologia prevista:

- Cloudflare Worker come edge/router HTTP/WebSocket;
- **un Durable Object per live session**;
- WebSocket Hibernation API;
- Durable Object storage per lo stato runtime che deve sopravvivere a hibernation/restart;
- R2 per asset pubblicati temporaneamente.

Architettura:

```text
Desktop DM
    │ outbound HTTPS/WSS
    ▼
Worker / Session Durable Object
    ▲
    │ HTTPS/WSS
    │
Web Player / Discord Activity
```

Il PC del DM non apre porte pubbliche e non richiede tunnel.

### Autorità

Il relay/session backend è autorevole soltanto per **stato runtime già accettato**:

- lifecycle;
- current board;
- live board states;
- participant identity/presence;
- token assignments e posizioni live;
- ordering (`stateSeq`);
- join/pairing state;
- Discord binding;
- riferimenti ad asset pubblicati.

Non è autorevole per:

- note;
- board preparate;
- campaign metadata;
- asset originali;
- search index;
- filesystem.

### Sicurezza

Il relay valida tutte le azioni significative. Un client non diventa autorevole dichiarando `participantId`, token, ruolo, `instanceId` o `liveSessionId`.

### Hibernation

Lo stato necessario alla ricostruzione della sessione non vive esclusivamente in memoria. Per-connection metadata piccolo può usare WebSocket attachment; stato sessione più ampio usa Durable Object storage.

### Asset

R2 contiene soltanto copie/oggetti pubblicati necessari alla live session. Gli asset vengono caricati on-demand e ripuliti dopo la sessione secondo `LIVE_SESSION_SPEC.md` / `PROTOCOL_SPEC.md`.

---

## 7. `packages/core`

Contiene dominio e use case che non dipendono da React, Electron, Discord, Cloudflare o EcoGDR.

Esempi:

```text
core/
  campaign/
  notes/
  boards/
  characters/
  sessions/
```

Qui vivono:

- tipi di dominio;
- regole;
- use case;
- validazioni;
- repository/service contracts.

Esempi:

```ts
createNote()
renameNote()
createBoard()
publishBoard()
startSession()
```

Il dominio deve essere testabile senza Electron/browser.

Il dominio live non dipende dall'Embedded App SDK: Discord traduce identity/context verso i contratti live generici.

---

## 8. `packages/storage`

Adapter di persistenza locale.

Responsabilità:

- filesystem;
- note e board files;
- impostazioni locali;
- recovery;
- migrazioni;
- asset import;
- compatibilità legacy futura.

Solo storage conosce i dettagli fisici di lettura/scrittura.

Recovery resta separata dalla fonte autorevole. Stato `saved` solo dopo conferma positiva della persistenza.

Il cestino V0.1 deve poter dichiarare indisponibilità senza fallback silenzioso a delete permanente.

---

## 9. `packages/protocol`

Contratto condiviso tra desktop, relay e player client.

Specifica normativa: `docs/PROTOCOL_SPEC.md`.

Contiene:

- schema runtime;
- tipi messaggi;
- versionamento;
- message/error constants;
- validation helpers;
- contract fixtures.

Non contiene:

- React;
- filesystem;
- Discord SDK;
- implementazione Cloudflare;
- logica UI.

Concetti chiave V1:

```text
HTTPS create/join/ticket/assets
WSS realtime
requestId
stateSeq
snapshot
commands stretti
accepted/rejected
```

Il protocollo funziona nel browser standalone prima di Discord.

---

## 10. `packages/ai`

Modulo IA separato.

Flusso:

```text
Campaign data
     ↓
Search index
     ↓
AI
     ↓
Change proposal
     ↓
User approval
     ↓
servizio applicativo
     ↓
Storage
```

Nessun accesso filesystem arbitrario.

La prima versione privilegia full-text/BM25 o equivalente; vector DB/embedding solo se giustificati dall'uso reale.

---

## 11. `packages/ui`

Componenti visivi realmente condivisi quando utile.

Esempi:

- button;
- dialog;
- token;
- avatar;
- primitive board.

Nessuna logica dominio.

Se desktop e player client divergono troppo, meglio duplicare un piccolo componente che creare un'astrazione fragile.

---

## 12. Modello dello stato

### Persistente campagna

Esempi:

- note;
- `*.board.json`;
- personaggi;
- asset;
- campaign metadata.

Fonte autorevole: filesystem locale.

### Live session

Esempi:

- `liveSessionId`;
- lifecycle;
- board corrente;
- live state per board usata;
- posizioni token;
- participant presence;
- token assignments;
- join/pairing state;
- Discord binding.

Fonte autorevole runtime: desktop + relay secondo `LIVE_SESSION_SPEC.md`.

### UI/preferences

Esempi:

- tab/cursore;
- pannelli;
- recenti/preferiti;
- camera graph/board locale;
- dimensioni pannelli.

Zustand/React state è ammesso solo per vero UI state, non come contenitore universale.

---

## 13. Flusso modifica locale

Esempio nota:

```text
Editor React
→ buffer
→ autosave/save
→ servizio applicativo
→ NoteRepository
→ filesystem
→ confirmed success/error
```

Effetti secondari successivi:

```text
note saved
├─ search index
├─ backlinks
└─ graph projection
```

Un debounce non equivale a `saved`.

---

## 14. Modifiche esterne e recovery

- external change + buffer pulito → reload possibile;
- external change + dirty → conflict, autosave sospeso;
- write error → buffer/recovery conservati;
- crash → recovery proposta senza overwrite silenzioso di file più nuovo.

UI dettagliata in `UI_UX_SPEC_V01.md`; board in `BOARD_SPEC.md`.

---

## 15. Graph view

Proiezione derivata:

```text
Markdown
→ wikilink parser/resolver
→ graph projection
→ Graph View
```

Dragging nodo non modifica wikilink.

Camera, filtri e posizioni visuali restano preferenze locali.

---

## 16. Board locale e live

Board preparata:

```text
filesystem locale
→ *.board.json
```

Board live:

```text
board preparata
→ esplicita proiezione pubblica
→ session state
→ snapshot/eventi player
```

Gli elementi privati non vengono trasferiti al relay/client per essere nascosti lato UI.

Specifica: `docs/BOARD_SPEC.md`.

---

## 17. Flusso realtime

Esempio player token move:

```text
Player drag
→ token.move.preview (effimero)
→ relay valida controller
→ preview broadcast/coalesced
→ token.move.commit
→ relay valida + persiste live position
→ stateSeq incrementa
→ token.position broadcast
```

Reconnect:

```text
resume credential
→ nuovo WebSocket ticket
→ connection.ready
→ snapshot corrente
→ riprendi eventi
```

Non si assume che un client abbia ricevuto tutti gli eventi precedenti.

Spec: `LIVE_SESSION_SPEC.md` + `PROTOCOL_SPEC.md`.

---

## 18. Asset condivisi

Distinzione obbligatoria:

```text
local asset
≠
published live asset
```

Flusso:

```text
asset interno campagna
→ richiesta upload autorizzato
→ copia temporanea R2
→ publishedAssetId
→ reveal elemento
```

La pubblicazione non cambia la fonte autorevole locale.

Asset privati/non usati non vengono caricati per comodità.

---

## 19. Lifecycle live

V0.3:

- una sola live session per desktop;
- un solo host;
- una board pubblica alla volta;
- più live board states preservabili nella stessa sessione;
- host disconnect → freeze;
- grace 10 minuti;
- timeout → end senza scrittura automatica board;
- chiusura volontaria → scelta posizioni finali token;
- nessuna session history cloud.

Standalone:

```text
join code ABCD-EFGH
```

Discord:

```text
pairing ABC-DEF
→ instanceId ↔ liveSessionId
```

---

## 20. Sicurezza

Principi minimi:

- nessuna API key nel player client;
- nessun accesso remoto diretto al filesystem;
- nessuna porta pubblica sul PC DM;
- HTTPS/WSS;
- ticket WebSocket brevi/monouso;
- payload runtime validated;
- token/session credentials non prevedibili;
- permessi host/player distinti;
- contenuti privati mai inviati per filtraggio client-side;
- identity Discord e instance validate server-side;
- secret/codici/presigned URL non loggati in chiaro.

---

## 21. Strategia di test

### Core

Unit test su use case/regole.

### Storage

Integration test su directory temporanee: create/read/update/rename/move/trash/error/conflict/recovery.

### Search/graph

Rebuild, links, rename, isolate, folder/filter/color.

### Board

`BRD-*` acceptance e storage/recovery.

### Protocol

Contract test `PRO-QA-*`: schema, versioning, permission, idempotenza, `stateSeq`, snapshot/resync, asset/privacy.

### Relay/live

`LIVE-QA-*`: join, board switch, reconnect, host freeze/grace, token permission, session end, isolamento tra sessioni.

### Discord

`ACT-*`: pairing, instance binding, same session, no code player, Activity close semantics, standalone regression.

---

## 22. Dipendenze

Consentite, semplificate:

```text
desktop  ─→ core
desktop  ─→ storage
desktop  ─→ protocol   (V0.3+)
desktop  ─→ ai         (V0.5+)
desktop  ─→ ui

activity ─→ protocol
activity ─→ ui
activity ─→ Discord adapter  (V0.4 environment layer)

relay    ─→ protocol

ai       ─→ core
storage  ─→ core
```

Da evitare:

```text
core     → React/Electron/Discord/Cloudflare/EcoGDR
protocol → Discord SDK/Cloudflare implementation
activity → storage/ai
relay    → local storage/desktop implementation
```

---

## 23. Ordine di costruzione

### V0.1 — Campaign Manager locale

```text
campagna → note → links/search/graph → save/recovery
```

### V0.2 — Board locale

```text
board → elementi/asset → save/recovery
```

Fonte: `BOARD_SPEC.md`.

### V0.3 — Live web

```text
desktop → live session → relay → web player
```

Fonti: `LIVE_SESSION_SPEC.md`, `PROTOCOL_SPEC.md`, `BOARD_SPEC.md`.

### V0.4 — Discord Activity

```text
Discord instance → pairing → stesso live model V0.3
```

Fonte: `DISCORD_ACTIVITY_SPEC.md`.

### V0.5 — IA

```text
search → domanda → proposta → diff → approvazione
```

### V0.6 — Funzioni giocatore avanzate

Schede, bot e altre integrazioni soltanto dopo stabilità del nucleo.

---

## 24. Non-obiettivi iniziali

Non sono obiettivi del nucleo iniziale:

- cloud sync completa della campagna;
- account/auth EcoGDR;
- collaborazione multi-DM;
- editing remoto note;
- VTT rules engine;
- vector DB complesso;
- plugin marketplace;
- compatibilità perfetta con ogni dettaglio v1;
- replay/event log cloud della sessione;
- sessione live senza desktop host.

---

## 25. Regola finale

Ogni feature deve rispondere prima a:

1. **a quale dominio appartiene?**
2. **qual è il confine attraverso cui comunica?**

Se la risposta è “mettiamola nello store globale e poi vediamo”, la feature non è pronta.