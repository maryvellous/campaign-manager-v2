# Campaign Manager v2 — Roadmap

## 1. Scopo

Questa roadmap descrive l'ordine di costruzione della v2 e i gate che impediscono al progetto di tornare a crescere in modo disordinato.

La priorità iniziale è **V0.1 — Campaign Manager locale**.

Le versioni successive possono avere specifiche progettuali già approvate, ma non devono essere implementate prima che la fase precedente superi il proprio gate.

La v2 non deve ereditare automaticamente né il codice né l'interfaccia del progetto precedente.

La vecchia app può essere studiata per capire:

- quali funzioni servono davvero;
- quali flussi sono scomodi;
- quali concetti meritano di essere mantenuti;
- quali errori di struttura o interazione non devono essere ripetuti.

Non è un template UI da riprodurre.

---

## 2. Regole di esecuzione

### Una fase alla volta

Non si anticipano feature della fase successiva per comodità.

Esempio: durante V0.1 non si introduce networking "perché tanto servirà dopo".

### UX prima del layout definitivo

La nuova interfaccia deve essere progettata attorno ai flussi reali del DM, non attorno ai componenti della vecchia app.

Prima si decide:

- cosa deve essere immediatamente raggiungibile;
- quali informazioni devono restare visibili;
- quali azioni sono frequenti;
- come si passa da una nota all'altra;
- come si evita di perdere contesto;
- come funzionano tastiera, mouse e drag & drop;
- quali operazioni meritano un pannello, una palette comandi o un menu contestuale;
- come si passa tra note e graph view senza perdere stato.

La specifica normativa della V0.1 è `docs/UI_UX_SPEC_V01.md`.

### Visual design sotto direzione dell'utente

Palette e direzione visuale sono definite in `docs/DESIGN_DIRECTION.md` e `docs/palette.svg`.

I valori dimensionali e di timing ripresi dai mock sono **default da validare**, non contratti rigidi. Il comportamento e la gerarchia approvati restano invece vincolanti.

### Nessuna feature senza collocazione

Ogni feature deve avere:

1. un dominio;
2. un modulo responsabile;
3. un flusso utente definito;
4. un criterio di completamento verificabile.

### Preparare gli agganci, non il sistema futuro

I soli guardrail per EcoGDR e compendio sostituibile sono in `docs/FOUNDATION_GUARDRAILS.md`.

La V0.1 non introduce account, auth, sync o networking EcoGDR.

---

## 3. Workstream

La V0.1 procede su quattro workstream coordinati.

### A. Product & UX

Definisce:

- flussi;
- information architecture;
- navigazione;
- ergonomia;
- comportamento dei pannelli;
- graph view;
- scorciatoie;
- stati vuoti;
- errori e recovery;
- feedback delle azioni.

### B. Visual Design

Definisce:

- palette;
- tipografia;
- spaziatura;
- forme;
- contrasto;
- densità;
- iconografia;
- componenti visuali;
- motion.

La direzione è fissata; tipografia precisa, spacing e alcuni valori dimensionali restano da validare sull'app reale.

### C. Engineering

Costruisce:

- monorepo;
- core;
- storage;
- shell Electron;
- renderer React;
- servizi applicativi;
- editor;
- navigazione;
- ricerca;
- proiezione grafo locale.

### D. Quality

Verifica:

- test;
- error handling;
- accessibilità di base;
- keyboard navigation;
- persistenza;
- recovery;
- conflitti con modifiche esterne;
- documentazione.

---

# V0.1 — Campaign Manager locale

## Obiettivo

Il primo prodotto realmente utilizzabile deve permettere questo flusso:

```text
apri campagna
→ orientati immediatamente
→ trova o crea una nota
→ naviga tra note collegate
→ modifica o leggi
→ cerca o esplora nel grafo
→ salva senza perdere il buffer
→ cambia contesto senza perdere il lavoro
→ chiudi
→ riapri
→ ritrova tutto nello stato atteso
```

V0.1 non contiene:

- lavagne;
- realtime;
- Discord;
- relay;
- IA;
- schede giocatore;
- bot;
- cloud sync;
- account/auth EcoGDR;
- importazione generale di file esterni.

