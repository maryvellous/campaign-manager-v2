# Campaign Manager v2 — V0.1 Operational Specification

## 1. Scopo, autorità e regola di interpretazione

Questo documento chiude le ambiguità operative residue della **V0.1 — Campaign Manager locale**.

È il contratto integrato da usare per implementare e verificare la V0.1. Riunisce e rende deterministiche le decisioni già approvate in:

- `PRODUCT.md`;
- `architecture.md`;
- `ROADMAP.md`;
- `docs/V01_PRODUCT_DECISIONS.md`;
- `docs/UI_UX_SPEC_V01.md`;
- `docs/DOMAIN_MODEL.md`;
- `docs/STORAGE_SPEC.md`;
- `docs/SEARCH_SPEC.md`;
- `docs/DESIGN_DIRECTION.md`;
- `docs/FOUNDATION_GUARDRAILS.md`.

Prefisso requisiti: `OPS-*`.

### OPS-AUTH-001 — Precedenza

Per comportamenti V0.1, l'ordine è:

1. decisioni esplicite dell'utente approvate **dopo** questo documento;
2. questo documento;
3. `docs/V01_PRODUCT_DECISIONS.md`;
4. specifica verticale più specifica;
5. PRODUCT / architecture / ROADMAP;
6. design direction;
7. mock di riferimento.

Se una specifica più vecchia usa formule come `può`, `se supportato`, `default proposto` o `da verificare`, questo documento fissa il comportamento quando la questione incide sul prodotto. Restano libere solo le scelte elencate esplicitamente in §23.

### OPS-AUTH-002 — Scope

La V0.1 comprende:

- campagna locale;
- note Markdown;
- cartelle reali;
- editor e lettura;
- wikilink/backlink;
- tab e cronologia;
- filtro sidebar;
- ricerca full-text;
- command palette;
- graph view;
- recenti/preferiti;
- folder colors per graph;
- persistenza sicura;
- recovery;
- gestione conflitti e modifiche esterne;
- impostazioni minime di manutenzione;
- accessibilità e keyboard navigation.

Restano fuori: board, realtime, Discord, relay, AI, EcoGDR networking/account, importazione generale di file esterni e collaborazione multiutente.

---

# 2. Ownership architetturale V0.1

## OPS-ARCH-001 — Application layer esplicito

La V0.1 introduce un vero application layer:

```text
packages/
  core/
  application/
  storage/
  search/
  ui/
```

- `core`: tipi di dominio, invarianti, parser/resolver canonici, repository contracts;
- `application`: lifecycle campagna, document sessions/buffer, orchestrazione save/recovery, rename/move/trash, proiezioni, preferenze e coordinamento search;
- `storage`: filesystem, metadata, preferences, recovery, operation journal, trash adapter;
- `search`: implementazione dell'indice derivato e `SearchService`;
- `ui`: primitive visuali condivise, senza logica di dominio.

`apps/desktop` è composition root + Electron shell + React renderer.

## OPS-ARCH-002 — Dipendenze

Forma consentita:

```text
apps/desktop → application → core
apps/desktop → ui
storage      → core
search       → core
application  → contratti/porte, con adapter iniettati dal desktop
```

`application` non dipende da React. `core` non dipende da Electron, React, storage concreto o search engine concreto.

## OPS-ARCH-003 — Orchestrazione fuori dalla UI

React component, hook e store UI non coordinano direttamente:

- filesystem;
- rename/move multi-file;
- operation journal;
- recovery;
- search rebuild;
- backlink/graph refresh;
- remap di NoteId/FolderId.

Queste responsabilità appartengono all'application layer.

## OPS-ARCH-004 — Document session

Per ogni nota/draft aperto l'application layer mantiene una document session con almeno:

```ts
type DocumentSaveState =
  | 'clean'
  | 'dirty'
  | 'saving'
  | 'error'
  | 'conflict'
  | 'missing'

interface DocumentSession {
  sessionId: string
  target: ExistingNoteTarget | NewDraftTarget
  markdown: string
  baseRevision?: NoteRevision
  saveState: DocumentSaveState
}
```

Cursor, selezione testuale e viewport restano UI state, ma il testo non confermato e il suo stato di persistenza devono sopravvivere alla sostituzione del componente React.

---

# 3. Startup e lifecycle della campagna

## OPS-CAM-001 — Avvio app

All'avvio:

1. se esiste una campagna aperta con successo nell'ultima sessione, l'app tenta di riaprirla;
2. se il path non esiste o l'apertura fallisce, mostra la schermata iniziale;
3. la schermata iniziale mostra fino a **10 campagne recenti** + `Apri cartella…`;
4. nessun errore di una campagna impedisce di sceglierne un'altra.

## OPS-CAM-002 — Prima apertura

Una cartella leggibile e scrivibile senza `campaign.json` viene inizializzata automaticamente creando soltanto metadata minimi.

V0.1 crea:

```json
{
  "schemaVersion": 1,
  "campaignId": "<uuid>"
}
```

`name` resta opzionale. Se assente, la UI usa il nome corrente della cartella come nome visuale.

Nessun Markdown viene riscritto.

## OPS-CAM-003 — V0.1 non ha modalità read-only

Una campagna deve essere leggibile **e scrivibile** per essere aperta come V0.1.

Se è leggibile ma non scrivibile:

- apertura bloccata con `read_only`/`permission_denied`;
- messaggio: la V0.1 non supporta una sessione sola-lettura;
- azioni offerte: `Riprova`, `Scegli un'altra cartella`, `Apri cartella in Esplora file` quando possibile.

La UI non finge di aprire normalmente disabilitando casualmente singoli pulsanti.

## OPS-CAM-004 — Metadata invalidi o schema futuro

