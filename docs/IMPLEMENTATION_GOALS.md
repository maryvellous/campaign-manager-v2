# Campaign Manager v2 — Implementation Goals

## Scopo

Questo documento traduce la progettazione in **pochi goal verticali grandi** da affidare a un agente di coding.

Non aggiunge nuove feature: organizza quelle già approvate.

Regola:

> un goal deve produrre qualcosa che l'utente può usare o verificare end-to-end, non soltanto un layer interno.

Ogni goal deve:

- leggere le specifiche indicate;
- implementare codice + test + stato/errori;
- non anticipare il goal/versione successiva;
- aggiornare la documentazione soltanto se il codice scopre una contraddizione reale.

---

# V0.1 — Campaign Manager locale

Fonte principale: `V01_OPERATIONAL_SPEC.md`.

La V0.1 resta divisa nei 5 goal della roadmap:

1. **Fondazione + filesystem/campagna**
2. **Shell + note + cartelle**
3. **Editor + save + wikilink**
4. **Search + graph**
5. **UX polish + hardening**

Nota: nel Goal 2 entrano anche i due placeholder onesti:

- `Compendio` nel rail → WIP;
- `Impostazioni → Account` → account non necessario / WIP.

Nessun backend/auth/dataset viene costruito.

---

# V0.2 — Board locale

Fonti: `BOARD_SPEC.md`, storage/domain V0.1 per i principi di persistenza.

## Goal V02-1 — Documento board + superficie base

### Risultato utente

```text
Nuova board
→ nome
→ board vuota
→ aggiungi/sposta/ridimensiona testo e immagini
→ salva
→ chiudi
→ riapri identica
```

### Implementa

- `*.board.json` + schema version + `boardId`;
- create/open/rename;
- dirty/saving/saved/error/conflict;
- safe write/recovery;
- canvas infinito pan/zoom;
- Seleziona + Mano;
- testo;
- immagine;
- import asset esterno in `Assets/Board/`;
- z-order e lock;
- undo/redo minimo.

### Gate

- board persiste realmente;
- nessun path esterno nel JSON;
- asset missing non crasha;
- conflitto esterno non sovrascrive.

### Non fare

- live;
- token permission;
- griglia/fog;
- generico asset manager.

---

## Goal V02-2 — Token, collegamenti e organizzazione

### Risultato utente

```text
board
→ aggiungi token
→ aggiungi frecce/linee
→ multi-select
→ gruppi
→ lock/order
→ undo/redo
```

### Implementa

- Token tool;
- token con nome/avatar opzionale;
- Collegamento tool;
- linee libere/ancorate;
- multi-select/marquee;
- gruppi semplici;
- keyboard alternatives;
- `Centra contenuto`.

### Gate

- mappa grande può diventare `fondo + lock`;
- token funziona anche senza avatar;
- gruppo non richiede resize complesso;
- tutte le operazioni principali sono undoable.

### Non fare

- character builder;
- token-player assignment;
- combat rules.

---

## Goal V02-3 — Note/card + visibilità preparata + hardening

### Risultato utente

```text
nota → trascina → card collegata
```

oppure:

```text
seleziona estratto → Porta sulla board → card sicura
```

### Implementa

- card nota;
- card estratto snapshot;
- source rename/move/missing;
- `visibleByDefault`;
- privacy rules che serviranno al live;
- test serializzazione/import/privacy;
- polish V0.2.

### Gate

- una card estratto non riceve modifiche future private;
- source missing non perde estratto;
- nessun Markdown privato viene incorporato per errore.

### Non fare

- relay/networking;
- reveal realtime.

---

# V0.3 — Live web standalone

Fonti: `LIVE_SESSION_SPEC.md`, `PROTOCOL_SPEC.md`, `BOARD_SPEC.md`.

## Goal V03-1 — Sessione + join + waiting

### Risultato utente

```text
DM Avvia sessione
→ vede join code
→ player apre web client
→ codice + nome
→ entra in waiting
```

### Implementa

- relay/session coordinator minimo;
- create session;
- host credential/resume;
- join code;
- participant identity/resume;
- player web shell;
- waiting state;
- participant list DM;
- blocca nuovi ingressi/remove participant;
- runtime schema validation.

### Gate

