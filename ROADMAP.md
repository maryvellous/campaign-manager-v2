# Campaign Manager v2 — Roadmap

## 1. Scopo

Questa roadmap descrive l'ordine di costruzione della v2 e i gate che impediscono al progetto di tornare a crescere in modo disordinato.

La priorità iniziale è **V0.1 — Campaign Manager locale**.

Le versioni successive restano intenzionalmente ad alto livello finché la V0.1 non è stabile.

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
- quali operazioni meritano un pannello, una palette comandi o un menu contestuale.

Solo dopo si definisce il linguaggio visivo definitivo.

### Visual design sotto direzione dell'utente

Palette, tono visivo e alcune scelte di design verranno fornite dall'utente.

Fino a quel momento:

- non si cristallizza una palette definitiva;
- non si costruisce un design system basato su gusti presunti;
- non si replica il tema della v1;
- si possono progettare wireframe, gerarchia, densità e comportamento usando token semantici provvisori.

Il visual design definitivo ha quindi un **gate esplicito di input utente**.

### Nessuna feature senza collocazione

Ogni feature deve avere:

1. un dominio;
2. un modulo responsabile;
3. un flusso utente definito;
4. un criterio di completamento verificabile.

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
- componenti visuali.

Questo workstream parte realmente solo dopo le indicazioni dell'utente.

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
- ricerca.

### D. Quality

Verifica:

- test;
- error handling;
- accessibilità di base;
- keyboard navigation;
- persistenza;
- recovery;
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
→ modifica
→ salva
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
- cloud sync.

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

Deve descrivere problemi e obiettivi, non proporre ancora una copia migliorata della vecchia UI.

### Gate

Non si considera conclusa finché non sappiamo descrivere in modo semplice:

- come si apre una campagna;
- come si trova una nota;
- come si crea una nota;
- come si cambia nota;
- come si segue un wikilink;
- come si torna indietro;
- come si capisce se qualcosa è salvato.

---

## Fase 1 — Information architecture e interaction model

### Obiettivo

Disegnare l'interfaccia attorno all'efficienza, prima della grafica definitiva.

### Decisioni da prendere

- struttura principale della finestra;
- navigazione primaria;
- ruolo della sidebar;
- comportamento di tab o cronologia;
- ricerca globale;
- creazione rapida;
- apertura di note collegate;
- back/forward navigation;
- command palette eventuale;
- menu contestuali;
- gestione drag & drop;
- gestione pannelli secondari;
- scorciatoie tastiera;
- comportamento su finestre strette.

### Principi UX

L'interfaccia deve privilegiare:

- continuità del contesto;
- poche interruzioni modali;
- azioni frequenti immediatamente accessibili;
- feedback chiaro sullo stato;
- navigazione reversibile;
- riduzione dei click ripetitivi;
- supporto serio alla tastiera senza rendere necessarie scorciatoie da ricordare;
- progressive disclosure per funzioni meno comuni.

### Deliverable

`docs/UX_SPEC_V01.md`

Con:

- mappa dei flussi;
- wireframe low-fi;
- comportamento dei pannelli;
- stati principali;
- error states;
- shortcut map.

### Gate

L'interaction model deve essere approvato prima del visual polish definitivo.

---

## Fase 2 — Input visual design

### Stato

**Dipende dall'utente.**

### Input richiesti

Almeno:

- palette;
- indicazioni sul carattere visivo generale;
- riferimenti o anti-riferimenti utili;
- preferenza sulla densità dell'interfaccia;
- eventuali indicazioni su tipografia, bordi, raggi, ombre, decorazioni e motion.

Non è necessario che siano specifiche tecniche complete: possono essere anche riferimenti, esempi o sensazioni da tradurre in sistema.

### Output

`docs/DESIGN_DIRECTION.md`

Successivamente:

- token semantici;
- component primitives;
- stati hover/focus/disabled;
- contrasto;
- scala tipografica;
- spacing scale.

### Gate

Nessun tema definitivo viene considerato approvato prima di questo passaggio.

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

