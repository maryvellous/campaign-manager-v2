# Campaign Manager v2 — Search Specification V0.1

## 1. Scopo

Questo documento definisce il contratto della ricerca locale della V0.1.

La ricerca deve permettere al DM di trovare rapidamente una nota senza conoscere la cartella in cui si trova, mantenendo il principio local-first e senza introdurre IA, cloud o database autorevoli paralleli al vault.

La V0.1 distingue tre strumenti:

1. **filtro per nome nella sidebar** — restringe rapidamente l'albero visibile;
2. **ricerca full-text** — cerca nel contenuto indicizzato delle note;
3. **command palette** — combina accesso rapido a note e azioni applicative.

Questa specifica è normativa per indice, query, ranking, rebuild, aggiornamenti incrementali, errori e contratti applicativi. `docs/UI_UX_SPEC_V01.md` resta autorità sul comportamento osservabile dell'interfaccia.

Prefisso requisiti: `SEA-*`.

---

# 2. Principi

## SEA-CORE-001 — Ricerca locale

La ricerca V0.1 funziona interamente sul computer del DM.

Non richiede:

- account;
- rete;
- cloud search;
- embeddings;
- vector database;
- provider IA.

## SEA-CORE-002 — Indice derivato

L'indice di ricerca non è autorevole.

La fonte autorevole resta il filesystem della campagna. L'indice deve poter essere cancellato e ricostruito integralmente dalle note.

## SEA-CORE-003 — Nessuna scrittura nel vault

Indicizzazione, ranking e query non modificano Markdown, frontmatter o struttura delle cartelle.

## SEA-CORE-004 — Contratto indipendente dal motore

UI e use case dipendono da un contratto di ricerca, non da una libreria specifica.

La prima implementazione deve essere una ricerca lessicale con ranking BM25 o equivalente verificabile. Il motore fisico può essere sostituito se conserva i comportamenti e i contract test di questa specifica.

## SEA-CORE-005 — Degradazione sicura

Indice mancante, corrotto o obsoleto non rende inutilizzabile la campagna.

L'app deve poter aprire il vault e ricostruire la ricerca senza perdita di dati autorevoli.

---

# 3. Confini e responsabilità

## SEA-BOUND-001 — Search service

Il core/applicazione espone un contratto equivalente a:

```ts
interface SearchService {
  searchNotes(query: SearchQuery): Promise<SearchResult[]>
  rebuild(): Promise<RebuildReport>
  getStatus(): Promise<SearchIndexStatus>
}
```

La UI non interroga direttamente file, database o librerie di indicizzazione.

## SEA-BOUND-002 — Index adapter

L'implementazione concreta dell'indice vive fuori dal dominio autorevole.

Forma concettuale:

```text
UI
 ↓
Search use case
 ↓
SearchService
 ↓
SearchIndex adapter
 ↓
indice locale derivato
```

## SEA-BOUND-003 — Parser condiviso

La pipeline di indicizzazione non deve inventare una seconda interpretazione incompatibile del Markdown o dei wikilink.

Quando esistono parser/domain service canonici per note, frontmatter e wikilink, la ricerca riusa i loro output o contratti.

---

# 4. Documento indicizzato

## SEA-DOC-001 — Un documento per nota

Ogni nota Markdown indicizzabile produce un documento logico di ricerca identificato dal suo `NoteId` corrente.

Esempio concettuale:

```ts
interface SearchDocument {
  noteId: NoteId
  title: string
  relativePath: string
  folderPath: string
  bodyText: string
  aliases: string[]
  revision: NoteRevision
}
```

`NoteRevision` deve corrispondere alla revisione effettivamente indicizzata.

## SEA-DOC-002 — Campi indicizzati

La V0.1 indicizza almeno:

- titolo/nome file;
- percorso relativo leggibile;
- testo Markdown normalizzato;
- alias espliciti se supportati dal frontmatter canonico.

Non indicizza come contenuto di ricerca:

- preferenze UI;
- recovery draft non confermati;
- stato del grafo;
- cache;
- metadati tecnici dell'indice.

## SEA-DOC-003 — Testo Markdown normalizzato

Per la ricerca il Markdown viene trasformato in testo ricercabile preservando le parole significative.

Markup puramente sintattico non deve peggiorare il ranking. In particolare, delimitatori come `#`, `**`, backtick e parentesi dei link non vengono trattati come termini significativi.

