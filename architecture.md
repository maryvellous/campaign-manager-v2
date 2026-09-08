# Campaign Manager v2 — Architecture

## 1. Obiettivo

Campaign Manager v2 è una ricostruzione completa del progetto originale.

La vecchia repository resta un riferimento funzionale e storico, ma **non è una base da refactorare**. La v2 nasce su una nuova codebase, con confini chiari tra applicazione desktop, client Discord, realtime e IA.

L'obiettivo architetturale è semplice:

> costruire prima un campaign manager locale solido, poi aggiungere lavagna, realtime, Discord e IA come strati separati.

La V0.1 include anche una **vista grafo locale derivata dai wikilink**: il grafo non introduce una nuova fonte dati e non anticipa infrastruttura cloud.

---

## 2. Principi

### Local-first

La cartella della campagna sul computer del DM è la fonte autorevole dei dati persistenti.

Note, lavagne, personaggi e altri contenuti devono poter esistere e funzionare anche senza connessione Internet.

Il cloud non diventa il database principale della campagna.

### Confini espliciti

Desktop, Discord Activity, relay realtime e IA sono sistemi distinti.

Nessun componente deve conoscere dettagli interni di un altro componente quando può comunicare tramite un contratto stabile.

### Stato separato per natura

Non si mescolano:

1. **dati persistenti della campagna**;
2. **stato temporaneo della sessione live**;
3. **stato dell'interfaccia e preferenze locali**.

Queste categorie hanno cicli di vita e responsabilità differenti.

### Dati derivati ricostruibili

Indici di ricerca, backlink cache, grafo, embedding e altri dati tecnici devono essere eliminabili e rigenerabili.

Non devono mai diventare la fonte autorevole della campagna.

### IA sotto controllo dell'utente

L'IA può leggere, cercare e proporre modifiche.

Non modifica direttamente i file della campagna.

Ogni modifica persistente passa attraverso i normali servizi applicativi e, quando generata dall'IA, richiede approvazione esplicita.

### Compatibilità futura senza anticipazione

I vincoli minimi per una futura integrazione EcoGDR e per il compendio sostituibile sono definiti in `docs/FOUNDATION_GUARDRAILS.md`.

Non si introducono account, auth, sync o networking EcoGDR nella V0.1.

---

## 3. Struttura della repository

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

La repository è un monorepo TypeScript.

L'obiettivo non è massimizzare il numero di package, ma impedire dipendenze sbagliate tra parti del sistema.

Nella V0.1 si creano soltanto i package necessari; `activity`, `protocol`, `ai` e `services/relay` possono essere introdotti quando diventano reali.

---

## 4. `apps/desktop`

È il prodotto principale.

Stack previsto:

- Electron;
- React;
- TypeScript.

Responsabilità:

- apertura e gestione delle campagne;
- editor e lettura delle note;
- wikilink, backlink e navigazione;
- ricerca locale;
- graph view derivata dai wikilink;
- lavagne;
- personaggi e contenuti di campagna;
- gestione sessione live;
- configurazione del DM;
- interfaccia con l'IA;
- collegamento al relay realtime.

Il renderer React **non accede direttamente al filesystem**.

La UI invoca use case o servizi applicativi; l'accesso al sistema operativo passa attraverso il processo Electron appropriato e API tipizzate.

Esempio:

```text
UI
 ↓
CampaignService
 ↓
CampaignRepository / NoteRepository
 ↓
Filesystem adapter
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

Le regole comportamentali della V0.1 sono definite in `docs/UI_UX_SPEC_V01.md`.

---

## 5. `apps/activity`

È il client destinato ai giocatori, eseguito come Discord Activity.

Stack:

- React;
- TypeScript.

Deve essere deliberatamente piccolo.

Responsabilità:

- identificare il giocatore tramite Discord;
- entrare nella sessione live corretta;
- mostrare la board pubblicata dal DM;
- ricevere aggiornamenti realtime;
- inviare le azioni consentite al giocatore;
- mostrare eventuali dati condivisi, come scheda o token.

Non deve conoscere:

- filesystem del DM;
- API key;
- struttura interna della campagna;
- editor completo;
- indice IA;
- configurazioni private;
- note non condivise.

La Activity vede soltanto ciò che il desktop decide di pubblicare nella sessione.

L'integrazione Discord è un adapter, non il fondamento del client.

---

## 6. `services/relay`

Il relay è il punto di incontro realtime tra desktop e Activity.

Tecnologia prevista:

- Cloudflare Worker;
- Durable Objects;
- WebSocket;
- R2 per asset condivisi quando necessario.

Architettura:

```text
Desktop DM
    │
    │ WebSocket in uscita
    ▼