La **graph view è invece parte della V0.1**.

---

## Fase 0 — Baseline e UX audit

### Obiettivo

Capire cosa deve essere migliorato rispetto alla v1 senza copiarne la struttura.

### Attività

- analizzare i flussi principali della vecchia app;
- individuare attriti, ridondanze e azioni troppo profonde;
- distinguere funzioni realmente utili da elementi cresciuti per accumulo;
- definire i task quotidiani più importanti del DM;
- stabilire quali task devono essere rapidi da mouse e quali da tastiera;
- definire cosa deve rimanere persistente tra cambi di nota e riapertura dell'app.

### Deliverable

`docs/UX_BASELINE.md`

Deve descrivere problemi e obiettivi, non proporre una copia migliorata della vecchia UI.

### Gate

Non si considera conclusa finché non sappiamo descrivere in modo semplice:

- come si apre una campagna;
- come si trova una nota;
- come si crea una nota;
- come si cambia nota;
- come si segue un wikilink;
- come si torna indietro;
- come si capisce se qualcosa è davvero salvato.

---

## Fase 1 — Information architecture e interaction model

### Obiettivo

Disegnare l'interfaccia attorno all'efficienza, prima dell'implementazione completa.

### Decisioni fissate

La direzione approvata usa:

- barra superiore;
- rail principale;
- sidebar vault;
- editor/lettura centrale;
- inspector contestuale non modale;
- command palette;
- tab con cronologia per tab;
- graph view come modalità dell'area centrale;
- Recenti e Preferiti come filtri della sidebar.

### Deliverable

`docs/UI_UX_SPEC_V01.md`

La specifica deve contenere requisiti stabili e scenari di accettazione per layout, navigazione, editor, salvataggio, graph view, responsive desktop, keyboard, drag & drop, accessibilità e anti-pattern.

### Gate

L'implementazione non deve inventare comportamenti in conflitto con la spec. Eventuali modifiche di prodotto richiedono aggiornamento esplicito della documentazione.

---

## Fase 2 — Visual design

### Stato

**Direzione approvata.**

### Fonti

- `docs/DESIGN_DIRECTION.md`;
- `docs/palette.svg`;
- mock UI approvati come riferimenti visivi.

### Decisioni fissate

- background `#1E1333`;
- gradient companion `#4D3B6B`;
- surface/highlight `#3D1F48`;
- controls `#833D6F`;
- testo bianco;
- cinque colori dedicati alla codifica del grafo/cartelle;
- pallino cartella nella sidebar come unica eccezione graph-color fuori dal grafo;
- motion leggero, liquido, liscio e occasionalmente bubbly.

### Default da validare

Tipografia precisa, spacing, raggi, timing e dimensioni dei pannelli partono dai mock ma possono essere corretti dopo verifica documentata sull'app reale.

---

## Fase 3 — Bootstrap tecnico

### Obiettivo

Creare una fondazione minima e leggibile.

### Struttura iniziale

```text
apps/
  desktop/

packages/
  core/
  storage/
  ui/
```

`activity`, `protocol`, `ai` e `services/relay` vengono introdotti quando diventano necessari nelle versioni successive, evitando package vuoti creati solo per anticipazione.

### Stack

- TypeScript;
- Electron;
- React;
- Vite;
- test runner coerente col workspace;
- lint e formatter.

### Attività

- configurare workspace;
- TypeScript strict;
- lint;
- test;
- build desktop;
- preload tipizzato;
- `contextIsolation` attivo;
- nessun accesso filesystem diretto dal renderer;
- alias e confini di import chiari.

### Gate

- app vuota avviabile;
- build funzionante;
- test eseguibili;
- nessun errore TypeScript;
- IPC minimo e tipizzato.

---

## Fase 4 — Core della campagna

### Obiettivo

Definire il dominio prima di costruire l'interfaccia completa.

### Modelli iniziali

- Campaign;
- Note;
- NoteId / path identity;
- CampaignMetadata;
- WikilinkReference.

### Use case iniziali

```text
openCampaign()
listNotes()
getNote()
createNote()
updateNote()
renameNote()
deleteNote()
moveNote()
```

### Regole

