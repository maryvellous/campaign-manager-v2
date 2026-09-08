# Campaign Manager v2 — Roadmap operativa

## Principio

La roadmap descrive **ordine logico e comportamento atteso**, non burocrazia.

Le sotto-attività sono checklist dentro pochi goal verticali. Non devono diventare automaticamente un branch, prompt, package o micro-progetto ciascuna.

Regole trasversali:

1. ogni versione deve essere usabile e verificabile prima della successiva;
2. niente infrastruttura di una versione futura per “sicurezza”;
3. local-first resta il default anche quando arrivano servizi cloud;
4. nessuna sincronizzazione, pubblicazione o modifica implicita;
5. quando una feature futura non ha ancora un backend/dataset reale, si costruisce al massimo il **gancio + UI onesta**, non una simulazione costosa.

---

# V0.1 — Campaign Manager locale

Fonte normativa principale: `docs/V01_OPERATIONAL_SPEC.md`.

Supporto ufficiale iniziale: **Windows**.

Flusso prodotto:

```text
apri app
→ apri/inizializza cartella campagna
→ organizza note e cartelle
→ scrivi Markdown
→ collega con wikilink
→ cerca / naviga / usa il grafo
→ chiudi
→ riapri senza perdere nulla
```

La V0.1 non richiede Internet, account, Discord, relay o IA.

## Goal 1 — Fondazione + filesystem/campagna

### Costruisce

- workspace Electron/React/TypeScript;
- build/test/lint;
- preload/IPC sicuro;
- apertura cartella;
- auto-init `campaign.json` minimo;
- `CampaignId` e recent paths;
- path policy Windows/portability-first;
- filesystem repository/adapter;
- safe save + `NoteRevision`;
- conflict protection;
- system trash;
- watcher modifiche esterne;
- recovery semplice;
- preferenze locali separate.

### Flusso

```text
Apri cartella…
→ valida leggibilità/scrivibilità
→ campaign.json?
   sì → apri
   no → crea metadata minimi
→ discovery note/cartelle
→ shell
```

### Stati/errore

- cartella non leggibile/scrivibile → apertura bloccata, scegli altra cartella/riprova;
- `campaign.json` invalido/futuro → nessun overwrite;
- stesso CampaignId in due path reali → proposta `Usa come copia indipendente`;
- root spostata/smontata mentre aperta → sospendi write, conserva buffer, `Individua cartella…`;
- disk full/permission error → nessun falso `saved`, buffer protetto.

### Gate

- app avviabile;
- una campagna reale può essere aperta e riaperta;
- i save sono verificabili sul filesystem;
- nessun overwrite concorrente silenzioso;
- il vault resta comprensibile senza app.

---

## Goal 2 — Shell + note + cartelle

### Costruisce

- top bar;
- rail/sidebar/center/inspector;
- Note, Ricerca, Grafo, Recenti, Preferiti, Impostazioni;
- destinazione `Compendio` come placeholder WIP secondo `COMPENDIUM_SPEC.md`;
- `Impostazioni → Account` come placeholder secondo `AUTHENTICATION_SPEC.md`;
- recenti/preferiti;
- CRUD completo cartelle;
- nuova nota come draft;
- titolo automatico dalle prime 1–3 parole;
- tab/history;
- rename/move/trash;
- command palette base.

### Flusso nuova nota

```text
Nuova nota
→ editor vuoto temporaneo
→ scrivi
→ prima materializzazione
→ titolo dalle prime 1–3 parole
→ file reale
```

Draft vuoto abbandonato → nessun file.

Collisione titolo → nessun `(2)` automatico; draft resta intatto e l'utente corregge il titolo.

### Flusso cartelle

```text
crea / rinomina / sposta / cestina
→ valida path/collisioni
→ flush note coinvolte
→ operazione reale
→ refresh explorer
```

### Placeholder cloud attuali

**Compendio:** schermata neutra `In arrivo`, nessun dataset/rete/login.

**Account:** `Non serve un account per usare Campaign Manager`, nessun pulsante login finto.

### Gate

- flusso quotidiano rapido e prevedibile;
- nessuna funzione placeholder finge di essere attiva;
- nessun modal tecnico non necessario.

---

## Goal 3 — Editor + save + wikilink

### Costruisce

- Markdown editor/read mode;
- CommonMark + GFM;
- autosave;
- recovery;
- conflict flow;
- link Markdown sicuri;
- wikilink canonicali;
- missing/ambiguous;
- backlink;
- rename/move con rewrite sicuro;
- piccolo repair record se una operazione multi-file resta incompleta.

### Flusso save

```text
edit
→ dirty
→ autosave / Ctrl+S
→ verifica revisione
→ safe write
→ saved
```

