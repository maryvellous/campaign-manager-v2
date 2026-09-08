# Campaign Manager v2 — Architecture

## 1. Obiettivo

Campaign Manager v2 è una ricostruzione completa del progetto originale.

La vecchia repository resta un riferimento funzionale e storico, ma **non è una base da refactorare**. La v2 nasce su una nuova codebase, con confini chiari tra applicazione desktop, client Discord, realtime e IA.

L'obiettivo architetturale è semplice:

> costruire prima un campaign manager locale solido, poi aggiungere lavagna, realtime, Discord e IA come strati separati.

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

1. **dati persistenti della campagna**
2. **stato temporaneo della sessione live**
3. **stato dell'interfaccia**

Queste tre categorie hanno cicli di vita e responsabilità differenti.

### Dati derivati ricostruibili

Indici di ricerca, cache, embedding e altri dati tecnici devono essere eliminabili e rigenerabili.

Non devono mai diventare la fonte autorevole della campagna.

### IA sotto controllo dell'utente

L'IA può leggere, cercare e proporre modifiche.

Non modifica direttamente i file della campagna.

Ogni modifica persistente passa attraverso i normali servizi applicativi e, quando generata dall'IA, richiede approvazione esplicita.

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

---

## 4. `apps/desktop`

È il prodotto principale.

Stack previsto:

- Electron
- React
- TypeScript

Responsabilità:

- apertura e gestione delle campagne
- editor di note
- wikilink e navigazione
- lavagne
- personaggi e contenuti di campagna
- gestione sessione live
- configurazione del DM
- interfaccia con l'IA
- collegamento al relay realtime

Il renderer React **non accede direttamente al filesystem**.

La UI invoca use case o servizi applicativi; l'accesso al sistema operativo passa attraverso il processo Electron appropriato e API tipizzate.

Esempio:

```text
UI
 ↓
CampaignService
 ↓
CampaignRepository
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

---

## 5. `apps/activity`

È il client destinato ai giocatori, eseguito come Discord Activity.

Stack:

- React
- TypeScript

Deve essere deliberatamente piccolo.

Responsabilità:

- identificare il giocatore tramite Discord
- entrare nella sessione live corretta
- mostrare la board pubblicata dal DM
- ricevere aggiornamenti realtime
- inviare le azioni consentite al giocatore
- mostrare eventuali dati condivisi, come scheda o token

Non deve conoscere:

- filesystem del DM
- API key
- struttura interna della campagna
- editor completo
- indice IA
- configurazioni private
- note non condivise

La Activity vede soltanto ciò che il desktop decide di pubblicare nella sessione.

---

## 6. `services/relay`

Il relay è il punto di incontro realtime tra desktop e Activity.

Tecnologia prevista:

- Cloudflare Worker
- Durable Objects
- WebSocket
- R2 per asset condivisi quando necessario

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

- sessione attiva
- peer connessi
- board pubblicata
- posizione dei token
- presenza
- eventi realtime
- riferimenti agli asset condivisi

Lo stato persistente della campagna continua a vivere sul desktop.

---

## 7. `packages/core`

Contiene il dominio applicativo.

Non dipende da Electron, React, Discord o Cloudflare.

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

- tipi di dominio
- regole
- use case
- validazioni
- contratti dei repository

Esempi:

```ts
createNote()
renameNote()
moveToken()
publishBoard()
startSession()
```

Il dominio deve poter essere testato senza avviare Electron o un browser.

---

## 8. `packages/storage`

Contiene gli adapter di persistenza locale.

Responsabilità:

- lettura e scrittura file
- struttura della cartella campagna
- impostazioni locali
- migrazioni dei formati
- import/export
- eventuale compatibilità con formati legacy

Esempio:

```text
storage/
  filesystem/
  settings/
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

---

## 9. `packages/protocol`

Definisce il protocollo condiviso tra desktop, relay e Activity.

Contiene esclusivamente:

- tipi dei messaggi
- schema degli eventi
- versionamento del protocollo
- validazione payload

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

---

## 10. `packages/ai`

L'IA è un modulo applicativo separato.

Responsabilità:

- ricerca nella campagna
- costruzione del contesto
- provider LLM
- tool disponibili all'agente
- generazione di proposte di modifica
- diff leggibili dall'utente

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