- `campaign.json` invalido → apertura bloccata; nessun overwrite automatico;
- schema futuro/non supportato → apertura bloccata; nessun downgrade;
- schema precedente noto → migrazione versionata, con backup metadata e test dedicato.

## OPS-CAM-005 — Duplicazione di CampaignId

L'app mantiene un registro locale `campaignId → ultimo path noto`.

Quando apre una campagna con ID già noto:

- se il vecchio path non esiste più → trattare come normale spostamento e aggiornare il path;
- se vecchio e nuovo path esistono entrambi → considerare la nuova cartella una **copia sospetta**.

Nel secondo caso l'app non apre due copie con lo stesso ID come se fossero la stessa campagna. Mostra:

```text
Questa cartella sembra una copia di una campagna già conosciuta.
[Usa come nuova copia indipendente] [Annulla]
```

`Usa come nuova copia indipendente` genera un nuovo `campaignId` modificando soltanto `campaign.json`. Preferenze/recovery della campagna originale non vengono ereditati.

## OPS-CAM-006 — Cambio campagna

Prima di cambiare campagna l'application layer esegue `flushAllDocuments()`:

- draft vuoti → annullati;
- draft significativi → tenta materializzazione;
- note dirty → tenta save;
- note saving → attende esito reale.

Se tutto è confermato, il cambio procede.

Se restano `error`, `conflict` o draft non materializzabili ma la recovery è stata salvata correttamente, mostra:

```text
Alcune modifiche non sono state salvate nei file.
[Conserva le bozze e cambia campagna] [Resta qui]
```

Se la recovery non può essere confermata, il cambio è bloccato finché l'utente non salva/esporta/scarta esplicitamente.

## OPS-CAM-007 — Chiusura app

La chiusura volontaria segue la stessa logica di `OPS-CAM-006`.

La chiusura può procedere con bozze non persistite **solo** dopo conferma che esiste una recovery locale valida e dopo scelta esplicita `Chiudi conservando le bozze`.

Un crash resta coperto dalla recovery, ma non è un percorso UX da simulare volontariamente.

## OPS-CAM-008 — Root scomparsa mentre l'app è aperta

Se la root viene spostata/smontata/cancellata:

- la campagna entra in stato `campaign_unavailable`;
- nuovi write/rename/move/trash vengono sospesi;
- i buffer dirty continuano a essere protetti dalla recovery;
- viene offerto `Individua cartella…`.

La cartella scelta viene riassociata automaticamente solo se contiene lo stesso `campaignId`. Un ID diverso richiede normale apertura/cambio campagna.

---

# 4. Discovery, path e struttura del vault

## OPS-PATH-001 — Contenuti mostrati nel vault explorer

V0.1 mostra nel vault explorer:

- cartelle reali;
- file `.md` validi come note.

Altri file restano sul filesystem ma non sono elementi navigabili del note explorer.

Sono nascosti come contenuti applicativi: `campaign.json`, temp files, `.git`, `node_modules` e artefatti interni dichiarati.

Symlink non vengono attraversati. Possono produrre una diagnostica non bloccante.

## OPS-PATH-002 — Ordinamento explorer

Per ogni cartella:

1. cartelle prima;
2. note dopo;
3. ordinamento locale/natural, case-insensitive, con numeri trattati naturalmente;
4. tie-break deterministico sul path normalizzato.

## OPS-PATH-003 — Normalizzazione identità

Confronti logici di NoteId/FolderId:

- separatore `/`;
- Unicode normalizzato NFC;
- confronto case-insensitive per rilevare collisioni;
- nessun `.`/`..`;
- nessun path assoluto.

La forma visuale originale viene preservata.

## OPS-PATH-004 — Policy nomi creati/rinominati su Windows

V0.1 rifiuta almeno:

- `<>:"/\\|?*` nei segmenti creati dall'app;
- caratteri di controllo;
- nome vuoto;
- `.` / `..`;
- trailing dot o spazio;
- nomi riservati Windows (`CON`, `PRN`, `AUX`, `NUL`, `COM1`…`COM9`, `LPT1`…`LPT9`, case-insensitive anche con estensione);
- collisione esatta o case-only con un altro elemento.

Un **case-only rename dello stesso elemento** è però consentito e viene implementato in modo sicuro, anche tramite temp hop se necessario.

File esistenti leggibili che non rispettano una regola di creazione non vengono rinominati automaticamente.

## OPS-PATH-005 — Collisione case esistente

Se la discovery trova due note/cartelle con identità logiche collidenti solo per case/normalizzazione Unicode, l'apertura writable viene bloccata con diagnostica dei path coinvolti. L'app non sceglie arbitrariamente quale identità usare.

---

# 5. Nuove note e draft temporanei

## OPS-NOTE-001 — Destinazione della nuova nota

`Nuova nota` sceglie il parent in questo ordine:

1. cartella selezionata nel vault;
2. parent della nota selezionata;
3. root campagna.

L'utente può cambiare cartella con `Sposta…` dopo la creazione.

## OPS-NOTE-002 — Draft prima del file

Premere `Nuova nota` crea una `NewDraftTarget`, non un file:

```ts
interface NewDraftTarget {
  kind: 'new-draft'
  draftId: string
  parentFolder: FolderId
  manualTitle?: string
}
```

Il focus entra nel corpo dell'editor.

Se l'utente abbandona/chiude il draft senza contenuto significativo, il draft viene annullato e non lascia file o recovery.

## OPS-NOTE-003 — Contenuto significativo

Per decidere se materializzare una nuova nota:

- whitespace solo → non significativo;
- soli marker Markdown senza testo (`#`, `---`, `>`, `*`, backtick fence vuoto) → non significativo;
- almeno un token/grapheme visibile dopo rimozione dei marker strutturali → significativo.