Revisione disco cambiata → `conflict`, autosave sospeso, entrambe le versioni disponibili.

### Flusso wikilink

```text
[[Nota]]
→ unique → apri
→ missing → offri Crea nota
→ ambiguous → picker, mai scelta arbitraria
```

### Rename/move

```text
prepara old→new + link da correggere
→ piccolo repair record
→ move fisico
→ aggiorna link ancora sicuri
→ refresh runtime/proiezioni
```

Nessun transaction engine generico.

### Gate

- nessun percorso normale perde modifiche;
- un conflitto non sovrascrive il file esterno;
- rename/move non inventa target per link ambigui;
- crash durante rename/move è rilevabile/riparabile.

---

## Goal 4 — Search + graph

### Costruisce

- filtro sidebar;
- full-text locale derivato;
- command palette note + azioni;
- graph derivato dai wikilink;
- colori cartella;
- filtri folder;
- camera/stato grafo locale utile.

### Search

```text
Ricerca
→ query
→ indice locale
→ risultati titolo/path/snippet
→ apri nota
```

Indice missing/corrotto → campagna continua a funzionare → rebuild.

### Graph

```text
note + wikilink risolti
→ proiezione grafo
→ filtri/cartelle
→ apri nota
```

Il grafo non modifica i Markdown.

### Limiti

Non include:

- alias/frontmatter applicativi;
- embeddings;
- vector DB;
- query language avanzata.

### Gate

- search/backlink/graph possono essere cancellati e ricostruiti;
- 200 note / 15 cartelle = fixture minima;
- dataset più grandi = stress test informativo, non gate arbitrario.

---

## Goal 5 — UX polish + hardening

### Verifica

- design direction;
- focus/keyboard/accessibilità;
- 1440×900, 1024×768, 720×600;
- zoom/testo 200%;
- empty/loading/error states;
- crash/recovery smoke test;
- packaging Windows;
- case-only rename;
- watcher;
- trash;
- root spostata/non disponibile;
- preference corruption.

### Gate finale V0.1

- flussi critici E2E verdi;
- nessun bug noto che può perdere dati;
- nessun falso `saved`;
- placeholder Account/Compendio non fanno rete;
- documentazione normativa coerente col codice reale.

---

# V0.2 — Board locale

Fonte: `docs/BOARD_SPEC.md`.

Flusso prodotto:

```text
crea board
→ aggiungi testo / immagini / token / card
→ organizza
→ salva
→ chiudi
→ riapri
```

## Costruisce

- `*.board.json` portabile;
- sei strumenti master;
- testo semplice;
- immagini;
- token;
- collegamenti;
- card nota + card da estratto;
- import automatico asset esterni in `Assets/Board/`;
- z-order;
- lock;
- gruppi semplici;
- undo/redo;
- autosave/recovery/conflict;
- `visibleByDefault` per la futura proiezione live.

## Flussi chiave

### Immagine esterna

```text
trascina file
→ copia/import nella campagna
→ riferimento relativo
→ elemento board
```

Eliminare l'elemento non cancella l'asset.

### Estratto nota

```text
seleziona testo nella nota
→ Porta sulla board
→ card con titolo + solo estratto
```

La card è snapshot editoriale: non si aggiorna automaticamente dalla nota privata.

### Mappa

```text
aggiungi immagine grande
→ porta in fondo
→ blocca
```

Nessun tipo `background` speciale necessario.

## Stati/errori

- `dirty/saving/saved/error/conflict`;
- asset mancante → placeholder/warning, board apre comunque;
- import fallito → nessun elemento rotto creato;
- source note mancante → card resta con estratto;
- elementi fuori vista → `Centra contenuto`.

## Fuori scope

- griglia tattica/snap;
- fog avanzato;
- distanze;
- iniziativa/dadi;
- line of sight/illuminazione;
- macro/rules automation.

## Gate V0.2

- board affidabile offline;
- nessun path assoluto esterno persistente;
- nessun leak di Markdown privato;
- save/recovery reali;
- undo/redo sulle operazioni preparate principali.

---

# V0.3 — Live session web standalone

Fonti:

- `docs/BOARD_SPEC.md`;
- `docs/LIVE_SESSION_SPEC.md`;
- `docs/PROTOCOL_SPEC.md`.

Flusso prodotto:

```text
DM: Avvia sessione
→ join code web
→ player entra da browser
→ waiting state
→ DM pubblica board
→ token/ping/reveal
→ reconnect/switch board
→ termina sessione
```

V0.3 **non contiene Discord pairing e non richiede account applicativo**.

## Avvio

```text
Avvia sessione
→ crea liveSession + host credential
→ genera join code
→ waiting
```

Una live session attiva per desktop; un solo host DM.

## Join player

