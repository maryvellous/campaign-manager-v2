# Campaign Manager v2 — Domain Model

## 1. Scopo e autorità

Questo documento definisce il modello di dominio della V0.1 e i contratti che il codice deve rispettare indipendentemente da React, Electron e filesystem.

È una specifica normativa. In caso di conflitto, le decisioni esplicite più recenti e `docs/UI_UX_SPEC_V01.md` prevalgono sul comportamento dimostrativo dei mock.

Il dominio della V0.1 comprende:

- campagna locale;
- note Markdown;
- cartelle;
- wikilink e backlink derivati;
- operazioni di creazione, modifica, rinomina, spostamento e cestino;
- proiezione grafo derivata;
- confini verso persistenza, ricerca e preferenze locali.

Non comprende:

- Electron o API del sistema operativo;
- componenti React;
- account, auth o sync EcoGDR;
- realtime;
- Discord;
- AI;
- formato fisico del compendio.

Il compendio è un bounded context separato definito in `docs/COMPENDIUM_SPEC.md`.

---

## 2. Principi del dominio

### DOM-CORE-001 — Core indipendente dall'infrastruttura

`packages/core` non dipende da Electron, React, Cloudflare, Discord, EcoGDR, SQLite o API filesystem.

Il core conosce tipi, invarianti, use case e interfacce. Gli adapter concreti vivono fuori dal core.

### DOM-CORE-002 — Filesystem autorevole, ma non esposto al core

La cartella locale è la fonte autorevole dei dati persistenti della campagna, ma il core non accede direttamente al filesystem.

Il core opera attraverso repository e servizi tipizzati.

### DOM-CORE-003 — Dati derivati ricostruibili

Backlink, indice di ricerca e grafo sono proiezioni ricostruibili dalle note autorevoli.

La loro perdita non deve causare perdita di contenuto della campagna.

### DOM-CORE-004 — Nessun successo simulato

Un'operazione persistente è completata solo quando il repository restituisce successo.

Timer, debounce, aggiornamento dello store UI o modifica del buffer non equivalgono a persistenza riuscita.

---

# 3. Identificatori e valori fondamentali

## DOM-ID-001 — `CampaignId`

Ogni campagna gestita dal Campaign Manager possiede un identificatore locale stabile generato alla prima inizializzazione.

Forma concettuale:

```ts
type CampaignId = string
```

Requisiti:

- non deriva dal nome della cartella;
- non cambia se la cartella viene rinominata o spostata;
- non è un account ID;
- non è un ID EcoGDR;
- serve a correlare metadati locali, preferenze e recovery senza dipendere dal path assoluto.

## DOM-ID-002 — `NoteId`

Nella V0.1 l'identità persistente e trasparente di una nota è il suo **percorso Markdown relativo alla root della campagna**.

Esempi:

```text
Locations/Meradyl.md
NPC/Alden Corvin.md
Sessions/2026-09-08.md
```

Forma concettuale:

```ts
type NoteId = string // normalized campaign-relative path, extension .md included
```

Regole:

- usa `/` come separatore logico indipendentemente dal sistema operativo;
- non contiene segmenti `.` o `..` dopo la normalizzazione;
- non è mai un path assoluto;
- mantiene la forma visuale originale, ma i confronti logici devono evitare collisioni di sola maiuscola/minuscola tra piattaforme;
- una rinomina o uno spostamento produce un nuovo `NoteId`.

La V0.1 **non introduce UUID nascosti per le note** e non modifica automaticamente il frontmatter per aggiungere identità tecniche.

## DOM-ID-003 — `FolderId`

Una cartella è identificata dal percorso relativo alla root campagna senza slash finale.

La root è rappresentata da un valore dedicato o dalla stringa vuota secondo l'implementazione, purché il contratto sia univoco.

## DOM-ID-004 — `NoteRevision`

Ogni nota letta dal repository porta un token di revisione opaco.

```ts
type NoteRevision = string
```

Il core non interpreta il token. Serve per impedire scritture stale e sovrascritture silenziose dopo modifiche esterne.

---

# 4. Campagna

## DOM-CAM-001 — `CampaignMetadata`

Modello minimo:

```ts
interface CampaignMetadata {
  schemaVersion: number
  campaignId: CampaignId
  name?: string
  externalBinding?: ExternalCampaignBinding
}

interface ExternalCampaignBinding {
  provider: string
  campaignId: string
}
```

`externalBinding` è opzionale e non viene usato dalla V0.1.

Serve soltanto a garantire che in futuro una campagna locale possa essere associata a un sistema remoto senza cambiare il modello fondamentale del vault.