Il frontmatter YAML iniziale, se presente, non viene usato per derivare il titolo automatico.

## OPS-NOTE-004 — Titolo automatico canonico

Il titolo automatico usa le prime **1–3 parole visibili** del contenuto Markdown.

La pipeline:

1. ignora frontmatter iniziale;
2. ignora marker Markdown puramente strutturali;
3. considera il testo visibile, incluso testo in heading/lista/citazione;
4. prende fino a tre token separati da whitespace;
5. rimuove caratteri non validi per filename Windows sostituendoli con spazi;
6. collassa whitespace e rimuove trailing dot/spazio.

Esempi:

```text
# La città perduta
→ La città perduta.md

Lady Maya
→ Lady Maya.md

Capitolo: il ritorno
→ Capitolo il ritorno.md
```

Se il risultato è vuoto, riservato o collidente, la materializzazione si ferma e l'utente modifica il titolo inline.

## OPS-NOTE-005 — Quando il titolo si fissa

Per evitare che una pausa a metà della prima parola produca un filename prematuro:

Una nuova nota viene materializzata quando si verifica il primo tra:

- `Ctrl+S`;
- uscita dal draft verso un'altra nota/vista;
- chiusura della tab/della campagna/app;
- completamento della terza parola seguito dal normale debounce;
- **1500 ms di inattività** con almeno una parola significativa.

Prima della materializzazione la recovery viene comunque aggiornata.

Dopo la prima materializzazione il titolo automatico è fissato e l'autosave normale usa 600 ms.

## OPS-NOTE-006 — Override manuale prima della materializzazione

Il titolo candidato può essere modificato manualmente anche prima della prima scrittura autorevole.

Appena l'utente modifica esplicitamente il titolo, `manualTitle` prevale e l'auto-title non lo sostituisce.

## OPS-NOTE-007 — Collisione auto-title

Nessun suffisso automatico `(2)`, `copia`, numero o timestamp.

Il draft resta intatto, il titolo entra in stato errore `collision`, e il focus può passare al campo titolo. La nota non appare nel filesystem finché il titolo non è valido.

## OPS-NOTE-008 — Materializzazione fallita

Se la prima creazione fallisce:

- il draft resta aperto o recuperabile;
- stato `error`;
- recovery obbligatoria;
- non appare una falsa nota nell'explorer/search/graph;
- sono disponibili `Riprova`, `Cambia titolo/cartella`, `Esporta bozza`.

---

# 6. Note esistenti, titolo e tab

## OPS-TAB-001 — Apertura normale

Aprire una nota usa la tab corrente per default. Apertura esplicita in nuova tab crea una nuova tab solo se la nota non è già aperta.

## OPS-TAB-002 — Tab unica per NoteId

Una stessa `NoteId` non può avere due document sessions concorrenti nella stessa finestra. Se già aperta, viene attivata.

## OPS-TAB-003 — Chiusura tab

- clean → chiusura immediata;
- dirty → tenta save;
- saving → attende l'esito;
- error/conflict con recovery valida → offre `Chiudi conservando bozza` oppure `Annulla`;
- recovery non valida/non scrivibile → tab non si chiude finché l'utente salva/esporta/scarta esplicitamente.

Dopo la chiusura si attiva la tab immediatamente a destra; se non esiste, quella a sinistra; se non esiste, empty state centrale.

## OPS-TAB-004 — Cronologia

Ogni tab mantiene back/forward indipendente. La cronologia contiene NoteId, non copie di contenuto.

Entry mancanti vengono saltate con feedback non bloccante; non ricreano file.

## OPS-TAB-005 — Reorder

Il riordino tab è persistito localmente. La chiusura/riapertura tenta di ripristinare tab esistenti nell'ordine precedente.

Note mancanti vengono omesse; se esiste recovery associata viene presentata nel recovery center.

## OPS-TITLE-001 — Rinomina dal titolo

Per nota esistente:

- edit titolo è locale finché non confermato;
- `Invio` o blur con valore valido → commit rename;
- `Esc` → annulla;
- blur con valore invalido/collidente → nessun rename, resta errore inline.

La rinomina non avviene a ogni keystroke.

---

# 7. Cartelle — CRUD definitivo V0.1

## OPS-FOLDER-001 — Folder CRUD è requisito

V0.1 supporta definitivamente:

- create folder;
- rename folder;
- move folder;
- trash folder.

La formula storica `se supportata` è superata.

## OPS-FOLDER-002 — `FolderRepository`

Contratto minimo equivalente:

```ts
interface FolderRepository {
  create(parent: FolderId, name: string): Promise<FolderResult>
  rename(id: FolderId, name: string): Promise<FolderMoveResult>
  move(id: FolderId, targetParent: FolderId): Promise<FolderMoveResult>
  trash(id: FolderId): Promise<TrashResult>
}
```

La root non può essere rinominata, spostata o cestinata.

## OPS-FOLDER-003 — Creazione folder

`Nuova cartella` apre input inline vuoto nel parent determinato come per `Nuova nota`.

- nome vuoto + blur/Esc → annulla;
- Invio o blur valido → crea;
- collisione/invalid name → mantiene input + errore;
- nessun placeholder `Nuova cartella (2)` viene materializzato automaticamente.

## OPS-FOLDER-004 — Move constraints

È vietato spostare una cartella:

- dentro sé stessa;
- dentro un proprio discendente;
- fuori dalla root;
- su un target collidente.

## OPS-FOLDER-005 — Dirty descendants

Prima di rename/move/trash di una cartella, tutte le document sessions interessate vengono flushate.

Se una nota coinvolta resta in `error/conflict`, l'operazione folder è bloccata. Non si sposta/cestina una cartella mentre contiene modifiche locali non risolte.