Il contenuto di heading, liste, citazioni e testo normale resta ricercabile.

## SEA-DOC-004 — Wikilink

Il testo visibile di un wikilink resta ricercabile.

La risoluzione del link e la costruzione dei backlink appartengono al dominio/proiezione link; l'indice non diventa la fonte autorevole delle relazioni.

## SEA-DOC-005 — Frontmatter

Il frontmatter non viene indicizzato indiscriminatamente come testo grezzo.

Solo campi esplicitamente supportati dal modello di dominio, come eventuali alias, possono contribuire alla ricerca.

---

# 5. Normalizzazione delle query

## SEA-QUERY-001 — Unicode e maiuscole

La ricerca deve essere Unicode-aware e case-insensitive per il matching ordinario.

`Meradyl`, `meradyl` e `MERADYL` devono poter trovare la stessa nota.

## SEA-QUERY-002 — Spazi

Spazi iniziali/finali e sequenze di spazi multipli vengono normalizzati.

Una query vuota dopo normalizzazione non esegue una ricerca full-text costosa e produce stato vuoto coerente con la UI spec.

## SEA-QUERY-003 — Accenti

La prima implementazione deve tollerare, quando il motore lo consente senza introdurre falsi positivi eccessivi, differenze semplici di diacritici per la ricerca interattiva.

Questo comportamento è un **default funzionale da verificare** con dataset italiano; non deve alterare i dati originali né i titoli mostrati.

## SEA-QUERY-004 — Sintassi avanzata esclusa

La V0.1 non richiede una query language avanzata.

Non sono necessari:

- operatori booleani espliciti;
- regex;
- proximity syntax;
- filtri DSL;
- query semantiche.

Una sintassi avanzata potrà essere introdotta solo se emerge un bisogno reale.

---

# 6. Ranking

## SEA-RANK-001 — Ranking lessicale

Il ranking V0.1 è lessicale e deterministico a parità di indice e query.

BM25 o equivalente è il modello base per il contenuto testuale.

## SEA-RANK-002 — Titolo più importante del corpo

Una corrispondenza nel titolo pesa più della stessa corrispondenza presente soltanto nel corpo.

## SEA-RANK-003 — Match esatto e prefisso

A parità di altri fattori:

1. titolo esatto;
2. titolo che inizia con la query;
3. titolo contenente la query;
4. alias corrispondente;
5. percorso corrispondente;
6. contenuto del corpo

devono ricevere una priorità coerente con l'accesso rapido a una nota nota per nome.

L'implementazione può combinare questi boost con il punteggio lessicale, ma l'ordine di utilità sopra deve essere verificabile nei test.

## SEA-RANK-004 — Nessun ranking basato su dati invisibili arbitrari

Recenti e Preferiti non alterano silenziosamente il ranking della full-text search V0.1.

Possono essere mostrati come filtri o sezioni dedicate dalla UI, ma il risultato full-text deve restare spiegabile dal contenuto indicizzato.

## SEA-RANK-005 — Tie-break deterministico

In caso di punteggio equivalente, applicare un tie-break stabile, preferendo nell'ordine:

1. titolo normalizzato;
2. percorso relativo normalizzato;
3. `NoteId`.

---

# 7. Risultati

## SEA-RESULT-001 — Identità

Ogni risultato contiene almeno:

```ts
interface SearchResult {
  noteId: NoteId
  title: string
  relativePath: string
  score: number
  matchKind: SearchMatchKind
  snippet?: string
}
```

L'apertura del risultato usa `noteId` e segue il navigation model definito nella UI/UX spec.

## SEA-RESULT-002 — Snippet

Quando il match deriva dal corpo, la ricerca deve poter restituire un breve snippet attorno a una corrispondenza significativa.

Lo snippet è presentazione derivata: non deve essere usato come contenuto autorevole della nota.

## SEA-RESULT-003 — Evidenziazione

Eventuali range di highlight devono derivare dal testo effettivamente mostrato e non devono corrompere Unicode o spezzare caratteri combinati.

## SEA-RESULT-004 — Limite e paginazione

La ricerca interattiva può limitare il primo batch per mantenere risposta rapida. Il contratto deve permettere di ottenere ulteriori risultati senza cambiare arbitrariamente il ranking.

Il valore numerico del batch è implementativo e va validato con i test di performance della V0.1.