Il core non conosce autenticazione, API o sincronizzazione del provider.

## DOM-CAM-002 — Campagna locale autonoma

L'assenza di `externalBinding` non limita nessuna funzione locale della V0.1.

La perdita o rimozione futura di un binding remoto non deve rendere inutilizzabile la campagna locale.

## DOM-CAM-003 — Root fisica fuori dal dominio

Il path assoluto della cartella è configurazione dell'adapter/applicazione, non identità di dominio.

Il core lavora con `CampaignId`, `NoteId` e `FolderId` relativi.

---

# 5. Nota

## DOM-NOTE-001 — Modello `Note`

```ts
interface Note {
  id: NoteId
  title: string
  markdown: string
  revision: NoteRevision
}
```

`markdown` rappresenta il contenuto completo del file, incluso eventuale frontmatter.

## DOM-NOTE-002 — Titolo

Il titolo operativo della nota nella V0.1 coincide con il nome del file senza estensione `.md`.

Cambiare il titolo attraverso il controllo di rinomina significa rinominare il file.

Un heading `# Titolo` nel Markdown non sostituisce automaticamente il titolo-file.

## DOM-NOTE-003 — Frontmatter

Il frontmatter è contenuto dell'utente.

Il Campaign Manager può leggerlo quando necessario, ma deve:

- preservare chiavi sconosciute;
- non inserirvi preferenze UI;
- non usarlo come contenitore obbligatorio per ID tecnici della V0.1;
- non riscriverlo inutilmente durante salvataggi che non lo modificano.

## DOM-NOTE-004 — Stato editor separato

`dirty`, `saving`, `saved`, cursore, selezione, undo/redo e modalità lettura non fanno parte di `Note`.

Sono stato applicativo/UI relativo a una nota.

## DOM-NOTE-005 — Creazione

`createNote(parentFolder, title)` deve:

- validare il nome tramite policy di storage;
- evitare collisioni logiche;
- creare una nota Markdown reale;
- restituire la `Note` persistita con `revision` valida.

Nessuna nota viene considerata creata finché il repository non conferma.

---

# 6. Cartelle

## DOM-FOLDER-001 — Cartelle reali

Le cartelle del vault corrispondono a directory reali sotto la root della campagna.

Non esiste una tassonomia virtuale obbligatoria come `NPC`, `Luoghi`, `Sessioni`.

## DOM-FOLDER-002 — Nessuna struttura imposta

Il Campaign Manager può proporre esempi, ma non richiede una struttura fissa della campagna.

## DOM-FOLDER-003 — Preferenze visuali separate

Colori cartella, stato espanso/collassato e preferiti non fanno parte del contenuto autorevole del vault.

Sono preferenze locali per campagna.

L'assegnazione cromatica usa un token logico, non un valore hex nel dominio:

```ts
type GraphFolderColor = 'graph-1' | 'graph-2' | 'graph-3' | 'graph-4' | 'graph-5'
```

La mappatura ai colori reali appartiene alla UI/design system.

## DOM-FOLDER-004 — Eredità colore

Il colore effettivo di una cartella è:

1. il proprio colore esplicito, se presente;
2. altrimenti quello dell'antenato più vicino con assegnazione esplicita;
3. altrimenti neutro.

Una nota eredita il colore effettivo della cartella che la contiene.

---

# 7. Wikilink

## DOM-LINK-001 — Sintassi minima V0.1

La V0.1 deve supportare almeno:

```text
[[Nota]]
[[Cartella/Nota]]
```

L'estensione `.md` può essere accettata in input ma non è necessaria nella rappresentazione visuale.

Alias e sintassi avanzate non sono requisito della V0.1 salvo decisione successiva esplicita.

## DOM-LINK-002 — Parsing separato dalla risoluzione

Il parser estrae riferimenti testuali senza decidere arbitrariamente il target.

```ts
interface WikilinkReference {
  source: NoteId
  rawTarget: string
  range: TextRange
}
```

La risoluzione produce uno stato esplicito.

```ts
type WikilinkResolution =
  | { status: 'resolved'; target: NoteId }
  | { status: 'missing' }
  | { status: 'ambiguous'; candidates: NoteId[] }
```

## DOM-LINK-003 — Regole di risoluzione

Ordine minimo:

1. target con percorso → confronto col percorso relativo normalizzato, con o senza `.md`;
2. target senza percorso → confronto con il filename stem delle note;
3. un solo match → `resolved`;
4. zero match → `missing`;
5. più match → `ambiguous`.

Il resolver non sceglie silenziosamente il primo candidato ambiguo.

## DOM-LINK-004 — Collisioni di case