---

# 8. Markdown canonico, frontmatter e link

## OPS-MD-001 — Dialetto Markdown

V0.1 usa **CommonMark + GitHub Flavored Markdown** per il rendering di lettura, includendo almeno:

- heading;
- emphasis;
- blockquote;
- liste;
- code inline/fenced;
- link;
- tabelle GFM;
- task list;
- strikethrough.

## OPS-MD-002 — Raw HTML

Raw HTML nel Markdown **non viene eseguito/renderizzato come HTML** in V0.1. Viene mostrato come testo/markup non eseguibile.

Script, event handler, iframe e HTML arbitrario non devono poter eseguire codice nel renderer.

## OPS-MD-003 — Frontmatter canonico

V0.1 riconosce YAML frontmatter solo se il file inizia con un blocco delimitato da `---`.

Il frontmatter resta testo dell'utente e viene preservato byte/semanticamente quanto possibile.

Campo canonico V0.1:

```yaml
aliases:
  - Meradyl capitale
  - Città di Meradyl
```

Sono accettati:

- `aliases: string`;
- `aliases: string[]`.

Internamente vengono normalizzati in `string[]` per la ricerca.

Chiavi sconosciute vengono preservate.

## OPS-MD-004 — Frontmatter invalido

YAML invalido non impedisce di aprire/modificare la nota come Markdown grezzo.

- la nota mostra una diagnostica non bloccante;
- alias non affidabili vengono ignorati;
- il save non tenta di "riparare" il YAML automaticamente.

## OPS-MD-005 — Alias non sono identità

Gli alias:

- partecipano al search ranking;
- **non** cambiano NoteId;
- **non** partecipano alla risoluzione dei wikilink in V0.1;
- non creano backlink.

## OPS-MD-006 — Immagini locali in read mode

Sono renderizzabili immagini relative **dentro la root campagna** nei formati:

- PNG;
- JPEG/JPG;
- WebP;
- GIF.

Path assoluti, traversal e immagini remote non vengono caricati automaticamente.

SVG non viene renderizzato inline nella V0.1.

## OPS-MD-007 — Link Markdown normali

Azioni supportate:

- `http:` / `https:` → apertura nel browser di sistema tramite API sicura Electron;
- `mailto:` → client mail di sistema;
- link relativo a `.md` dentro la campagna → apertura della nota relativa al path della nota sorgente.

Schemi come `javascript:`, `data:`, `file:` e custom scheme non sono eseguiti.

Link ad altri file locali possono essere mostrati come testo/link non attivo in V0.1; non devono lanciare eseguibili o file arbitrari.

---

# 9. Wikilink canonici

## OPS-WIKI-001 — Sintassi V0.1

Riconosciuti:

```text
[[Nota]]
[[Cartella/Nota]]
[[Cartella/Nota.md]]
```

Non sono sintassi V0.1:

- `[[Nota|Alias]]`;
- `[[Nota#Heading]]`;
- embed `![[...]]`;
- traversal `../`;
- path assoluti.

Forme non supportate restano testo non navigabile, non vengono reinterpretate parzialmente.

## OPS-WIKI-002 — Contesti esclusi dal parser

Non si riconoscono wikilink dentro:

- fenced code;
- inline code;
- testo escapato con backslash prima della sequenza `[[`.

Nel normale testo Markdown vengono riconosciuti anche dentro heading, liste e citazioni.

## OPS-WIKI-003 — Path-qualified root-relative

`[[Cartella/Nota]]` è relativo alla **root della campagna**, non alla cartella della nota sorgente.

`[[Nota]]` usa matching per filename stem globale.

I confronti sono case-insensitive/NFC per identità, ma il testo originale viene preservato.

## OPS-WIKI-004 — Ambiguo

Click su link ambiguo apre un popover/picker con:

- titolo candidato;
- percorso relativo completo.

Selezionare un candidato **apre** la nota ma non riscrive automaticamente il Markdown.

È disponibile un'azione separata `Rendi link univoco`, che sostituisce il target con il path-qualified scelto e passa dal normale save flow.

## OPS-WIKI-005 — Mancante

Click su link mancante offre `Crea nota`.

Destinazione:

- target senza path → stessa cartella della nota sorgente;
- target path-qualified → cartella specificata dal target.

Se il path-qualified contiene cartelle mancanti, l'azione esplicita `Crea Cartella/Nota` può creare anche la catena di cartelle, dopo validazione completa.

Se il target non può diventare un nome valido, l'utente modifica il titolo/path prima della creazione.

## OPS-WIKI-006 — Backlink

Backlink usa solo risoluzioni `resolved` canoniche. Missing/ambiguous vengono mostrati come diagnostica outgoing, non come backlink/graph edge.

---

# 10. Save, autosave e recovery

## OPS-SAVE-001 — Autosave fissato

V0.1 usa **600 ms** di inattività per note già materializzate.

Il valore non è configurabile nella V0.1.

`Ctrl+S` tenta save immediato.

## OPS-SAVE-002 — Recovery cadence

Quando un document session è dirty:

- recovery write dopo circa **300 ms** di inattività;
- durante digitazione continua, non devono passare più di circa **2 secondi** senza aggiornare una recovery persistita.

Il recovery write è separato dal save autorevole e non abilita stato `saved`.

## OPS-SAVE-003 — Recovery per note esistenti e nuovi draft

Formato concettuale esteso:

```ts
type RecoveryTarget =
  | { kind: 'existing'; noteId: NoteId; baseRevision?: NoteRevision }
  | { kind: 'new-draft'; draftId: string; parentFolder: FolderId; manualTitle?: string }

interface RecoveryDraft {
  campaignId: CampaignId
  target: RecoveryTarget
  markdown: string
  capturedAt: string
}
```