---

# 8. Indicizzazione iniziale e rebuild

## SEA-IDX-001 — Apertura campagna

All'apertura di una campagna l'app verifica lo stato dell'indice.

Possibili stati minimi:

- `ready`;
- `building`;
- `stale`;
- `missing`;
- `error`.

## SEA-IDX-002 — Rebuild completo

Un rebuild:

1. enumera le note autorevoli;
2. legge revisioni/contenuti validi;
3. produce i documenti di ricerca;
4. costruisce un nuovo indice derivato;
5. pubblica il nuovo indice solo quando la costruzione è completata con successo.

Un rebuild fallito non deve distruggere un indice precedente ancora valido se l'adapter è in grado di conservarlo.

## SEA-IDX-003 — Ricostruibilità

Cancellare tutti i file dell'indice e riaprire la campagna deve produrre, dopo rebuild, risultati funzionalmente equivalenti per lo stesso stato del vault.

## SEA-IDX-004 — Nessun blocco del vault

Il rebuild non deve impedire all'utente di aprire e modificare note.

Durante la costruzione la UI può dichiarare la ricerca temporaneamente incompleta o in aggiornamento; non deve simulare risultati aggiornati se non lo sono.

---

# 9. Aggiornamenti incrementali

## SEA-INC-001 — Salvataggio nota

Dopo un salvataggio autorevole riuscito, l'indice viene aggiornato alla nuova `NoteRevision`.

La sequenza è:

```text
save confirmed
    ↓
update search document
    ↓
update backlink/graph projections interessate
```

L'indicizzazione non può trasformare un salvataggio fallito in successo.

## SEA-INC-002 — Creazione

Una nota nuova entra nell'indice solo dopo che la sua creazione sul repository autorevole è riuscita.

## SEA-INC-003 — Rinomina e spostamento

Dopo rename/move riuscito:

- il vecchio `NoteId` viene rimosso dall'indice;
- il nuovo `NoteId` viene indicizzato;
- titolo e percorso riflettono lo stato reale del filesystem;
- gli eventuali aggiornamenti ai wikilink seguono il report dell'operazione di dominio/storage.

## SEA-INC-004 — Cestino

Una nota spostata con successo nel cestino viene rimossa dall'indice attivo della campagna.

Un tentativo di eliminazione fallito non la rimuove dall'indice.

## SEA-INC-005 — Modifica esterna

Una modifica esterna accettata come nuova versione autorevole aggiorna l'indice alla nuova revisione.

Se esiste un conflitto con buffer dirty, l'indice continua a rappresentare l'ultima versione autorevole del file finché il conflitto non è risolto.

## SEA-INC-006 — Coalescing

Aggiornamenti molto ravvicinati possono essere coalesced/debounced per efficienza, ma l'indice finale deve convergere alla revisione autorevole più recente.

---

# 10. Backlink e grafo

## SEA-LINK-001 — Responsabilità separate

Backlink e graph edges non sono risultati inferiti dal motore full-text.

Derivano dal parsing e dalla risoluzione canonica dei wikilink.

## SEA-LINK-002 — Pipeline coordinata

Search index, backlink projection e graph projection possono essere aggiornati dallo stesso evento applicativo `note saved`, ma restano proiezioni separate e ricostruibili.

## SEA-LINK-003 — Rebuild indipendente

Deve essere possibile ricostruire search index e graph/backlink projection senza assumere che l'uno sia la fonte dell'altro.

---

# 11. Sidebar filter

## SEA-FILTER-001 — Non è full-text

Il filtro della sidebar opera sul modello già caricato del vault e restringe per nome/percorso visibile.

Non interroga il full-text index.

## SEA-FILTER-002 — Risposta immediata

Il filtro deve essere sufficientemente leggero da aggiornarsi durante la digitazione senza stati di caricamento percepibili per il dataset target V0.1.

## SEA-FILTER-003 — Struttura comprensibile

Quando una nota corrisponde dentro una cartella, la UI può mantenere visibili gli antenati necessari a comprenderne il percorso.

La logica visuale precisa resta nella UI/UX spec.

---

# 12. Command palette

## SEA-CMD-001 — Aggregatore, non indice unico

La command palette combina provider differenti.

Almeno:

```text
NoteProvider   → SearchService
ActionProvider → registro azioni applicative
```