- full-text search
- BM25 o equivalente
- indicizzazione locale

Vector database ed embedding si aggiungono solo se una necessità concreta lo giustifica.

L'indice è sempre derivato e ricostruibile.

---

## 11. `packages/ui`

Contiene solo componenti visivi realmente condivisi tra desktop e Activity.

Esempi:

- button
- dialog
- token
- avatar
- elementi base della board

Non deve contenere logica di dominio.

Se desktop e Activity iniziano ad avere esigenze visive troppo diverse, è preferibile duplicare un piccolo componente piuttosto che creare un'astrazione fragile.

---

## 12. Modello dello stato

### Dati persistenti della campagna

Esempi:

- note
- board
- personaggi
- asset
- metadati campagna

Fonte autorevole: filesystem locale.

Gestiti tramite servizi e repository.

### Stato della sessione live

Esempi:

- board attualmente pubblicata
- token mostrati ai giocatori
- posizioni live
- utenti connessi
- permessi temporanei

Fonte autorevole durante la sessione: desktop + relay secondo il tipo di dato.

Non viene confuso con i file della campagna.

### Stato UI

Esempi:

- modal aperta
- tab selezionata
- zoom
- pannello laterale
- selezione corrente

Può essere gestito con Zustand o stato React locale.

Zustand non deve diventare un contenitore universale per filesystem, dominio, rete e UI.

---

## 13. Flusso di una modifica locale

Esempio: modifica di una nota.

```text
Editor React
   ↓
updateNote()
   ↓
CampaignService
   ↓
NoteRepository
   ↓
Filesystem
```

Dopo il salvataggio possono partire effetti secondari:

```text
note saved
   ├─ update search index
   └─ notify interested UI
```

Gli effetti secondari non devono essere mescolati alla logica primaria di salvataggio.

---

## 14. Flusso realtime

Esempio: il DM muove un token.

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

## 15. Asset condivisi

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

## 16. Sicurezza

Principi minimi:

- nessuna API key nel renderer della Activity
- nessun accesso remoto diretto al filesystem del DM
- nessuna porta pubblica aperta sul PC del DM
- payload realtime validati
- sessioni identificabili con token non prevedibili
- permessi distinti tra DM e giocatore
- contenuti privati inviati al relay solo quando esplicitamente condivisi

Il relay deve conoscere il meno possibile.

---

## 17. Strategia di test

### Core

Test unitari estesi sui use case e sulle regole di dominio.

### Storage

Test di integrazione su directory temporanee.

Verificare almeno:

- create
- read
- update
- rename
- delete
- recovery da errori comuni

### Protocol

Test di validazione e compatibilità dei messaggi.

### Relay

Test su:

- join/leave
- broadcast
- reconnect
- snapshot
- autorizzazione
- isolamento tra sessioni

### Desktop e Activity

Pochi test end-to-end, concentrati sui flussi realmente critici.

---

## 18. Regole sulle dipendenze

Dipendenze consentite, in forma semplificata:

```text
desktop  ─────→ core
desktop  ─────→ storage
desktop  ─────→ protocol
desktop  ─────→ ai
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

activity → storage
activity → ai

relay    → storage locale
relay    → desktop
```

---

## 19. Ordine di costruzione

L'architettura deve permettere di sviluppare il prodotto verticalmente.

### V0.1 — Campaign Manager locale

```text
apri campagna
→ leggi note
→ naviga wikilink
→ modifica
→ salva
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

## 20. Non-obiettivi iniziali

La prima fase della v2 non deve risolvere:

- sincronizzazione cloud completa della campagna
- collaborazione multi-DM
- editing remoto delle note
- vector database complesso
- marketplace di plugin
- supporto a molte piattaforme realtime
- compatibilità perfetta con ogni dettaglio della vecchia app

Queste possibilità possono essere valutate in seguito.

---

## 21. Regola finale

Ogni nuova feature deve rispondere prima a due domande:

1. **A quale dominio appartiene?**
2. **Qual è il confine attraverso cui comunica con il resto del sistema?**

Se la risposta è “mettiamola nello store globale e poi vediamo”, la feature non è ancora pronta per essere implementata.