- nessuna dipendenza da React;
- nessuna dipendenza da Electron;
- nessun accesso filesystem diretto;
- nessuna dipendenza EcoGDR concreta;
- errori di dominio espliciti.

### Gate

Use case critici testati in isolamento.

---

## Fase 5 — Storage locale, recovery e operazioni file

### Obiettivo

Rendere affidabile la cartella campagna come fonte autorevole.

### Implementazione

- filesystem adapter;
- apertura cartella;
- lettura ricorsiva necessaria;
- lettura/scrittura Markdown;
- create;
- rename;
- move;
- trash tramite cestino di sistema;
- gestione path;
- gestione errori comuni;
- bozze di recovery separate;
- rilevazione modifiche esterne;
- impostazioni locali separate dai dati della campagna.

### Vincoli

- nessun fallback silenzioso dal cestino a cancellazione permanente;
- `saved` solo dopo conferma reale della persistenza;
- conflitto esterno + buffer dirty → nessuna sovrascrittura automatica.

### Test

Su directory temporanee:

- create;
- read;
- update;
- rename;
- move;
- trash behavior;
- file mancante;
- cartella spostata o non disponibile;
- nomi problematici;
- scrittura fallita;
- modifica esterna;
- recovery dopo interruzione.

### Gate

Una sequenza automatica di operazioni deve lasciare filesystem e recovery nello stato atteso senza dipendere dalla UI.

---

## Fase 6 — Campaign shell UX

### Obiettivo

Costruire la prima esperienza concreta dell'utente.

### Include

- schermata senza campagna;
- apertura cartella;
- eventuale elenco campagne recenti;
- stato campagna aperta;
- barra superiore;
- rail;
- sidebar;
- area centrale;
- inspector;
- loading/error/empty states.

### Vincolo

La shell segue `docs/UI_UX_SPEC_V01.md`, non la disposizione della v1.

### Gate

Un utente deve capire immediatamente:

- quale campagna è aperta;
- dove si trovano i contenuti;
- come iniziare a lavorare;
- come cambiare campagna.

---

## Fase 7 — Note explorer

### Obiettivo

Rendere la navigazione del vault veloce e prevedibile.

### Include

- albero reale del vault;
- cartelle;
- filtro per nome;
- Recenti;
- Preferiti;
- create note;
- create folder se previsto;
- rename;
- move;
- trash;
- menu contestuale;
- keyboard navigation;
- drag & drop con alternativa tramite comandi;
- stato selezionato chiaro;
- assegnazione colore cartella e pallino sidebar.

### Gate

Le operazioni quotidiane non richiedono modali inutili e tutte le azioni primarie hanno un percorso da tastiera.

---

## Fase 8 — Editor, lettura e salvataggio

### Obiettivo

Scrivere e consultare note senza attrito e senza perdita dati.

### Include

- Markdown editor;
- modalità lettura nella stessa area;
- stato dirty/saving/saved/error;
- autosave;
- `Ctrl/Cmd+S`;
- bozze recovery;
- protezione da perdita dati;
- apertura/cambio note;
- tab e cronologia;
- frontmatter non invasivo;
- undo/redo editor separato dalla cronologia di navigazione.

### Default proposto

Autosave dopo circa 600 ms di inattività, da validare sull'app reale.

### Gate

Nessun percorso normale deve poter perdere modifiche silenziosamente o simulare un salvataggio riuscito.

---

## Fase 9 — Wikilink, backlink e navigazione contestuale

### Obiettivo

Trasformare le note in una rete navigabile.

### Include

- parsing `[[Nota]]`;
- risoluzione link;
- backlink;
- link inesistente o ambiguo esplicito;
- apertura rapida;
- back/forward per tab;
- aggiornamento dei wikilink risolti durante rename;
- suggerimenti durante la scrittura se coerenti con la spec.

### Gate

Seguire una catena di note, tornare indietro e rinominare una nota deve essere rapido, prevedibile e verificabile.

---

## Fase 10 — Ricerca, command palette e graph view

### Obiettivo

Evitare che la struttura a cartelle sia l'unico modo di trovare e comprendere informazioni.

### Ricerca

- filtro nome sidebar separato;
- full-text locale;
- risultati con contesto minimo;
- apertura immediata.