Per portabilità, due note che differiscono solo per maiuscole/minuscole sono considerate una collisione logica da segnalare.

Il sistema non deve affidarsi alla diversa semantica di Windows, macOS o Linux per disambiguarle.

## DOM-LINK-005 — Backlink

I backlink sono derivati dai wikilink.

Un backlink risolto contiene almeno:

```ts
interface Backlink {
  source: NoteId
  target: NoteId
  occurrences: number
}
```

I riferimenti mancanti o ambigui possono essere mostrati in diagnostica ma non diventano archi risolti del grafo.

---

# 8. Rinomina e spostamento

## DOM-RENAME-001 — Rinomina come use case coordinato

Rinominare una nota non è una semplice `fs.rename`.

Il use case deve:

1. validare il nuovo nome;
2. determinare il nuovo `NoteId`;
3. individuare i wikilink attualmente risolti verso la nota;
4. preparare gli aggiornamenti necessari;
5. eseguire la rinomina e gli aggiornamenti tramite repository;
6. restituire un report verificabile.

## DOM-RENAME-002 — Nessuna riscrittura di link non risolti

Wikilink `missing` o `ambiguous` non vengono riscritti fingendo di conoscerne l'intento.

## DOM-RENAME-003 — Esito esplicito

```ts
interface RenameNoteResult {
  oldId: NoteId
  newId?: NoteId
  status: 'success' | 'partial' | 'failed'
  updatedSources: NoteId[]
  failedSources: Array<{ noteId: NoteId; reason: string }>
}
```

Uno stato `partial` deve essere visibile all'utente e non può essere trasformato in successo generico.

## DOM-MOVE-001 — Spostamento

Spostare una nota cambia `NoteId` e segue gli stessi principi della rinomina.

I link path-qualified che altrimenti smetterebbero di risolversi devono essere aggiornati. I link per basename che restano validi non richiedono riscrittura cosmetica.

## DOM-MOVE-002 — Spostamento cartella

Lo spostamento di una cartella produce una mappatura vecchio→nuovo per tutte le note contenute e deve aggiornare coerentemente:

- identità runtime delle note aperte;
- preferenze locali keyed by folder/note path;
- link path-qualified che richiedono correzione.

---

# 9. Eliminazione

## DOM-DELETE-001 — Cestino, non delete permanente implicito

Il dominio richiede un'operazione `trash`, non `unlink` permanente.

Se l'adapter di sistema non può usare il cestino, l'operazione fallisce con errore esplicito.

Non è ammesso fallback silenzioso alla cancellazione definitiva.

## DOM-DELETE-002 — Contenuti con buffer pending

L'applicazione deve verificare eventuali buffer non persistiti prima di richiedere l'eliminazione.

Il repository non è responsabile di inventare una decisione UX.

## DOM-DELETE-003 — Cartelle non vuote

Il dominio espone abbastanza informazione da consentire una conferma esplicita prima di mandare al cestino una cartella non vuota.

---

# 10. Concorrenza locale e conflitti

## DOM-CONFLICT-001 — Optimistic concurrency

Ogni salvataggio di una nota esistente fornisce la `NoteRevision` letta o confermata più recentemente.

Il repository può restituire:

```ts
type SaveNoteResult =
  | { status: 'saved'; note: Note }
  | { status: 'conflict'; current: Note }
  | { status: 'error'; error: RepositoryError }
```

## DOM-CONFLICT-002 — Nessuna sovrascrittura silenziosa

Se la revisione sul disco non corrisponde a quella attesa, il repository non sovrascrive automaticamente il file.

La UI entra nello stato di conflitto descritto in `docs/UI_UX_SPEC_V01.md`.

---

# 11. Graph projection

## DOM-GRAPH-001 — Grafo derivato

Il grafo non è una fonte dati indipendente.

```ts
interface NoteGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

interface GraphNode {
  noteId: NoteId
  effectiveFolderColor?: GraphFolderColor
}

interface GraphEdge {
  source: NoteId
  target: NoteId
  occurrences: number
}
```

## DOM-GRAPH-002 — Nodi

Ogni nota valida appare come nodo, incluse note isolate senza wikilink.

## DOM-GRAPH-003 — Archi

Gli archi derivano soltanto da wikilink `resolved`.

Più riferimenti dalla stessa nota allo stesso target possono essere rappresentati da un solo arco con `occurrences > 1`.

## DOM-GRAPH-004 — Layout non autorevole

Posizione manuale, camera, zoom, filtri e selezione sono preferenze/stato UI.

Trascinare un nodo non crea, elimina o modifica wikilink.

---

# 12. Repository contracts

## DOM-REPO-001 — `CampaignRepository`