- nessun account necessario;
- participant reconnect recupera identità;
- join invalido/locked produce stato chiaro;
- session data separati dal vault.

### Non fare

- Discord;
- board live;
- general auth platform.

---

## Goal V03-2 — Pubblicazione board + asset + snapshot

### Risultato utente

```text
DM pubblica board
→ player passa da waiting alla scena
→ vede solo pubblico
→ asset si caricano
→ switch board coerente
```

### Implementa

- snapshot pubblico;
- `stateSeq`;
- publish/unpublish/switch/reset;
- stato live per board;
- reveal/hide;
- asset upload on-demand + reference;
- private element exclusion;
- resync da gap via snapshot.

### Gate

- elemento privato assente dal payload;
- asset failure impedisce falso reveal riuscito;
- A→B→A conserva stato live A;
- unpublish torna a waiting.

### Non fare

- replay/event sourcing;
- asset upload del vault intero.

---

## Goal V03-3 — Token, ping e permessi

### Risultato utente

```text
DM assegna token
→ player lo trascina
→ tutti vedono la posizione accettata
```

### Implementa

- un controller player massimo per token;
- DM sempre controller;
- token move preview/commit;
- server-side permission validation;
- rejection + convergence posizione;
- ping effimero;
- `Porta tutti qui`.

### Gate

- client modificato non muove token non assegnato;
- preview persa non corrompe stato;
- commit finale converge per tutti.

### Non fare

- movement rules/griglia;
- multi-controller dello stesso token.

---

## Goal V03-4 — Host lifecycle + fine sessione + hardening

### Risultato utente

```text
host perde connessione
→ sessione freeze
→ host torna e riprende
```

oppure:

```text
Termina sessione
→ scegli posizioni token da mantenere
→ chiudi
```

### Implementa

- host_reconnecting;
- grace/timeout;
- snapshot host resume;
- end session;
- scelta posizioni finali per board;
- cleanup runtime/asset secondo policy operativa;
- test 1 host + 8 player.

### Gate

- host timeout non scrive board automaticamente;
- end invalida credenziali runtime;
- player lento/reconnect recupera via snapshot;
- tuning rete misurato, non inventato.

---

# V0.4 — Discord Activity

Fonti: `DISCORD_ACTIVITY_SPEC.md` + Live/Protocol.

## Goal V04-1 — Embedded Activity + pairing

### Risultato utente

```text
DM live attiva
→ genera pairing
→ apre Activity
→ inserisce pairing
→ istanza collegata
```

### Implementa

- Embedded App SDK adapter;
- instance context;
- pairing master-only;
- instance↔liveSession binding;
- unbound Activity state;
- code expiry/consume;
- ri-verifica API Discord correnti prima del coding.

### Gate

- unbound instance riceve zero campagna;
- pairing consumato/scaduto non riutilizzabile;
- Activity master non diventa host.

### Non fare

- bot;
- secondo protocollo;
- account Campaign Manager.

---

## Goal V04-2 — Identity/join + parity standalone

### Risultato utente

```text
player → Unisciti all'attività
→ entra direttamente nella stessa live
```

### Implementa

- identity Discord verificata server-side;
- mapping Discord user→participant;
- reconnect/rejoin;
- responsive player UX Activity;
- lifecycle instance end/new pairing;
- regression suite standalone.

### Gate

- player non digita codice;
- stessa instance = stessa live;
- spoof user ID non concede permessi;
- browser standalone resta verde.

---

# V0.5 — Assistente IA

Fonte: `AI_SPEC.md`.

## Goal V05-1 — Provider + workspace Assistente

### Risultato utente

```text
configura provider
→ apre Assistente
→ scrive domanda
→ riceve risposta semplice
```

### Implementa

- impostazioni IA;
- storage sicuro API key;
- adapter del/dei provider realmente supportati;
- central assistant view;
- composer/cancel/error states;
- thread locale singolo per campagna.

### Gate

- nessun provider → app normale;
- key non nel vault;
- provider offline non degrada note/board.

### Non fare

- arbitrary endpoint console;
- agent framework;
- account Campaign Manager obbligatorio.

---

## Goal V05-2 — Retrieval + Q&A verificabile

### Risultato utente

```text
domanda
→ ricerca vault
→ risposta
→ Fonti usate cliccabili
```