```text
codice
→ nome visualizzato
→ participantId runtime
→ snapshot
```

Con codice valido non serve approvazione uno-per-uno.

Il DM può bloccare nuovi ingressi/rimuovere partecipanti.

## Board live

- una board visibile alla volta;
- più board mantengono stato live nella stessa sessione;
- privati non vengono inviati;
- reveal pubblica solo ciò che serve;
- asset vengono caricati on-demand prima del reveal;
- `Smetti di condividere` → waiting senza chiudere sessione;
- `Reimposta live da board preparata` è esplicito.

## Token

- un giocatore può controllare più token;
- un token = massimo un controller giocatore;
- DM controlla sempre tutti;
- server valida sempre il movimento;
- preview drag può essere effimera, commit finale autorevole.

## Reconnect

```text
perdita connessione player
→ resume credential
→ stesso participantId
→ snapshot corrente
```

Nessun replay completo obbligatorio.

## Host disconnect

```text
host cade
→ sessione congelata
→ ultimo stato visibile
→ grace 10 minuti
→ host torna: resume
   oppure timeout: session ended
```

Il timeout non scrive automaticamente posizioni live nelle board.

## Fine sessione

Se token si sono mossi:

```text
Termina sessione
→ per board modificata: salva posizioni finali? sì/no
→ chiudi runtime
```

Reveal, ping, partecipanti e permessi non vengono salvati nella board preparata.

## Protocollo essenziale

- HTTPS per create/join/resume/assets/connessione;
- WSS per realtime;
- runtime schema validation;
- `stateSeq` per mutazioni durevoli;
- snapshot per reconnect/gap;
- comandi stretti e autorizzati;
- niente event sourcing/idempotency framework generale.

Rate, batching e TTL tecnici si tarano sull'implementazione.

## Gate V0.3

Fixture minima:

- 1 host + 8 player;
- join/reconnect;
- switch almeno 3 board;
- private data assente dal payload player;
- token autorizzato/non autorizzato;
- host freeze/resume/timeout;
- resync snapshot;
- fine sessione.

---

# V0.4 — Discord Activity

Fonte: `docs/DISCORD_ACTIVITY_SPEC.md`.

Flusso prodotto:

```text
live session V0.3 già attiva
→ master genera pairing code
→ apre Activity e inserisce pairing
→ instanceId ↔ liveSessionId
→ code consumato
→ giocatori fanno Unisciti all'attività
→ stessa esperienza player V0.3
```

## Discord aggiunge soltanto

- Activity instance;
- pairing master-only;
- identity Discord verificata;
- ingresso player senza join code manuale.

## Non cambia

- board protocol;
- token permissions;
- snapshot/reconnect;
- autorità del desktop;
- standalone web.

## Stati/errori

- Activity instance non associata → nessun dato campagna, schermata collega/attesa;
- pairing invalido/scaduto/consumato → rigenera/riprova;
- Activity del master chiusa → live continua se desktop online;
- istanza Discord termina → live desktop resta attiva, nuova istanza richiede nuovo pairing;
- host desktop cade → stessi `LIVE-HOST-*` della V0.3.

## Gate V0.4

- master abbina una sola volta;
- giocatori normali non digitano codici;
- due player stessa Activity → stessa live session;
- instance non associata riceve zero dati;
- identity client modificata non concede permessi;
- chiudere Activity del master non termina sessione;
- standalone V0.3 resta verde.

---

# V0.5 — Assistente IA

Fonte: `docs/AI_SPEC.md`.

Flusso prodotto:

```text
configura provider opzionale
→ domanda sulla campagna/nota/selezione
→ retrieval locale
→ risposta + fonti
→ eventuale proposta
→ diff/anteprima
→ utente Applica o Scarta
```

## Accesso

- `Ctrl+K → Assistente IA`;
- azione inspector nota;
- `Chiedi all'IA` su selezione.

L'assistente usa una vista centrale. Nessun placeholder IA prima della V0.5.

## Provider

- feature opzionale;
- adapter soltanto per provider realmente supportati;
- API key locale separata dal vault;
- nessun account Campaign Manager richiesto per forza;
- nessuna console generica provider se non serve.

## Retrieval

```text
query
→ search locale
→ note candidate
→ read note necessarie
→ provider
```

BM25/lessicale prima di embeddings.

La risposta mostra le note realmente usate come fonti.

## Modifiche

V0.5 può proporre soltanto:

- modifica di una nota;
- nuova nota.

Una proposta alla volta.

Non può eseguire delete/rename/move/bulk edit/board/live commands.

Proposal revision stale → Apply bloccato, rivedi/rigenera.

## Stati/errori

- provider non configurato;
- thinking/cancel;
- offline;
- key/provider auth invalid;
- rate limited/provider error;
- context too large;
- source missing;
- proposal stale;
- save conflict.