Cloudflare Relay
    ▲
    │ WebSocket
    │
Discord Activity
```

Il computer del DM non espone un server pubblico e non richiede tunnel.

Il relay non è il database della campagna.

Gestisce solo lo stato necessario alla sessione live:

- sessione attiva;
- peer connessi;
- board pubblicata;
- posizione dei token;
- presenza;
- eventi realtime;
- riferimenti agli asset condivisi.

Lo stato persistente della campagna continua a vivere sul desktop.

---

## 7. `packages/core`

Contiene il dominio applicativo.

Non dipende da Electron, React, Discord, Cloudflare o EcoGDR.

Esempi di moduli:

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
- contratti dei repository.

Esempi:

```ts
createNote()
renameNote()
moveToken()
publishBoard()
startSession()
```

Il dominio deve poter essere testato senza avviare Electron o un browser.

Il grafo V0.1 **non richiede un dominio autorevole separato**: nodi e archi sono una proiezione delle note e dei wikilink. Eventuali preferenze di layout del grafo sono stato locale dell'applicazione, non contenuto delle note.

---

## 8. `packages/storage`

Contiene gli adapter di persistenza locale.

Responsabilità:

- lettura e scrittura file;
- struttura della cartella campagna;
- impostazioni locali;
- bozze di recovery;
- migrazioni dei formati;
- import/export futuro;
- eventuale compatibilità con formati legacy.

Esempio:

```text
storage/
  filesystem/
  settings/
  recovery/
  migrations/
```

Il dominio conosce interfacce come:

```ts
interface NoteRepository {
  get(id: NoteId): Promise<Note>
  save(note: Note): Promise<void>
}
```

Solo `storage` sa come quella nota viene realmente salvata su disco.

Le bozze di recovery devono essere separate dai file autorevoli della campagna. Stato `saved` può essere emesso solo dopo conferma positiva del repository.

Le operazioni di eliminazione richieste dalla V0.1 devono usare un adapter che possa esprimere esplicitamente l'indisponibilità del cestino; non è ammesso un fallback silenzioso a cancellazione permanente.

---

## 9. `packages/protocol`

Definisce il protocollo condiviso tra desktop, relay e Activity nelle versioni realtime.

Contiene esclusivamente:

- tipi dei messaggi;
- schema degli eventi;
- versionamento del protocollo;
- validazione payload.

Esempi di eventi:

```text
session.join
session.leave
board.publish
board.snapshot
token.move
token.update
presence.update
error
```

Ogni messaggio deve essere esplicito e versionabile.

Il relay non deve interpretare la logica del Campaign Manager oltre ciò che serve per instradare e validare gli eventi.

Questo package non è richiesto dalla V0.1 locale solo per anticipazione.

---

## 10. `packages/ai`

L'IA è un modulo applicativo separato.

Responsabilità:

- ricerca nella campagna;
- costruzione del contesto;
- provider LLM;
- tool disponibili all'agente;
- generazione di proposte di modifica;
- diff leggibili dall'utente.

Flusso previsto:

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
CampaignService
     ↓
Storage
```

L'IA non riceve accesso arbitrario al filesystem.

### Ricerca

La prima versione deve privilegiare strumenti semplici:

- full-text search;
- BM25 o equivalente;
- indicizzazione locale.

Vector database ed embedding si aggiungono solo se una necessità concreta lo giustifica.