Le azioni non vengono inserite come documenti fittizi nell'indice delle note.

## SEA-CMD-002 — Risultati distinguibili

Nota e azione devono essere distinguibili semanticamente e visivamente.

Un comando `Nuova nota` non deve sembrare un file del vault.

## SEA-CMD-003 — Ricerca note nella palette

La palette può usare un profilo di ranking orientato all'apertura rapida, privilegiando titolo esatto/prefisso rispetto ai match profondi nel corpo.

Il full-text completo resta disponibile nella vista Ricerca.

## SEA-CMD-004 — Registro azioni esplicito

Le azioni disponibili nella palette provengono da un registro tipizzato con almeno:

```ts
interface CommandAction {
  id: CommandActionId
  label: string
  keywords?: string[]
  enabled(context: CommandContext): boolean
  execute(context: CommandContext): Promise<void> | void
}
```

Gli `id` delle azioni sono stabili e non dipendono dall'etichetta localizzata.

## SEA-CMD-005 — Stato enabled

Un'azione non valida nel contesto corrente può essere esclusa o mostrata disabled secondo la UI spec, ma non deve essere eseguibile per errore.

---

# 13. Consistenza e versionamento dell'indice

## SEA-VER-001 — Index schema version

L'indice locale deve dichiarare una `indexSchemaVersion` indipendente dalla versione dell'app.

## SEA-VER-002 — Dataset identity

L'indice deve essere associabile almeno a:

- `CampaignId`;
- schema version;
- revisioni/document fingerprint necessarie a rilevare stato stale.

Non deve poter essere riutilizzato accidentalmente come indice di una campagna diversa.

## SEA-VER-003 — Migrazione preferibilmente tramite rebuild

Quando cambia lo schema dell'indice, la strategia preferita è eliminarlo e ricostruirlo dai dati autorevoli invece di introdurre migrazioni complesse di cache.

---

# 14. Errori e recovery

## SEA-ERR-001 — Error taxonomy minima

Il livello applicativo deve poter distinguere almeno:

- indice mancante;
- indice stale;
- indice corrotto/non leggibile;
- rebuild fallito;
- query fallita;
- documento non indicizzabile;
- aggiornamento incrementale fallito.

## SEA-ERR-002 — Nessuna perdita dati

Un errore search non modifica né elimina dati autorevoli della campagna.

## SEA-ERR-003 — Documento problematico

Se una singola nota non può essere indicizzata, il sistema deve registrare/reportare il problema senza necessariamente rendere inutilizzabile l'intero indice.

Il risultato non deve fingere che quella nota sia ricercabile.

## SEA-ERR-004 — Retry/rebuild

Dopo errore dell'indice l'utente deve poter arrivare a una ricostruzione completa senza interventi manuali sui file interni dell'app.

---

# 15. Performance target V0.1

## SEA-PERF-001 — Dataset minimo di validazione

La ricerca deve essere verificata almeno con il dataset UX già previsto:

- 200 note;
- 15 cartelle;
- nomi lunghi;
- note estese;
- backlink numerosi.

## SEA-PERF-002 — Interazione

Dopo indice `ready`, la digitazione nella ricerca deve apparire interattiva e non bloccare editor o navigazione.

Non viene fissato in questa fase un budget in millisecondi come requisito rigido: va misurato sull'app reale e documentato prima del gate V0.1.

## SEA-PERF-003 — Rebuild osservabile

Un rebuild non istantaneo deve avere stato osservabile (`building`) e non congelare la shell desktop.

---

# 16. Accessibilità e UX

## SEA-A11Y-001 — Tastiera

Tutti i risultati e i controlli primari della ricerca devono essere raggiungibili e attivabili da tastiera secondo `UI_UX_SPEC_V01.md`.

## SEA-A11Y-002 — Stato annunciabile

Loading/building, nessun risultato ed errore devono essere rappresentabili semanticamente e annunciabili dalle tecnologie assistive quando applicabile.

## SEA-A11Y-003 — Match non solo colore

Il motivo della corrispondenza non deve essere comunicato esclusivamente tramite colore.

---

# 17. Anti-pattern vietati

La V0.1 non deve:

- leggere ricorsivamente tutto il vault ad ogni tasto premuto;
- usare il full-text index come fonte autorevole delle note;
- inserire azioni della command palette dentro l'indice delle note;
- indicizzare recovery draft come se fossero versioni salvate;
- aggiornare l'indice prima della conferma di persistenza e mostrare quindi contenuti mai salvati come autorevoli;
- costruire backlink tramite ricerca testuale euristica al posto del parser wikilink;
- introdurre embeddings o servizi cloud senza una necessità approvata;
- dipendere dai nomi visualizzati/localizzati come identificatori interni;
- bloccare l'apertura della campagna perché l'indice è corrotto;
- nascondere un rebuild fallito dietro risultati apparentemente aggiornati.

---

# 18. Scenari di accettazione

## SEA-ACC-001 — Titolo esatto

Date note `Meradyl.md` e `Storia di Meradyl.md`, la query `Meradyl` deve classificare la nota dal titolo esatto davanti a un match soltanto testuale, salvo altri match di titolo equivalenti.

## SEA-ACC-002 — Corpo

Una parola presente soltanto nel corpo di una nota deve renderla trovabile dalla full-text search.

## SEA-ACC-003 — Case-insensitive

Query con differenze di maiuscole/minuscole devono trovare lo stesso documento.

## SEA-ACC-004 — Salvataggio

Dopo un save confermato, una nuova parola inserita nel corpo diventa ricercabile senza rebuild completo.

## SEA-ACC-005 — Save fallito

Dopo un save fallito, testo esistente soltanto nel buffer dirty non deve essere presentato dalla full-text search come contenuto autorevole salvato.

## SEA-ACC-006 — Rinomina

Dopo rename riuscito, il vecchio `NoteId` non compare nei risultati e il nuovo titolo/percorso è ricercabile.

## SEA-ACC-007 — Modifica esterna

Una modifica esterna accettata aggiorna i risultati. Una modifica esterna in conflitto con buffer dirty non sovrascrive silenziosamente l'indice con il buffer locale.

## SEA-ACC-008 — Rebuild

Eliminando l'indice derivato e ricostruendolo, le query di riferimento producono gli stessi documenti rilevanti per lo stesso vault.

## SEA-ACC-009 — Corruzione indice

Con indice illeggibile la campagna si apre comunque e può avviare un rebuild.

## SEA-ACC-010 — Command palette

Digitando parte del titolo di una nota e parte del nome di un'azione, la palette può mostrare entrambe ma come tipi distinti; l'azione non appare nella vista full-text delle note.

## SEA-ACC-011 — Backlink separati

Una relazione wikilink rimane corretta anche se il full-text index viene cancellato; dopo rebuild search e graph/backlink tornano disponibili come proiezioni indipendenti.

## SEA-ACC-012 — Dataset V0.1

Con almeno 200 note e 15 cartelle, ricerca e filtro sidebar restano utilizzabili senza bloccare l'interazione principale.

---

# 19. Contract test minimi

L'implementazione deve avere test automatici almeno per:

- normalizzazione query;
- ranking titolo esatto/prefisso/corpo;
- tie-break deterministico;
- create/update/rename/delete incrementali;
- revisione indicizzata coerente;
- rebuild da zero;
- index schema mismatch;
- indice corrotto;
- separazione command action / note document;
- esclusione recovery draft;
- comportamento su modifica esterna;
- apertura risultato tramite `NoteId` corrente.

I test del motore concreto devono essere eseguibili senza React e senza avviare l'intera app Electron.

---

# 20. Decisioni intenzionalmente non fissate

Non sono ancora vincolanti:

- libreria/motore specifico;
- formato fisico dell'indice;
- directory interna esatta della cache;
- numero esatto di risultati per batch;
- tempi in millisecondi;
- stemming linguistico avanzato;
- fuzzy matching aggressivo;
- query syntax avanzata.

Queste scelte possono essere fatte durante l'implementazione purché non cambino i comportamenti normativi sopra. Se una scelta modifica esperienza, identità o ranking osservabile in modo sostanziale, deve essere promossa a decisione di progetto prima di essere incorporata.

---

## Regola finale

La ricerca V0.1 è progettata correttamente se possiamo fare:

```text
vault Markdown autorevole
        ↓
indice locale derivato
        ↓
full-text / command palette / accesso rapido
```

sapendo che eliminare completamente l'indice lascia intatto il prodotto e che un rebuild può ricostruire tutto ciò che serve alla ricerca senza reinterpretare o modificare la campagna.