Errore IA non modifica né blocca la campagna.

## Gate V0.5

- app pienamente usabile senza IA;
- fonti reali e cliccabili;
- nessun write senza preview + approvazione;
- stale proposal non sovrascrive;
- provider secret fuori dal vault;
- niente vector DB/agent framework senza evidenza reale.

---

# V0.6 — Personaggi riutilizzabili + ganci integrazione

Fonte: `docs/V06_CHARACTERS_INTEGRATIONS_SPEC.md`.

Obiettivo:

```text
nota personaggio già esistente
→ collegala a un token
→ riusala in più board
→ aprila rapidamente dal token
```

Nessun character builder universale.

## Flussi

### Collega nota

```text
seleziona token
→ Collega nota personaggio…
→ scegli nota
→ salva board
```

### Crea token da nota

```text
nota
→ Crea token da questa nota…
→ scegli board
→ token con nome iniziale + link
→ posiziona
```

### Privacy

Il player non riceve `NoteId` o Markdown perché controlla un token collegato.

## Riutilizzo

La stessa nota può essere collegata a token in board diverse.

Posizione/dimensione/visibilità/controller restano proprietà della singola scena/token.

## Gancio provider esterno

Si documenta un bordo futuro per EcoGDR/BeFolder o altra fonte reale, ma:

- nessun framework plugin universale;
- nessun provider finto;
- nessuna sync continua;
- auth soltanto se il provider la richiede.

## Gate V0.6

- link token↔nota persiste e sopravvive a rename/move;
- nota mancante non rompe il token;
- token generici restano semplici;
- nessuna esposizione privata ai player;
- nessun nuovo database schede/personaggi.

---

# Milestone cloud futuro — Auth + Compendio reale

Fonti:

- `docs/AUTHENTICATION_SPEC.md`;
- `docs/COMPENDIUM_SPEC.md`.

**Non riceve una versione finché non esistono backend e dataset reali.**

## Precondizioni

- vero servizio cloud disponibile;
- API/dataset verificabili;
- diritti/licenze contenuti chiariti;
- deciso se il servizio richiede davvero account.

## Auth

Se serve:

```text
feature cloud / Impostazioni Account
→ Accedi
→ browser/system auth flow
→ ritorno all'app
→ feature richiesta
```

Login mai obbligatorio all'avvio.

Session expiry/logout/offline degradano solo feature account-dependent.

## Compendio

```text
Compendio
→ cerca/esplora
→ apri voce
→ leggi
→ Copia nelle note
→ scegli cartella/titolo
→ normale Markdown locale
```

La copia è indipendente: nessuna sincronizzazione implicita col cloud.

Se il Compendio è pubblico e non richiede account, non si impone login artificiale.

## Gate

- account opzionale rispetto al vault;
- cloud offline non blocca note/board/live;
- Compendio read-only rispetto alla fonte;
- `Copia nelle note` usa normali servizi locali;
- logout non elimina copie locali;
- nessun secret nel vault/player.

---

# Milestone EcoGDR futuro — solo con contratti reali

Fonte: `docs/ECOGDR_INTEGRATION_SPEC.md`.

## Flusso minimo previsto

```text
Impostazioni → Integrazioni → EcoGDR
→ Collega campagna
→ auth se necessaria
→ scegli campagna remota
→ anteprima
→ Conferma binding
```

Il binding significa soltanto:

> questa cartella locale corrisponde a questa campagna remota.

Non significa sync/pubblicazione/import automatico.

Ogni futura operazione dati (`Importa`, `Pubblica`, `Aggiorna`) è una feature separata da progettare contro API reali.

`Scollega` non elimina dati locali.

---

# Regola per i goal di implementazione

Un goal di sviluppo deve contenere:

1. versione/area;
2. specifiche normative applicabili;
3. risultato utente osservabile;
4. acceptance/gate da superare;
5. espliciti non-obiettivi se esiste rischio di scope creep.

Forma consigliata:

```text
Implementa <goal> della V0.x secondo <spec>.
Completa i flussi <...> e i gate <...>.
Non anticipare <feature future>.
Se una scelta interna non cambia il comportamento approvato, scegli la soluzione più semplice.
```

---

## Regola finale

L'ordine del progetto è:

```text
V0.1  campagna locale solida
→ V0.2 board
→ V0.3 live web
→ V0.4 Discord
→ V0.5 IA
→ V0.6 personaggi leggeri/ganci
→ servizi cloud reali quando esistono
→ EcoGDR quando esistono contratti reali
```

Ogni gradino deve essere utile da solo.

Se per costruirne uno serve fingere che il successivo esista già, il confine è sbagliato.