L'indice è sempre derivato e ricostruibile.

---

## 11. `packages/ui`

Contiene solo componenti visivi realmente condivisi quando la condivisione è utile.

Esempi:

- button;
- dialog;
- token;
- avatar;
- elementi base della board.

Non deve contenere logica di dominio.

Se desktop e Activity iniziano ad avere esigenze visive troppo diverse, è preferibile duplicare un piccolo componente piuttosto che creare un'astrazione fragile.

---

## 12. Modello dello stato

### Dati persistenti della campagna

Esempi:

- note;
- board;
- personaggi;
- asset;
- metadati campagna.

Fonte autorevole: filesystem locale.

Gestiti tramite servizi e repository.

### Stato della sessione live

Esempi:

- board attualmente pubblicata;
- token mostrati ai giocatori;
- posizioni live;
- utenti connessi;
- permessi temporanei.

Fonte autorevole durante la sessione: desktop + relay secondo il tipo di dato.

Non viene confuso con i file della campagna.

### Stato UI e preferenze locali

Esempi:

- dialog aperto;
- tab selezionata e cronologia per tab;
- cursore e posizione di lettura;
- zoom;
- pannelli e loro dimensioni;
- recenti e preferiti;
- camera, filtro e selezione del grafo;
- colori assegnati alle cartelle per la visualizzazione del grafo.

Può essere gestito con Zustand o stato React locale **solo per ciò che è realmente UI state**.

Zustand non deve diventare un contenitore universale per filesystem, dominio, rete, persistenza e UI.

Le preferenze locali per campagna non devono finire automaticamente nel frontmatter delle note.

---

## 13. Flusso di una modifica locale

Esempio: modifica di una nota.

```text
Editor React
   ↓
update buffer
   ↓
autosave / save command
   ↓
CampaignService
   ↓
NoteRepository
   ↓
Filesystem
   ↓
confirmed success / explicit error
```

Dopo il salvataggio possono partire effetti secondari:

```text
note saved
   ├─ update search index
   ├─ update backlink projection
   └─ update graph projection
```

Gli effetti secondari non devono essere mescolati alla logica primaria di salvataggio.

Un timer di debounce non può trasformare uno stato in `saved`: la conferma deve arrivare dalla persistenza.

---

## 14. Modifiche esterne e recovery

Il filesystem è autorevole, ma l'editor può avere un buffer locale non ancora persistito.

- file modificato esternamente + buffer pulito → può essere ricaricato;
- file modificato esternamente + buffer dirty → autosave sospeso, confronto esplicito, nessuna sovrascrittura automatica;
- errore di scrittura → buffer e bozza recovery conservati;
- crash → la bozza di recovery può essere proposta alla riapertura senza sovrascrivere automaticamente una versione file più recente.

La UI/UX dettagliata è definita dai requisiti `UX-SAVE-*` in `docs/UI_UX_SPEC_V01.md`.

---

## 15. Graph view come proiezione derivata

Flusso concettuale:

```text
Markdown files
   ↓
parse wikilink
   ↓
resolved note graph
   ↓
Graph View
```

Il grafo non modifica i wikilink tramite trascinamento dei nodi.

Persistenza consentita per il grafo:

- camera/pan/zoom;
- filtri;
- selezione utile da ripristinare;
- eventuali posizioni manuali dei nodi;
- colori cartella e preferenze visuali locali.

Questi dati restano separati dal contenuto Markdown.

---

## 16. Flusso realtime

Esempio futuro: il DM muove un token.

```text
Desktop UI
   ↓
SessionService
   ↓
update local live state
   ↓
protocol: token.move
   ↓
Relay
   ↓
Activity clients
```

Il protocollo deve consentire anche il recupero di uno snapshot completo in caso di riconnessione.

Non si assume che ogni client abbia ricevuto tutti gli eventi precedenti.

---

## 17. Asset condivisi

Gli asset originali possono vivere nella campagna locale.

Quando un'immagine deve essere visibile ai giocatori, il desktop può pubblicarne una copia temporanea o condivisa su R2.