Contratto concettuale:

```ts
interface CampaignRepository {
  open(): Promise<CampaignMetadata>
  saveMetadata(metadata: CampaignMetadata): Promise<CampaignMetadata>
}
```

## DOM-REPO-002 — `NoteRepository`

Contratto minimo:

```ts
interface NoteRepository {
  list(): Promise<NoteSummary[]>
  get(id: NoteId): Promise<Note | null>
  create(input: CreateNoteInput): Promise<Note>
  save(input: SaveNoteInput): Promise<SaveNoteResult>
  rename(id: NoteId, newTitle: string): Promise<RepositoryMoveResult>
  move(id: NoteId, targetFolder: FolderId): Promise<RepositoryMoveResult>
  trash(id: NoteId): Promise<TrashResult>
}
```

Il repository gestisce persistenza fisica; il use case applicativo coordina operazioni multi-file come rinomina + aggiornamento wikilink.

## DOM-REPO-003 — Errori tipizzati

Gli errori devono essere distinguibili almeno per categoria:

```text
not_found
permission_denied
read_only
invalid_path
collision
conflict
trash_unavailable
io_error
metadata_invalid
```

La UI non deve dedurre il significato dell'errore parsando stringhe arbitrarie.

---

# 13. Confini con preferenze, recovery e ricerca

## DOM-BOUNDARY-001 — Preferenze locali

Tab, pannelli, recenti, preferiti, colori cartella e stato grafo non fanno parte del `CampaignRepository` autorevole.

Usano un repository di preferenze locali separato.

## DOM-BOUNDARY-002 — Recovery

Le bozze di recovery sono copie di sicurezza del buffer, non nuove versioni autorevoli della nota.

Il loro formato e ciclo di vita sono definiti in `docs/STORAGE_SPEC.md`.

## DOM-BOUNDARY-003 — Ricerca

L'indice full-text è derivato.

Può essere cancellato e ricostruito dalle note senza perdita dati.

## DOM-BOUNDARY-004 — Compendio

Il compendio non è una cartella speciale della campagna e non usa `NoteRepository`.

È accessibile tramite `CompendiumRepository`, definito in `docs/COMPENDIUM_SPEC.md`.

---

# 14. Invarianti V0.1

Devono risultare sempre vere:

1. nessun `NoteId` punta fuori dalla root campagna;
2. nessun successo di salvataggio viene emesso prima della conferma repository;
3. nessun conflitto di revisione viene risolto con overwrite silenzioso;
4. nessun wikilink ambiguo viene risolto arbitrariamente;
5. nessun grafo diventa fonte autorevole;
6. nessuna preferenza UI modifica automaticamente frontmatter o Markdown;
7. nessuna eliminazione permanente avviene come fallback del cestino;
8. nessuna dipendenza EcoGDR entra nel core;
9. una rinomina/spostamento restituisce sempre un esito completo, parziale o fallito;
10. una nota resta leggibile come normale file Markdown fuori dal Campaign Manager.

---

# 15. Scenari di accettazione

### DOM-ACC-001 — Nota normale

Creare `Locations/Meradyl.md`, modificarla, salvarla, chiudere e riaprire deve produrre lo stesso contenuto e una `revision` valida.

### DOM-ACC-002 — Rinomina con backlink

Con `A.md` contenente `[[B]]`, rinominare `B.md` in `C.md` deve aggiornare il riferimento risolto o restituire `partial/failed` con dettaglio. Non è ammesso dichiarare successo lasciando un aggiornamento fallito non segnalato.

### DOM-ACC-003 — Ambiguità

Con `NPC/Alden.md` e `Cities/Alden.md`, `[[Alden]]` deve essere `ambiguous`; `[[NPC/Alden]]` deve essere `resolved`.

### DOM-ACC-004 — Modifica esterna

Una nota letta alla revisione `r1`, modificata esternamente e poi salvata dall'editor con `r1` deve produrre `conflict`, non overwrite.

### DOM-ACC-005 — Grafo

Una campagna con tre note, una relazione risolta e una nota isolata deve produrre tre nodi e un arco.

### DOM-ACC-006 — Cestino indisponibile

Se l'adapter segnala `trash_unavailable`, la nota deve restare intatta.

### DOM-ACC-007 — Portabilità

Il dominio deve poter eseguire i test senza Electron e senza usare path assoluti nei propri identificatori.

---

## Regola finale

Se per implementare una feature V0.1 è necessario far conoscere al core un path assoluto, un componente React, una API Electron o un dettaglio EcoGDR, il confine architetturale è stato violato e la soluzione va riprogettata prima del merge.