`activity`, `protocol`, `ai` e `services/relay` possono essere introdotti quando diventano necessari nelle versioni successive, evitando package vuoti creati solo per anticipazione.

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
```

### Regole

- nessuna dipendenza da React;
- nessuna dipendenza da Electron;
- nessun accesso filesystem diretto;
- errori di dominio espliciti.

### Gate

Use case critici testati in isolamento.

---

## Fase 5 — Storage locale

### Obiettivo

Rendere affidabile la cartella campagna come fonte autorevole.

### Implementazione

- filesystem adapter;
- apertura cartella;
- lettura ricorsiva necessaria;
- lettura/scrittura Markdown;
- create;
- rename;
- delete;
- gestione path;
- gestione errori comuni;
- impostazioni locali separate dai dati della campagna.

### Test

Su directory temporanee:

- create;
- read;
- update;
- rename;
- delete;
- file mancante;
- cartella spostata o non disponibile;
- nomi problematici;
- contenuto non valido quando applicabile.

### Gate

Una sequenza automatica di operazioni deve lasciare il filesystem nello stato atteso senza dipendere dalla UI.

---

## Fase 6 — Campaign shell UX

### Obiettivo

Costruire la prima esperienza concreta dell'utente.

### Include

- schermata senza campagna;
- apertura cartella;
- eventuale elenco campagne recenti;
- stato campagna aperta;
- navigazione principale;
- struttura dei pannelli secondo `UX_SPEC_V01.md`;
- gestione loading/error/empty states.

### Vincolo

La shell deve seguire il nuovo interaction model, non la disposizione della v1.

### Gate

Un utente deve poter capire immediatamente:

- quale campagna è aperta;
- dove si trovano i contenuti;
- come iniziare a lavorare;
- come cambiare campagna.

---

## Fase 7 — Note explorer

### Obiettivo

Rendere la navigazione del vault veloce e prevedibile.

### Include

- albero o modello di navigazione scelto in UX;
- cartelle;
- create note;
- create folder se confermato dal modello UX;
- rename;
- delete;
- menu contestuale;
- keyboard navigation;
- drag & drop solo se migliora davvero il flusso definito;
- stato selezionato chiaro.

### Gate

Le operazioni di gestione note non devono richiedere passaggi inutili o dialoghi modali per azioni quotidiane.

---

## Fase 8 — Editor

### Obiettivo

Scrivere e modificare note senza attrito.

### Include

- Markdown editor;
- stato dirty esplicito;
- strategia di salvataggio definita;
- protezione da perdita dati;
- apertura note;
- cambio nota;
- eventuali tab/history secondo UX spec;
- frontmatter senza renderlo invasivo;
- preview o rendering solo nel modo deciso dalla UX.

### Decisioni da fissare prima dell'implementazione

- autosave vs save esplicito o modello ibrido;
- comportamento quando si cambia nota con modifiche pendenti;
- recovery dopo crash;
- comportamento di undo/redo.

### Gate

Nessun percorso normale deve poter perdere modifiche silenziosamente.

---

## Fase 9 — Wikilink e navigazione contestuale

### Obiettivo

Trasformare le note in una rete navigabile senza introdurre ancora il grafo visuale.

### Include

- parsing `[[Nota]]`;
- risoluzione link;
- link inesistente;
- creazione nota da link se prevista dalla UX;
- apertura rapida;
- back/forward;
- suggerimenti durante la scrittura se approvati nel modello UX.

### Gate

Seguire una catena di note e tornare al punto precedente deve essere rapido e prevedibile.

---

## Fase 10 — Ricerca e accesso rapido

### Obiettivo

Evitare che la struttura a cartelle diventi l'unico modo di trovare informazioni.

### V0.1

- ricerca per nome;
- full-text search locale semplice;
- risultati con contesto minimo;
- apertura immediata;
- eventuale command palette se prevista dalla UX.

Non include ancora RAG o IA.

### Gate

Ricerca e filesystem devono restare separati: l'indice può essere eliminato e ricostruito.

---

## Fase 11 — Visual system e polish

### Prerequisito

`DESIGN_DIRECTION.md` approvato.

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

Il polish visivo non deve ridurre l'efficienza per preservare un'estetica.

Se estetica e usabilità entrano in conflitto, il problema va ridisegnato invece di nasconderlo.

---

## Fase 12 — UX validation e hardening

### Obiettivo

Verificare la V0.1 come prodotto, non come insieme di feature.

### Flussi da provare end-to-end

1. nuova apertura app;
2. apertura campagna;
3. creazione nota;
4. scrittura e salvataggio;
5. creazione wikilink;
6. navigazione link;
7. back navigation;
8. ricerca nota;
9. rename;
10. delete;
11. chiusura;
12. riapertura;
13. recovery da almeno un errore filesystem realistico.

### Verifiche UX

- nessuna azione primaria nascosta senza motivo;
- nessuna modale usata come sostituto di una buona navigazione;
- focus keyboard prevedibile;
- feedback di salvataggio chiaro;
- errori comprensibili;
- layout utilizzabile alle dimensioni finestra previste;
- nessuna perdita di contesto evitabile.

### Gate finale V0.1

V0.1 è completa solo se:

- tutti i flussi critici funzionano;
- test core e storage passano;
- smoke test desktop passa;
- non esistono bug noti che possono perdere dati;
- PRODUCT.md, architecture.md e ROADMAP.md sono coerenti col codice reale;
- UI e UX sono state validate come nuova esperienza, non come reskin della v1.

---

# V0.2 — Lavagna locale

Da dettagliare solo dopo il gate V0.1.

Obiettivo:

```text
crea board
→ aggiungi contenuti
→ organizza
→ salva
→ chiudi
→ riapri
```

La UX della board verrà progettata come workspace specifico, non semplicemente aggiunta dentro l'editor note.

---

# V0.3 — Sessione live web

Da dettagliare dopo V0.2.

Obiettivo:

```text
desktop
→ pubblica board
→ relay
→ browser client
→ sincronizzazione affidabile
```

Prima client web standalone, poi Discord.

---

# V0.4 — Discord Activity

Il client web funzionante viene adattato al Discord Embedded App SDK.

Discord resta un adapter della Activity, non il fondamento del prodotto.

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