### Command palette

- `Ctrl/Cmd+K`;
- note + azioni distinguibili;
- frecce/Invio/Esc;
- focus restituito correttamente.

### Graph view

- nodi = note;
- archi = wikilink risolti;
- dati derivati e ricostruibili;
- pan e zoom;
- drag nodo solo visuale;
- dettaglio flottante;
- apertura nota dal grafo;
- filtri e legenda derivati dalle cartelle reali;
- colore nodo derivato dalla cartella e dalla sua eredità;
- `Centra vista`, `Cancella selezione`, `Ripristina filtri` separati;
- stato locale del grafo ripristinabile.

### Gate

Ricerca e grafo possono essere eliminati e ricostruiti senza modificare i file Markdown. Le interazioni rispettano i requisiti `UX-SEARCH-*`, `UX-CMD-*` e `UX-GRAPH-*`.

---

## Fase 11 — Visual system e polish

### Prerequisiti

- `docs/DESIGN_DIRECTION.md`;
- `docs/UI_UX_SPEC_V01.md`.

### Obiettivo

Applicare il linguaggio visivo definitivo senza cambiare arbitrariamente i flussi già validati.

### Include

- token;
- palette;
- typography;
- spacing;
- focus states;
- hover states;
- selezione;
- scrollbars;
- componenti principali;
- motion funzionale;
- empty states;
- error states;
- contrasto e leggibilità.

### Regola

Il polish visivo non deve ridurre l'efficienza. Se estetica e usabilità entrano in conflitto, il problema va ridisegnato invece di nasconderlo.

---

## Fase 12 — UX validation e hardening

### Obiettivo

Verificare la V0.1 come prodotto, non come insieme di feature.

### Flussi da provare end-to-end

1. nuova apertura app;
2. apertura campagna;
3. creazione nota;
4. scrittura/autosave;
5. creazione wikilink;
6. navigazione link/backlink;
7. back navigation;
8. ricerca;
9. graph view e ritorno all'editor;
10. rename con aggiornamento link;
11. move;
12. trash;
13. errore salvataggio;
14. modifica esterna/conflitto;
15. chiusura;
16. riapertura/recovery.

### Casi di carico UX

Verificare almeno:

- 200 note;
- 15 cartelle;
- nomi lunghi;
- molte tab;
- nota estesa;
- backlink numerosi;
- graph view con note isolate e sottocartelle;
- 1440×900;
- 1024×768;
- 720×600;
- zoom/testo 200%.

### Accessibilità

WCAG 2.2 AA è l'obiettivo di verifica per i criteri applicabili; non è una conformità dichiarata in anticipo.

### Gate finale V0.1

V0.1 è completa solo se:

- tutti i flussi critici funzionano;
- test core/storage/search/graph passano;
- smoke test desktop passa;
- non esistono bug noti che possono perdere dati;
- nessun falso `saved` è possibile;
- PRODUCT.md, architecture.md, ROADMAP.md, DESIGN_DIRECTION.md, UI_UX_SPEC_V01.md e le altre specifiche normative V0.1 applicabili sono coerenti col codice reale;
- UI e UX sono validate come nuova esperienza, non come reskin della v1.

---

# V0.2 — Lavagna locale

Fonte normativa: `docs/BOARD_SPEC.md`.

## Obiettivo

```text
crea board
→ aggiungi contenuti
→ organizza
→ collega note/estratti
→ salva
→ chiudi
→ riapri
```

La board è un workspace specifico, freeform e semplice, non un mini-Foundry.

### Include

- formato `*.board.json` versionato;
- boardId stabile;
- sei strumenti master;
- immagini, testo, token, card note/estratti e collegamenti;
- import asset automatico e portabile;
- z-order, lock, gruppi semplici;
- undo/redo, autosave, recovery e conflitti;
- visibilità preparata che servirà alla futura proiezione live.

### Gate V0.2

Prima della V0.3:

- board create/edit/save/reopen affidabili;
- nessun path esterno fragile;
- card da estratto non espongono Markdown privato;
- asset mancanti non fanno crashare la board;
- stato `saved` reale;
- i requisiti `BRD-*` locali superano test/acceptance applicabili.

---