Questo sostituisce l'assunzione che ogni recovery abbia già un NoteId.

## OPS-SAVE-004 — Recovery center

All'apertura di una campagna con draft pendenti:

- la campagna apre normalmente se possibile;
- compare un banner/entry persistente `Bozze da recuperare`;
- nessun draft viene applicato automaticamente.

Per draft nuovo: `Ripristina`, `Esporta`, `Scarta`.

Per nota esistente:

- base ancora corrente → `Ripristina modifiche`;
- file cambiato → apre conflict flow;
- file mancante → `Ricrea`, `Salva come nuova`, `Esporta`, `Scarta`.

## OPS-SAVE-005 — Quando cancellare recovery

Una recovery viene eliminata solo quando:

- lo stesso contenuto è confermato come autorevole; oppure
- l'utente sceglie esplicitamente `Scarta`.

Rename/move remappa il target recovery se l'identità cambia in modo coordinato.

---

# 11. Modifiche esterne e conflict resolution

## OPS-EXT-001 — Clean external modify

Nota clean + nuova revisione su disco:

- ricarica automaticamente il contenuto;
- preserva cursore/scroll quando ragionevolmente mappabile;
- se la nota è attiva mostra feedback discreto `Aggiornata da disco`;
- search/backlink/graph vengono aggiornati dalla nuova versione autorevole.

## OPS-EXT-002 — Dirty external modify

Nota dirty + nuova revisione:

- stato `conflict`;
- autosave sospeso;
- local buffer e versione disco conservati;
- search continua a rappresentare la versione autorevole su disco.

## OPS-CONFLICT-001 — Azioni di risoluzione

Il conflict view rende disponibili entrambe le versioni e offre:

1. **Usa versione locale** — overwrite esplicito della versione disco corrente usando la sua nuova revision come base; richiede conferma chiara;
2. **Usa versione su disco** — scarta il buffer locale dopo conferma esplicita e rimuove la recovery corrispondente;
3. **Salva locale come nuova nota…** — crea una nuova nota senza toccare il file esterno;
4. **Annulla** — resta in conflict.

Nessuna scelta è automatica.

## OPS-EXT-003 — File eliminato esternamente

Tab aperta + file mancante → stato `missing`.

- buffer clean: `Chiudi tab` oppure `Ricrea file`;
- buffer dirty: `Ricrea con modifiche locali`, `Salva come nuova`, `Esporta`, `Chiudi conservando recovery`.

Nessuna ricreazione automatica.

## OPS-EXT-004 — Rename esterno

Delete+create esterno non viene correlato come rename salvo prova certa.

Il vecchio tab diventa `missing`; il nuovo file appare come nuova nota. L'utente decide.

## OPS-EXT-005 — Nuovo file esterno

Un nuovo `.md` valido appare nell'explorer e viene indicizzato/proiettato senza richiedere restart.

## OPS-EXT-006 — Encoding error esterno

Se una nota diventa non decodificabile come UTF-8:

- tree entry resta visibile con warning;
- apertura/reload produce `encoding_error`;
- ultimo buffer valido non viene sovrascritto automaticamente;
- la nota problematica viene esclusa dalle nuove proiezioni search/graph finché non torna leggibile.

---

# 12. Rename/move — transazione operativa

## OPS-MOVE-001 — Application-owned transaction

Rename/move di nota/cartella è coordinato da `packages/application`, non dalla UI e non dal filesystem adapter.

## OPS-MOVE-002 — Preflight completo

Prima di scrivere il journal:

1. valida target;
2. individua tutte le note interessate;
3. flush di document sessions interessate;
4. blocca l'operazione se resta `error/conflict`;
5. calcola le risoluzioni wikilink canoniche;
6. costruisce il piano di rewrite necessario;
7. legge e registra le revision attese di ogni source da modificare;
8. verifica collisioni e preferenze da remappare.

## OPS-MOVE-003 — Ordine di commit

Dopo journal persistito:

1. esegue il rename/move fisico della risorsa principale;
2. aggiorna identità runtime e mapping old→new;
3. riscrive una source wikilink alla volta usando expected revision;
4. aggiorna preference keys/recovery keys;
5. aggiorna search/backlink/graph;
6. chiude il journal con report.

La risorsa principale viene spostata **prima** dei rewrite: il sistema non deve scrivere link verso un target che non esiste ancora.

## OPS-MOVE-004 — Source cambiata dopo preflight

Se una source da riscrivere ha revision diversa:

- non viene sovrascritta;
- viene registrata come failed source;
- operazione finale `partial` se il target fisico è già stato spostato.

## OPS-MOVE-005 — Recovery journal forward-only

V0.1 non tenta rollback automatici multi-file.

Alla riapertura con journal incompleto:

- verifica stato reale;
- se il move principale è avvenuto, riprende **in avanti** gli step ancora sicuri;
- se non è avvenuto, chiude/abbandona il piano senza modificare source;
- se lo stato è ambiguo, abilita lettura ma blocca write sugli elementi coinvolti e mostra `Operazione incompleta — Ripara`.

Nessun successo viene dedotto senza verifica.

## OPS-MOVE-006 — Rewrite wikilink

- rename del filename stem → tutti i link `resolved` che altrimenti smetterebbero di risolvere vengono aggiornati;
- move senza cambio stem → link basename che restano validi non vengono riscritti;
- path-qualified → aggiornati quando il path cambia;
- missing/ambiguous → mai riscritti per supposizione;
- codice/escaped wikilink → mai riscritti perché non sono link canonici.

## OPS-MOVE-007 — Folder move

Folder rename/move applica una mappatura old→new a tutte le note discendenti e remappa:

- tab/document sessions;
- history;
- favorites/recenti;
- recovery target;
- graph manual positions;
- folder colors;
- path-qualified wikilink necessari;
- search documents.

---

# 13. Trash

## OPS-TRASH-001 — Nessun permanent delete V0.1

La V0.1 **non offre cancellazione permanente** come fallback.

Se il cestino è indisponibile, l'operazione termina e l'elemento resta intatto.

## OPS-TRASH-002 — Nota aperta

Prima del trash:

- clean → può procedere dopo conferma dove richiesta;
- dirty → tenta save;
- error/conflict → trash bloccato finché il contenuto non è risolto.

Dopo trash riuscito:

- chiude tab relative;
- rimuove history entry non più valida;
- rimuove favorite/recent entry;
- aggiorna search/backlink/graph.

## OPS-TRASH-003 — Cartella non vuota

Richiede conferma esplicita che indichi almeno il numero di note/cartelle contenute.

Dirty/conflict discendenti bloccano l'operazione come `OPS-FOLDER-005`.

---

# 14. Recenti, preferiti e sidebar filter

## OPS-RECENT-001 — Recenti note

`Recenti` contiene massimo **50 note**.

Ordinamento: `lastTouchedAt` decrescente, dove `lastTouchedAt` è l'ultimo tra:

- apertura/attivazione della nota;
- save autorevole riuscito.

Entry mancanti vengono eliminate dopo conferma `not_found`.

Rename/move remappa l'identità senza perdere il timestamp.

## OPS-FAV-001 — Preferiti

Preferito è locale alla campagna.

- toggle immediato nelle preferenze locali;
- ordine alfabetico per titolo/path;
- rename/move remappa;
- trash/not_found confermato rimuove l'entry.

## OPS-FILTER-001 — Filtro sidebar

Il filtro sidebar è case-insensitive e cerca in nome + percorso visibile.

Comportamento:

- match nota → mostra la nota e tutta la catena di antenati;
- match cartella → mostra la cartella e il suo subtree;
- durante filtro l'espansione temporanea non sovrascrive lo stato espanso/collassato precedente;
- cancellare filtro ripristina lo stato di espansione precedente.

---

# 15. Ricerca full-text

## OPS-SEARCH-001 — Vista centrale

Rail `Ricerca` apre la vista centrale Search e mette focus nel campo query.

Query vuota mostra uno stato neutro `Digita per cercare nelle note`, non una dashboard aggiuntiva.

## OPS-SEARCH-002 — Accenti

V0.1 richiede matching interattivo **diacritic-insensitive** per alfabeti latini comuni.

Esempio: `citta` trova `città`.

Il testo originale non viene modificato. A parità di altri fattori, un match ortograficamente esatto può essere preferito a quello ottenuto solo per folding dei diacritici.

## OPS-SEARCH-003 — Alias

Gli `aliases` canonici del frontmatter sono sempre indicizzati nella V0.1.

## OPS-SEARCH-004 — Stato indice

- `ready` → risultati normali;
- `building` con vecchio indice valido → query consentita ma banner `Risultati in aggiornamento`;
- `building` senza indice → campo disponibile, stato `Preparazione ricerca…`, nessuna falsa completezza;
- `stale` → risultati marcati `in aggiornamento` e rebuild pianificato;
- `error`/`missing` → vault resta utilizzabile; azione `Ricostruisci indice`.

## OPS-SEARCH-005 — Apertura risultato

- click/Invio → apre nella tab corrente secondo navigation model;
- `Ctrl+Invio` / azione equivalente → nuova tab esplicita;
- Esc con query non vuota → pulisce la query;
- Esc con query vuota → torna alla vista Note precedente.

## OPS-SEARCH-006 — Documento non indicizzabile

Una singola nota problematica non abbatte l'intero indice. Search mostra un warning aggregato tipo `1 nota non indicizzata`; dettagli tecnici restano in diagnostica.

## OPS-SEARCH-007 — Codice Markdown

Testo visibile dentro inline/fenced code è ricercabile come testo. I marker sintattici non sono termini significativi. Wikilink in code non diventano relazioni.

---

# 16. Command palette

## OPS-CMD-001 — Azioni minime garantite

Il registro V0.1 contiene almeno, quando applicabili:

- `Nuova nota`;
- `Nuova cartella`;
- `Cerca`;
- `Note`;
- `Grafo`;
- `Recenti`;
- `Preferiti`;
- `Impostazioni`;
- `Apri campagna…`;
- `Chiudi campagna`;
- `Rinomina nota`;
- `Sposta nota…`;
- `Sposta nel cestino`;
- `Modalità lettura/modifica`;
- `Ricostruisci indice di ricerca`.

Azioni non valide nel contesto sono disabled o assenti, mai eseguibili.

## OPS-CMD-002 — Note vs azioni

Le note e le azioni sono sezioni/tipi distinti. Il profilo note privilegia title exact/prefix/path; il full body search resta nella vista Ricerca.

---

# 17. Graph view

## OPS-GRAPH-001 — Direzione degli archi

Gli archi sono diretti `source → target` perché derivano da wikilink. La visualizzazione deve rendere percepibile la direzione senza sacrificare leggibilità; arrowhead sottile o equivalente è richiesto.

Self-link è consentito e produce self-edge.

## OPS-GRAPH-002 — Filtri folder

I filtri sono **multi-select**.

- nessun filtro → tutti i nodi normali;
- selezionare una cartella include quella cartella **e tutti i discendenti**;
- più cartelle usano logica OR;
- root può essere selezionata come gruppo delle note direttamente in root;
- nodi non matching vengono attenuati, non rimossi.

## OPS-GRAPH-003 — Selezione e filtro