Il modello deve distinguere chiaramente tra:

```text
local asset
```

e:

```text
published asset
```

La pubblicazione di un asset non cambia la fonte autorevole locale.

---

## 18. Sicurezza

Principi minimi:

- nessuna API key nel renderer della Activity;
- nessun accesso remoto diretto al filesystem del DM;
- nessuna porta pubblica aperta sul PC del DM;
- payload realtime validati;
- sessioni identificabili con token non prevedibili;
- permessi distinti tra DM e giocatore;
- contenuti privati inviati al relay solo quando esplicitamente condivisi.

Il relay deve conoscere il meno possibile.

---

## 19. Strategia di test

### Core

Test unitari estesi sui use case e sulle regole di dominio.

### Storage

Test di integrazione su directory temporanee.

Verificare almeno:

- create;
- read;
- update;
- rename;
- move;
- trash/delete behavior;
- errori di scrittura;
- conflitti esterni;
- recovery da errori comuni.

### Search / graph projection

Testare:

- rebuild da filesystem;
- wikilink risolti e mancanti;
- rename e aggiornamento riferimenti;
- note isolate;
- cartelle e sottocartelle;
- filtri e colore ereditato come dati di visualizzazione.

### Protocol

Test di validazione e compatibilità dei messaggi quando il protocollo verrà introdotto.

### Relay

Test su join/leave, broadcast, reconnect, snapshot, autorizzazione e isolamento tra sessioni quando verrà introdotto.

### Desktop e Activity

Pochi test end-to-end, concentrati sui flussi realmente critici e sugli scenari di accettazione documentati.

---

## 20. Regole sulle dipendenze

Dipendenze consentite, in forma semplificata:

```text
desktop  ─────→ core
desktop  ─────→ storage
desktop  ─────→ protocol   (quando esiste)
desktop  ─────→ ai         (quando esiste)
desktop  ─────→ ui

activity ─────→ protocol
activity ─────→ ui

relay    ─────→ protocol

ai       ─────→ core
storage  ─────→ core
```

Dipendenze da evitare:

```text
core     → React
core     → Electron
core     → Discord
core     → Cloudflare
core     → EcoGDR SDK/API

activity → storage
activity → ai

relay    → storage locale
relay    → desktop
```

---

## 21. Ordine di costruzione

L'architettura deve permettere di sviluppare il prodotto verticalmente.

### V0.1 — Campaign Manager locale

```text
apri campagna
→ leggi/modifica note
→ naviga wikilink e backlink
→ cerca
→ esplora il grafo derivato
→ salva/recovery
→ chiudi e riapri
```

### V0.2 — Lavagna locale

```text
crea board
→ aggiungi elementi
→ salva
→ chiudi
→ riapri
```

### V0.3 — Sessione live web

```text
desktop
→ relay
→ browser client
```

Prima di Discord.

### V0.4 — Discord Activity

Il client web già funzionante viene integrato dentro Discord.

### V0.5 — IA

```text
search
→ domanda
→ proposta
→ diff
→ approvazione
```

### V0.6 — Funzioni giocatore avanzate

Schede, bot, comandi e altre feature vengono valutate solo quando il nucleo è stabile.

---

## 22. Non-obiettivi iniziali

La prima fase della v2 non deve risolvere:

- sincronizzazione cloud completa della campagna;
- account o autenticazione EcoGDR;
- collaborazione multi-DM;
- editing remoto delle note;
- vector database complesso;
- marketplace di plugin;
- supporto a molte piattaforme realtime;
- compatibilità perfetta con ogni dettaglio della vecchia app;
- importazione generale di file esterni.

Queste possibilità possono essere valutate in seguito.

---

## 23. Regola finale

Ogni nuova feature deve rispondere prima a due domande:

1. **A quale dominio appartiene?**
2. **Qual è il confine attraverso cui comunica con il resto del sistema?**

Se la risposta è “mettiamola nello store globale e poi vediamo”, la feature non è ancora pronta per essere implementata.
