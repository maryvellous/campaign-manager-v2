# Campaign Manager v2 — Search Specification V0.1

## 1. Scopo

La ricerca locale V0.1 permette di trovare note senza conoscere la cartella e senza introdurre IA, cloud o un database autorevole parallelo.

Sono strumenti distinti:

1. filtro sidebar per nome/percorso;
2. vista full-text centrale;
3. command palette per accesso rapido a note e azioni.

Prefisso: `SEA-*`.

`V01_OPERATIONAL_SPEC.md` prevale sui dettagli operativi.

---

# 2. Principi

## SEA-CORE-001 — Locale e derivata

La ricerca funziona offline. L'indice è derivato, eliminabile e ricostruibile dalle note.

Non richiede account, rete, embeddings, vector DB o provider IA.

## SEA-CORE-002 — Nessuna scrittura nel vault

Indicizzazione e query non modificano Markdown, frontmatter o cartelle.

## SEA-CORE-003 — Motore sostituibile

UI e use case dipendono da un `SearchService`, non dalla libreria concreta.

La prima implementazione usa ricerca lessicale BM25 o equivalente; nessun bisogno di un package separato se l'implementazione resta piccola.

## SEA-CORE-004 — Degradazione sicura

Indice missing/stale/corrotto non blocca la campagna.

---

# 3. Contratto

```ts
interface SearchService {
  searchNotes(query: SearchQuery): Promise<SearchResult[]>
  rebuild(): Promise<RebuildReport>
  getStatus(): Promise<SearchIndexStatus>
}
```

La UI non interroga direttamente filesystem o storage dell'indice.

Il parser Markdown usato per indicizzare non deve inventare semantiche incompatibili con il parser canonico dei wikilink.

---

# 4. Documento indicizzato

```ts
interface SearchDocument {
  noteId: NoteId
  title: string
  relativePath: string
  folderPath: string
  bodyText: string
  revision: NoteRevision
}
```

V0.1 indicizza:

- filename/title;
- percorso relativo;
- testo Markdown normalizzato.

### SEA-DOC-001 — Frontmatter

La V0.1 **non definisce campi frontmatter semantici per la ricerca**.

Non esiste supporto V0.1 obbligatorio per `aliases`, `tags`, `type` o simili. Se presenti nei file, vengono preservati dal sistema note ma non devono creare comportamento di ricerca speciale.

### SEA-DOC-002 — Normalizzazione Markdown

I marker puramente sintattici non sono termini significativi. Heading, liste, citazioni, testo normale e contenuto testuale di code block possono restare ricercabili.

Il testo visibile di un wikilink è ricercabile; la sua risoluzione resta responsabilità del dominio wikilink.

---

# 5. Query

## SEA-QUERY-001 — Base

Matching ordinario:

- Unicode-aware;
- case-insensitive;
- trim e normalizzazione whitespace;
- query vuota → nessuna ricerca costosa.

## SEA-QUERY-002 — Diacritici

La tolleranza semplice ai diacritici (`citta` → `città`) è un miglioramento desiderabile se il motore scelto la offre in modo semplice, ma **non è un gate di release V0.1**.

## SEA-QUERY-003 — Niente query language avanzata

Fuori scope V0.1:

- boolean DSL;
- regex;
- proximity syntax;
- query semantiche;
- fuzzy matching aggressivo.

---

# 6. Ranking

Il ranking è lessicale e deterministico.

A parità di altri fattori:

1. titolo esatto;
2. titolo prefix;
3. titolo contains;
4. percorso;
5. corpo.

Recenti e Preferiti non modificano silenziosamente il ranking full-text.

Tie-break stabile: titolo normalizzato → path → NoteId.

---

# 7. Risultati

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

Un match nel corpo può avere snippet contestuale. Highlight e snippet sono presentazione derivata, non contenuto autorevole.

Il numero iniziale di risultati/batch è implementativo.

---

# 8. Stato indice e rebuild

Stati minimi:

```text
ready
building
stale
missing
error
```

Un rebuild:

1. enumera note autorevoli;
2. legge contenuto/revision;
3. costruisce un nuovo indice;
4. lo rende corrente solo quando utilizzabile.

Il rebuild non blocca il normale uso del vault.

Se esiste un indice precedente valido può restare disponibile con indicazione `in aggiornamento`.