### Implementa

- search/read use case controllati;
- contesto campagna/nota/selezione;
- context selection;
- fonti reali;
- context-too-large handling;
- privacy notice first use.

### Gate

- note non lette non vengono citate come fonti;
- niente intero vault inviato automaticamente;
- BM25/lessicale sufficiente come prima baseline.

### Non fare

- vector DB salvo evidenza misurata;
- browser/web tool generico.

---

## Goal V05-3 — Proposte + approvazione

### Risultato utente

```text
IA propone edit/new note
→ diff/anteprima
→ utente Applica/Modifica/Scarta
→ normale save/create
```

### Implementa

- edit proposal singola nota;
- new-note proposal;
- base revision/stale detection;
- edit proposta prima di apply;
- normal save conflict integration.

### Gate

- nessun write senza gesto esplicito;
- stale proposal non sovrascrive;
- no delete/rename/move/bulk apply tools.

---

# V0.6 — Personaggi + ganci integrazione

Fonte: `V06_CHARACTERS_INTEGRATIONS_SPEC.md`.

## Goal V06-1 — Token ↔ nota personaggio

### Risultato utente

```text
token → Collega nota personaggio… → Nyx.md
```

oppure:

```text
Nyx.md → Crea token da questa nota…
```

### Implementa

- `characterNoteId?` nel token;
- link/unlink/apri nota;
- create token from note;
- rename/move remap;
- source missing warning;
- privacy player.

### Gate

- nessun character DB;
- token generic restano invariati;
- player non riceve NoteId/Markdown.

---

## Goal V06-2 — Integration seam, non provider finto

### Risultato

Il codice ha un bordo chiaro per aggiungere un vero provider personaggio senza toccare core note/board.

### Implementa soltanto se utile al primo provider imminente

- service/adapter boundary minimale;
- UI integration slot nascosta finché nessun provider reale è disponibile.

### Gate

- nessun fake EcoGDR/BeFolder;
- nessun plugin framework;
- nessuna sync continua;
- auth resta opzionale e contestuale.

---

# Milestone cloud futuro — quando backend e dataset esistono

Fonti: `AUTHENTICATION_SPEC.md`, `COMPENDIUM_SPEC.md`.

## Goal CLOUD-1 — Attiva auth reale (solo se necessaria)

```text
Impostazioni Account / feature cloud
→ Accedi
→ browser/system auth
→ ritorno alla feature
```

Gate:

- startup locale senza login;
- logout/expiry non bloccano vault;
- token fuori dal vault/player.

Se il Compendio non richiede account, questo goal può essere rimandato ancora.

## Goal CLOUD-2 — Compendio reale

```text
Compendio
→ search/explore reale
→ dettaglio
→ Copia nelle note
```

Gate:

- read-only fonte cloud;
- copy = normale Markdown indipendente;
- offline compendio non blocca campagna;
- schema/search/filter progettati contro dataset reale.

---

# Milestone EcoGDR futuro

Fonte: `ECOGDR_INTEGRATION_SPEC.md`.

## Goal ECO-1 — Binding soltanto

```text
Impostazioni → Integrazioni → EcoGDR
→ Collega campagna
→ scegli remota
→ conferma
```

Gate:

- binding non modifica contenuti;
- scollega non elimina dati;
- offline/auth failure non blocca locale.

## Goal ECO-N — Operazioni dati successive

`Importa`, `Pubblica`, `Aggiorna`, sync o altre operazioni **non appartengono automaticamente a ECO-1**.

Ognuna riceve un proprio goal/spec soltanto dopo che API e casi d'uso sono reali.

---

# Template per un prompt di coding

```text
Implementa <GOAL-ID> di Campaign Manager v2.

Fonti normative:
- <spec 1>
- <spec 2>

Risultato utente:
<flow>

Gate obbligatori:
<acceptance>

Non fare:
<scope escluso>

Scegli liberamente i dettagli interni che non cambiano il comportamento approvato e preferisci la soluzione più semplice.
```

---

## Regola finale

Questi goal sono abbastanza grandi da produrre valore e abbastanza piccoli da poter essere verificati.

Se durante il coding nasce il bisogno di creare cinque nuovi layer per completare un goal, prima verificare che non si stia risolvendo una versione futura.