La selezione può restare attiva anche se il nodo è attenuato. `Cancella selezione` non modifica i filtri; `Ripristina filtri` non modifica la selezione.

## OPS-GRAPH-004 — Apertura

- click nodo → seleziona;
- doppio click oppure `Invio` con nodo selezionato → apre la nota;
- dettaglio flottante contiene `Apri nota`.

## OPS-GRAPH-005 — Layout stabile

Per grafo invariato, l'initial layout deve essere deterministico abbastanza da non produrre una disposizione completamente diversa a ogni rebuild.

Posizioni trascinate manualmente prevalgono e vengono persistite localmente per NoteId.

Rename/move remappa le posizioni; trash le rimuove.

## OPS-GRAPH-006 — Aggiornamento

Save/rename/move/trash accettati aggiornano la proiezione senza richiedere restart. Un errore della proiezione non rende fallito un save autorevole: il grafo viene marcato stale e ricostruito.

---

# 18. Impostazioni V0.1

## OPS-SET-001 — Settings è una vista reale ma minima

La voce `Impostazioni` apre una vista centrale semplice. V0.1 non inventa preferenze prive di uso reale.

Contiene almeno:

### Campagna

- path corrente in sola lettura;
- `Apri cartella in Esplora file`.

### Ricerca

- stato indice;
- `Ricostruisci indice`.

### Interfaccia

- `Ripristina disposizione pannelli` — ripristina dimensioni/collasso sidebar+inspector, senza cancellare favorites, recenti, folder colors o dati campagna.

### Applicazione

- versione app.

Autosave, tema e altre preferenze non sono configurabili in V0.1 salvo decisione successiva esplicita.

---

# 19. Errori operativi e azioni utente

## OPS-ERR-001 — Error codes minimi

L'application layer deve distinguere almeno:

```text
campaign_unavailable
read_only
permission_denied
metadata_invalid
unsupported_schema
duplicate_campaign_id
invalid_path
invalid_name
outside_campaign_root
collision
case_collision
not_found
conflict
trash_unavailable
disk_full
encoding_error
io_error
index_missing
index_stale
index_error
operation_partial
operation_recovery_required
preferences_corrupt
```

## OPS-ERR-002 — Mapping UX minimo

| Errore | Comportamento |
|---|---|
| `read_only` / `permission_denied` open | blocca apertura; scegli altra cartella/riprova |
| `disk_full` save | buffer + recovery, stato error, riprova/esporta |
| `conflict` | conflict view, autosave sospeso |
| `not_found` note aperta | stato missing, nessuna ricreazione implicita |
| `trash_unavailable` | elemento intatto, nessun permanent delete |
| `index_*` | campagna utilizzabile, rebuild disponibile |
| `operation_partial` | report con path aggiornati/falliti |
| `preferences_corrupt` | reset sole preferenze + notifica non bloccante |
| `metadata_invalid` / `unsupported_schema` | apertura bloccata, nessun rewrite |

La UI non dipende dal testo di eccezioni native.

## OPS-ERR-003 — Errori non modali quando possibile

Errori locali non distruttivi (search stale, preference reset, external reload) usano banner/toast/status inline. Modali sono riservati a decisioni che possono perdere/sovrascrivere dati o cambiare campagna.

---

# 20. Persistenza preferenze e remap

## OPS-PREF-001 — Contenuti `ui.json`

Può contenere almeno:

- rail/view attiva;
- tab/order/history;
- panel sizes/collapse;
- recenti;
- preferiti;
- folder colors;
- graph filters/camera/manual positions.

Non contiene il buffer Markdown autorevole.

## OPS-PREF-002 — Corruzione

Se `ui.json` è corrotto:

- viene spostato/archiviato come diagnostica se possibile;
- si caricano default;
- la campagna apre;
- nessun contenuto campagna/recovery viene cancellato.

## OPS-PREF-003 — Scrittura preference failure

Errore di salvataggio preferenze non trasforma un save Markdown riuscito in fallimento. Viene segnalato separatamente.

---

# 21. Keyboard e focus

## OPS-KEY-001 — Shortcut V0.1 Windows

Vincolanti:

- `Ctrl+K` → command palette;
- `Ctrl+S` → save immediato;
- `Ctrl+A` → comportamento nativo dell'editor quando focus nel testo; selezione contestuale solo fuori editor;
- `Esc` → annulla/chiude il livello interattivo corrente;
- `Invio` → conferma rename/input o apre elemento selezionato secondo contesto;
- frecce → navigazione di liste/palette/graph quando il focus non è nell'editor.

Eventuali shortcut aggiuntive non devono intercettare combinazioni standard dell'editor senza necessità.

## OPS-KEY-002 — Drag non obbligatorio

Create/move/rename/trash, reorder significativo e graph navigation devono avere percorso da menu/palette/tastiera.

---

# 22. Scala e quality gate V0.1

## OPS-PERF-001 — 200 non è il massimo

`200 note / 15 cartelle` resta il **dataset minimo di test UX automatico**, non un limite prodotto.

Target di robustezza V0.1:

- almeno **2.000 note**;
- almeno **100 cartelle**;
- note lunghe realistiche;
- backlink numerosi.

A questa scala l'app deve restare funzionalmente corretta e non bloccare in modo persistente la shell. I budget in ms vengono misurati durante implementazione e documentati al gate.

## OPS-PERF-002 — Windows gate

Release V0.1 supportata ufficialmente solo su Windows.

Devono essere verificati realmente su Windows:

- packaging/install;
- path policy;
- case-only rename;
- watcher;
- atomic save strategy;
- system trash;
- recovery dopo crash;
- comportamento con cartella spostata/non disponibile.

---

# 23. Scelte intenzionalmente lasciate all'implementazione