Cancellare l'indice e ricostruirlo non modifica il vault.

---

# 9. Aggiornamenti incrementali

L'indice cambia solo dopo eventi autorevoli:

- create riuscita;
- save riuscito;
- rename/move riuscito;
- trash riuscito;
- modifica esterna accettata.

Save fallito o buffer recovery non diventano contenuto indicizzato come se fossero salvati.

Update ravvicinati possono essere coalesced, purché l'indice converga alla revisione autorevole più recente.

---

# 10. Backlink e grafo

Search, backlink e graph sono proiezioni separate.

Backlink/edges derivano dal parser+resolver wikilink, non da una query full-text euristica.

Ciascuna proiezione deve poter essere ricostruita senza usare le altre come fonte autorevole.

---

# 11. Sidebar filter

Il filtro sidebar:

- opera sul modello del vault già caricato;
- cerca nome/percorso;
- non interroga il full-text index;
- mantiene visibili gli antenati necessari a capire il path.

Deve aggiornarsi durante la digitazione senza blocchi percepibili sul dataset minimo V0.1.

---

# 12. Command palette

La palette aggrega almeno:

```text
NoteProvider
ActionProvider
```

Le azioni non sono documenti fake dell'indice.

Note e azioni sono distinguibili. La palette privilegia accesso rapido per titolo; il full-text profondo resta nella vista Ricerca.

Gli ID delle azioni sono stabili e non dipendono dall'etichetta visuale.

---

# 13. Versionamento dell'indice

L'indice dichiara una propria schema version ed è associato al `CampaignId`.

Quando cambia lo schema, preferire rebuild da dati autorevoli invece di migrazioni complesse della cache.

---

# 14. Errori

Distinguere almeno:

- missing;
- stale;
- corrotto/non leggibile;
- rebuild fallito;
- query fallita;
- singolo documento non indicizzabile;
- update incrementale fallito.

Un problema a una nota non deve necessariamente abbattere l'intero indice. L'utente deve poter avviare un rebuild senza manipolare manualmente i file interni dell'app.

---

# 15. Performance

Dataset minimo di validazione:

- 200 note;
- 15 cartelle;
- note lunghe e backlink numerosi.

Dopo stato `ready`, ricerca e filtro devono apparire interattivi e non congelare editor/navigazione.

Non esiste un budget rigido in millisecondi né un obbligo di progettare per migliaia di note prima di misurare l'app reale.

Fixture più grandi sono stress test informativi.

---

# 16. Accessibilità

Risultati e controlli primari sono raggiungibili da tastiera. Loading, empty/error e match devono essere comprensibili senza dipendere soltanto dal colore.

---

# 17. Anti-pattern

V0.1 non deve:

- riscansionare ricorsivamente tutto il vault a ogni tasto;
- usare l'indice come fonte autorevole;
- indicizzare recovery draft;
- aggiornare search prima della persistenza e mostrare testo mai salvato come autorevole;
- costruire backlink col motore search;
- introdurre embeddings/cloud;
- bloccare l'apertura della campagna perché l'indice è rotto;
- introdurre metadata frontmatter solo per alimentare la ricerca.

---

# 18. Scenari di accettazione

1. titolo esatto davanti a match solo nel corpo;
2. parola presente solo nel corpo trovabile;
3. matching case-insensitive;
4. save confermato indicizzato incrementalmente;
5. save fallito non indicizzato come versione autorevole;
6. rename rimuove vecchio NoteId e indicizza il nuovo;
7. modifica esterna accettata aggiorna l'indice;
8. rebuild da zero ricostruisce risultati equivalenti;
9. indice corrotto non blocca la campagna;
10. note e azioni restano tipi distinti nella command palette;
11. cancellare Search non rompe backlink/graph;
12. dataset minimo resta utilizzabile.

---

# 19. Scelte implementative

Restano liberi:

- libreria/motore;
- collocazione fisica del codice search;
- formato e directory dell'indice;
- batch size;
- stemming/folding/fuzzy non richiesti;
- esatti tempi in ms.

## Regola finale

La ricerca deve essere utile, locale e ricostruibile. Se per ottenerla stiamo costruendo un motore di ricerca generale o introducendo metadata che il prodotto non usa altrove, abbiamo superato lo scope V0.1.