# V0.3 — Sessione live web

Fonti normative:

- `docs/BOARD_SPEC.md` per la proiezione pubblica della board;
- `docs/LIVE_SESSION_SPEC.md` per lifecycle, join, participant e UX;
- `docs/PROTOCOL_SPEC.md` per transport, ordering, snapshot e sicurezza del protocollo.

## Obiettivo

```text
desktop
→ avvia live session
→ giocatori entrano dal browser
→ waiting state
→ pubblica/cambia board
→ snapshot + eventi realtime
→ token/ping autorizzati
→ reconnect
→ termina in sicurezza
```

### Decisioni fissate

- una sola live session attiva per desktop;
- un solo host DM, nessun co-DM/handoff V0.3;
- browser standalone senza account obbligatorio;
- session join code `ABCD-EFGH`, rotabile;
- nuovi ingressi bloccabili;
- relay autorevole soltanto sullo stato runtime accettato;
- una sola board visibile alla volta, più board preservabili nella stessa sessione;
- elementi privati non inviati;
- asset caricati solo quando devono diventare pubblici;
- token move validato server-side;
- participant resume tramite snapshot;
- host disconnect → freeze + 10 minuti di grace;
- host timeout → sessione chiusa senza scrivere automaticamente la board;
- chiusura volontaria → scelta esplicita sulle posizioni finali token;
- protocollo HTTPS + WSS, ticket monouso, `stateSeq`, snapshot come recovery;
- nessun replay/event log cloud obbligatorio.

### Gate V0.3

Prima della V0.4 devono passare almeno i quality gate `LIVE-QA-*` e `PRO-QA-*`, incluso:

```text
1 desktop
+ 8 player simultanei
+ join/reconnect
+ switch tra 3 board
+ token autorizzati/non autorizzati
+ host disconnect/reconnect
+ resync snapshot
+ end session
```

Discord non può essere usato per mascherare lacune del protocollo o del relay.

---

# V0.4 — Discord Activity

Fonti normative:

- `docs/DISCORD_ACTIVITY_SPEC.md`;
- `docs/LIVE_SESSION_SPEC.md`;
- `docs/PROTOCOL_SPEC.md`.

## Obiettivo

```text
DM abbina Activity instance alla live session
→ giocatori fanno Unisciti all'attività
→ nessun codice giocatore
→ stessa esperienza live della V0.3
```

### Decisioni fissate

- Activity = tavolo del giocatore, non mini Campaign Manager;
- join nativo tramite Activity instance/`instanceId`;
- canale vocale non usato come session ID;
- pairing master `ABC-DEF`, monouso, 10 minuti;
- binding runtime `instanceId ↔ liveSessionId`;
- identity Discord verificata → participant runtime;
- Activity del master non è l'host;
- chiudere la Activity del master non chiude la sessione;
- fine dell'istanza Discord non chiude il desktop live;
- nuova istanza richiede nuovo pairing;
- stessa board/protocollo/permessi del web standalone;
- player UI responsiva e focalizzata sulla board;
- browser standalone continua a funzionare senza Discord.

### Gate V0.4

Devono passare i criteri `ACT-*` e tutti i regression gate V0.3.

Discord deve ridurre il numero di passaggi necessari al giocatore, non introdurre una seconda lobby.

---

# V0.5 — Assistente IA

Da introdurre solo quando campagna, note, ricerca e persistenza sono già solidi.

Obiettivo:

```text
search
→ domanda
→ contesto
→ proposta
→ diff
→ approvazione
```

L'IA non scrive direttamente sul filesystem.

---

# V0.6 — Funzioni giocatore e integrazioni

Possibili aree:

- schede personaggio;
- bot Discord;
- import/export avanzato;
- strumenti live aggiuntivi.

Le feature concrete verranno decise in base all'uso reale delle versioni precedenti.

---

## Regola finale della roadmap

Una fase può aggiungere complessità soltanto quando la fase precedente ha dimostrato di averne bisogno.

Per la UI vale la stessa regola:

**non vogliamo una versione più bella della vecchia interfaccia. Vogliamo un modo migliore di usare il Campaign Manager, e poi vogliamo renderlo bello nel linguaggio visivo scelto dall'utente.**