Non sono ambiguità di prodotto e possono essere scelte senza nuova decisione, purché rispettino i contract test:

- libreria editor Markdown;
- libreria parser GFM, purché rispetti `OPS-MD-*` e `OPS-WIKI-*`;
- search engine concreto BM25/equivalente;
- formato fisico dell'indice;
- batch size search;
- algoritmi interni di graph layout, purché il risultato sia stabile e le posizioni manuali rispettate;
- state management React/Zustand interno alla UI, entro i confini architetturali;
- component library/icon set coerenti col design;
- esatti timing motion e dimensioni pannelli, entro i default già documentati e dopo verifica;
- logging/telemetry locale di diagnostica, purché non introduca cloud/networking V0.1.

Qualunque scelta che modifichi un comportamento osservabile definito in questo documento richiede aggiornamento della spec, non una decisione nascosta nel codice.

---

# 24. Scenari end-to-end obbligatori

## OPS-ACC-001 — Prima apertura

Cartella Markdown writable senza metadata → crea solo `campaign.json`, apre note esistenti, nessuna conversione.

## OPS-ACC-002 — Nuova nota breve

`Nuova nota` → scrivo `Lady Maya` → esco dalla nota → viene creato `Lady Maya.md` con contenuto intatto.

## OPS-ACC-003 — Nuova nota lunga

Scrivo `Il vecchio castello sulla collina` → alla prima materializzazione titolo `Il vecchio castello.md`, poi il titolo non cambia automaticamente.

## OPS-ACC-004 — Nuova nota vuota

`Nuova nota` → nessun contenuto significativo → cambio vista/chiudo tab → nessun file, nessuna recovery.

## OPS-ACC-005 — Collisione nuova nota

Esiste `Lady Maya.md` → draft con prime parole `Lady Maya` → nessun `Lady Maya (2).md`; draft intatto e richiesta nuovo titolo.

## OPS-ACC-006 — Folder CRUD

Creare, rinominare, spostare e cestinare una cartella reale aggiorna explorer e identità senza perdere note.

## OPS-ACC-007 — Link ambiguo

`NPC/Alden.md` + `Cities/Alden.md` → `[[Alden]]` apre picker, nessun target arbitrario.

## OPS-ACC-008 — Link mancante

Da `NPC/Maya.md`, `[[Taron]]` mancante → `Crea nota` propone/crea `NPC/Taron.md`; `[[Places/Taron]]` crea nel path esplicito.

## OPS-ACC-009 — Wikilink in code

`` `[[Segreto]]` `` e fenced code non producono backlink/graph edge.

## OPS-ACC-010 — Rename sicuro

Rename target + più inbound links → preflight/journal/move/rewrite. Source cambiata esternamente dopo preflight → partial, nessun overwrite stale.

## OPS-ACC-011 — Crash rename

Crash dopo move fisico ma prima di tutti i rewrite → riapertura rileva journal e riprende in avanti senza dichiarare successo prematuro.

## OPS-ACC-012 — Save conflict

Dirty local + external edit → autosave sospeso; locale e disco entrambi recuperabili; nessun overwrite automatico.

## OPS-ACC-013 — Disk full

Save fallisce per disco pieno → file precedente intatto, buffer + recovery presenti, stato error.

## OPS-ACC-014 — File deleted externally

Nota aperta eliminata da altro programma → stato missing, nessuna ricreazione automatica.

## OPS-ACC-015 — Search building

Indice assente → campagna e editor funzionano; Search mostra building e diventa pronta dopo rebuild senza modificare Markdown.

## OPS-ACC-016 — Alias search

Frontmatter `aliases: [Regina Maya]` → query `Regina Maya` trova la nota; `[[Regina Maya]]` non risolve via alias.

## OPS-ACC-017 — Graph filters

Filtro cartella `NPC` attenua tutto tranne `NPC` + discendenti; aggiungere `Places` usa OR; reset filtro non cancella selezione.

## OPS-ACC-018 — Trash unavailable

Trash adapter fallisce → nessun permanent delete, file/cartella intatti.

## OPS-ACC-019 — Switch campaign con errore save

Una nota non salvabile → switch mostra scelta di restare o cambiare conservando recovery confermata; nessuna perdita silenziosa.

## OPS-ACC-020 — Campagna spostata

Root spostata mentre chiusa → riapertura dal nuovo path con stesso CampaignId conserva preferenze. Entrambi i path esistenti con stesso ID → prompt copia indipendente.

## OPS-ACC-021 — Preference corruption

`ui.json` corrotto → campagna apre con default, note intatte, recovery intatta.

## OPS-ACC-022 — 2.000 note

Fixture grande → discovery/search/index/graph restano corretti; eventuale lentezza viene misurata e ottimizzata senza cambiare semantica.

---

# 25. Gate finale operativo

La V0.1 può essere dichiarata pronta soltanto quando:

1. tutti gli `OPS-ACC-*` applicabili hanno test automatici o E2E documentati;
2. nessun percorso normale può perdere un buffer senza save, recovery o discard esplicito;
3. nessun rename/move/trash può sovrascrivere modifiche concorrenti silenziosamente;
4. search/backlink/graph possono essere eliminati e ricostruiti;
5. un agente di implementazione non deve decidere autonomamente lifecycle, parser semantics, folder support, conflict UX, search surface, graph filter semantics o campaign lifecycle;
6. le scelte ancora libere sono soltanto quelle elencate in §23;
7. ROADMAP, architecture e SPEC_INDEX puntano a questo documento come contratto operativo V0.1.

---

## Regola finale

La V0.1 è sufficientemente progettata quando chi implementa deve scegliere **come** realizzare il comportamento, non **quale comportamento inventare**.