# Campaign Manager v2 — V0.1 Operational Specification

## 1. Scopo e autorità

Questo documento è il contratto operativo integrato della **V0.1 — Campaign Manager locale**.

Serve a chiudere le decisioni di prodotto senza trasformare la V0.1 in un esercizio di architettura. Le specifiche verticali (`UI_UX`, `DOMAIN`, `STORAGE`, `SEARCH`) restano valide; quando una formulazione più vecchia è più complessa o più vaga di questa specifica, prevale questo documento.

Prefisso requisiti: `OPS-*`.

### OPS-AUTH-001 — Ordine di precedenza

Per la V0.1:

1. decisioni esplicite dell'utente successive a questo documento;
2. questo documento;
3. `docs/V01_PRODUCT_DECISIONS.md`;
4. specifica verticale applicabile;
5. `PRODUCT.md`, `architecture.md`, `ROADMAP.md`;
6. design direction e mock.

### OPS-AUTH-002 — Regola anti-over-engineering

Una scelta interna non deve essere promossa a infrastruttura generale se basta una soluzione locale e verificabile.

In particolare V0.1 **non richiede**:

- framework generico di transazioni filesystem;
- event sourcing;
- database autorevole;
- layer/package vuoti creati solo per separazione teorica;
- sistema di metadata/frontmatter applicativo;
- ottimizzazioni progettate per scale non misurate.

---

# 2. Confini architetturali

## OPS-ARCH-001 — Application layer logico, non package obbligatorio

Deve esistere un confine applicativo chiaro tra UI e infrastruttura:

```text
React UI
→ servizi/use case applicativi
→ core + repository/adapter
→ filesystem / indice / OS
```

Questo **non obbliga** a creare `packages/application` o `packages/search`.

Le responsabilità applicative possono vivere in `apps/desktop/application/` o in un package dedicato solo quando il riuso o la dimensione lo giustificano.

Vale la regola della roadmap: creare soltanto i package realmente necessari.

## OPS-ARCH-002 — Cosa non fa React

Componenti, hook e store UI non coordinano direttamente:

- filesystem;
- save/recovery;
- rename/move/trash multi-file;
- rebuild della ricerca;
- aggiornamento backlink/graph;
- remap di `NoteId`/`FolderId`.

## OPS-ARCH-003 — Document session minima

Per ogni nota o draft aperto deve esistere stato applicativo sufficiente a conservare:

```ts
type DocumentSaveState =
  | 'clean'
  | 'dirty'
  | 'saving'
  | 'error'
  | 'conflict'
  | 'missing'
```

oltre a target, markdown corrente e revisione base quando esiste.

Non è richiesto un framework documentale generale oltre a ciò che serve ai flussi V0.1.

---

# 3. Lifecycle della campagna

## OPS-CAM-001 — Startup

All'avvio l'app prova a riaprire l'ultima campagna aperta con successo. Se non è più disponibile, mostra la schermata iniziale senza bloccare l'app.

La schermata iniziale offre `Apri cartella…` e un piccolo elenco di campagne recenti.

## OPS-CAM-002 — Prima apertura

Una cartella leggibile e scrivibile senza `campaign.json` viene inizializzata automaticamente creando soltanto:

```json
{
  "schemaVersion": 1,
  "campaignId": "<uuid>"
}
```

Il nome visuale usa il nome della cartella se `name` non è presente. Nessun Markdown viene convertito o riscritto.

## OPS-CAM-003 — Niente modalità read-only V0.1

Una cartella non scrivibile non viene aperta come normale campagna V0.1.

La UI spiega il problema e offre almeno `Riprova` e `Scegli un'altra cartella`.

## OPS-CAM-004 — Metadata problematici

- `campaign.json` invalido → apertura bloccata, nessun overwrite automatico;
- schema futuro → apertura bloccata, nessun downgrade;
- schema precedente noto → migrazione esplicita e testata.

## OPS-CAM-005 — Campagna spostata o copiata

L'app conserva `campaignId → ultimo path noto`.

- vecchio path non esiste più → stessa campagna spostata;
- vecchio e nuovo path esistono entrambi con lo stesso ID → la nuova cartella è trattata come possibile copia.

In caso di copia, l'utente può scegliere `Usa come nuova copia indipendente`, che genera un nuovo `campaignId` modificando soltanto `campaign.json`.

## OPS-CAM-006 — Cambio campagna e chiusura

Prima di cambiare campagna o chiudere:

- draft vuoti vengono scartati;
- draft significativi tentano la materializzazione;
- note dirty tentano il save;
- save in corso viene atteso.

Se qualcosa resta non salvato ma esiste una recovery valida, l'utente può restare oppure procedere conservando la bozza. Se neppure la recovery può essere scritta, la chiusura/cambio è bloccata finché l'utente non salva, esporta o scarta esplicitamente.

## OPS-CAM-007 — Root scomparsa

Se la root viene spostata o rimossa mentre l'app è aperta:

- i write vengono sospesi;
- i buffer restano disponibili e protetti dalla recovery;
- viene offerto `Individua cartella…`;
- il relink automatico avviene solo se il `campaignId` coincide.

---

# 4. Vault, path e cartelle

## OPS-PATH-001 — Explorer

Il note explorer mostra cartelle reali e file `.md` sotto la root campagna. Non attraversa symlink e non mostra come note `campaign.json`, temp file, `.git`, `node_modules` o artefatti interni dichiarati.

## OPS-PATH-002 — Ordinamento

Dentro ogni cartella:

1. cartelle;
2. note;
3. natural sort case-insensitive;
4. tie-break deterministico sul path.

## OPS-PATH-003 — Identità e sicurezza

`NoteId`/`FolderId` sono relativi alla root, usano `/`, non contengono traversal o path assoluti e non possono collidere solo per case.

La creazione/rinomina su Windows rifiuta nomi illegali o riservati. Un case-only rename dello stesso elemento è consentito tramite una strategia sicura dell'adapter.

## OPS-FOLDER-001 — Folder CRUD completo

V0.1 supporta:

- crea;
- rinomina;
- sposta;
- cestina cartella.

La root non è modificabile come cartella normale.

## OPS-FOLDER-002 — Vincoli move

Una cartella non può essere spostata dentro sé stessa, in un discendente, fuori dalla root o su un target collidente.

Prima di rename/move/trash di una cartella, le note aperte coinvolte vengono salvate. Un `error` o `conflict` irrisolto blocca l'operazione.

---

# 5. Nuove note

## OPS-NOTE-001 — Destinazione

`Nuova nota` usa, nell'ordine:

1. cartella selezionata;
2. parent della nota selezionata;
3. root.

## OPS-NOTE-002 — Draft temporaneo

Premere `Nuova nota` apre un draft senza creare subito un file.

Se il draft viene abbandonato senza alcun contenuto significativo, viene annullato e non lascia file né recovery.

Whitespace e soli marker Markdown non sono contenuto significativo.

## OPS-NOTE-003 — Titolo automatico

Il titolo usa le prime **1–3 parole visibili** del testo, ignorando marker Markdown iniziali.

Esempi:

```text
Meradyl               → Meradyl.md
Lady Maya              → Lady Maya.md
Il vecchio castello…   → Il vecchio castello.md
# La città perduta     → La città perduta.md
```

Caratteri non validi per il filename vengono rimossi/normalizzati senza inventare parole.

## OPS-NOTE-004 — Quando si materializza

Il draft viene materializzato quando accade il primo evento utile tra:

- l'utente completa la terza parola e scatta il normale autosave;
- `Ctrl+S`;
- passa a un'altra nota/vista;
- chiude tab/campagna/app.

**Non esiste un timer speciale separato** per decidere il titolo.

Se il draft contiene solo una o due parole al momento della materializzazione, quelle diventano il titolo. Dopo la prima creazione il titolo automatico non cambia più.

## OPS-NOTE-005 — Collisione

Se il titolo automatico collide con un file esistente:

- nessun `(2)` o suffisso inventato;
- il draft resta intatto;
- l'utente modifica il titolo inline prima della creazione.

## OPS-NOTE-006 — Creazione fallita

Se il file non può essere creato, il draft resta disponibile e viene protetto dalla recovery. Non appare come nota salvata in explorer/search/graph.

---

# 6. Tab e titolo

## OPS-TAB-001 — Una tab per nota

Una `NoteId` non può avere due sessioni concorrenti nella stessa finestra. Se è già aperta, viene attivata.

## OPS-TAB-002 — Apertura

L'apertura normale usa la tab corrente. Una nuova tab richiede azione esplicita.

Ogni tab conserva la propria cronologia back/forward.

## OPS-TAB-003 — Chiusura

- clean → chiude;
- dirty → tenta save;
- saving → attende;
- error/conflict → offre di restare oppure chiudere conservando una recovery valida.

Dopo la chiusura viene attivata una tab adiacente; se non ce ne sono, appare lo stato vuoto centrale.

## OPS-TITLE-001 — Rename da titolo

Il titolo della nota esistente è un controllo di rename reale:

- `Invio` o blur valido → conferma;
- `Esc` → annulla;
- collisione/errore → file precedente intatto, errore inline.

Nessun rename per keystroke.

---

# 7. Markdown e frontmatter

## OPS-MD-001 — Dialetto

Read mode usa CommonMark + GFM per heading, enfasi, liste, citazioni, code, link, tabelle, task list e strikethrough.

## OPS-MD-002 — Raw HTML

Raw HTML non viene eseguito come HTML attivo. Script, event handler, iframe e markup arbitrario non possono eseguire codice nel renderer.

## OPS-MD-003 — Frontmatter V0.1 è opaco

La V0.1 **non introduce campi frontmatter applicativi canonici**.

Se un file contiene YAML frontmatter:

- viene preservato come contenuto dell'utente;
- chiavi sconosciute non vengono eliminate;
- il Campaign Manager non aggiunge ID, preferenze, alias o metadata propri;
- YAML invalido non impedisce di modificare il Markdown e non viene "riparato" automaticamente.

Supporto funzionale a alias/tag/type viene rimandato a quando esisterà un caso d'uso di prodotto reale.

## OPS-MD-004 — Immagini e link

Read mode può mostrare immagini relative dentro la root campagna (PNG/JPEG/WebP/GIF). Path assoluti, traversal e immagini remote non vengono caricati automaticamente.

Link `http/https` e `mailto` vengono aperti tramite API sicure del sistema. Schemi pericolosi o file locali arbitrari non vengono eseguiti.

---

# 8. Wikilink e backlink

## OPS-WIKI-001 — Sintassi

V0.1 riconosce:

```text
[[Nota]]
[[Cartella/Nota]]
[[Cartella/Nota.md]]
```

Non richiede alias, heading link o embed.

## OPS-WIKI-002 — Contesti esclusi

Non sono wikilink le sequenze dentro fenced code, inline code o escapate esplicitamente.

## OPS-WIKI-003 — Risoluzione

- path-qualified → relativo alla root campagna;
- basename → confronto globale sul filename stem;
- un match → resolved;
- zero → missing;
- più di uno → ambiguous;
- mai scegliere arbitrariamente il primo candidato.

## OPS-WIKI-004 — Link ambiguo

Il click mostra i candidati con titolo e path. La scelta apre il candidato ma non riscrive il Markdown automaticamente.

Un'azione separata può rendere il link univoco sostituendolo con il path-qualified scelto.

## OPS-WIKI-005 — Link mancante

Il click offre `Crea nota`.

- target senza path → stessa cartella della nota sorgente;
- target con path → cartella specificata dal target.

Eventuali cartelle mancanti vengono create solo come parte di un'azione esplicita e validata.

## OPS-WIKI-006 — Backlink e grafo

Solo link `resolved` producono backlink e archi del grafo. Missing/ambiguous restano diagnostica, non relazioni inventate.

---

# 9. Save, recovery e conflitti

## OPS-SAVE-001 — Save reale

Autosave per note materializzate: circa **600 ms** di inattività. `Ctrl+S` forza il tentativo immediato.

`saved` viene mostrato solo dopo conferma reale del repository.

## OPS-SAVE-002 — Recovery semplice

La recovery è una **copia di sicurezza del buffer**, separata dal vault.

Deve essere aggiornata abbastanza spesso da proteggere un crash realistico, ma **la spec non impone una cadenza in millisecondi né un scheduler dedicato**.

Una implementazione adeguata può salvarla:

- dopo una breve pausa di digitazione;
- periodicamente mentre il buffer resta dirty;
- prima di operazioni rischiose/uscita quando necessario.

Per un draft non ancora materializzato la recovery conserva almeno `draftId`, cartella destinazione e Markdown.

## OPS-SAVE-003 — Recupero alla riapertura

Se esistono modifiche non confermate, l'app mostra un semplice avviso `Bozze da recuperare`.

Azioni minime:

- `Ripristina`;
- `Esporta`;
- `Scarta`.

Se la nota originale è cambiata sul disco, il ripristino entra nel normale conflict flow. Se il file non esiste più, il contenuto può essere ricreato o salvato come nuova nota.

Non serve un sottosistema separato più complesso di questi casi.

## OPS-SAVE-004 — Eliminazione recovery

Una recovery viene eliminata solo dopo save autorevole equivalente o discard esplicito.

## OPS-CONFLICT-001 — Modifica esterna

Nota clean + modifica esterna → ricarica la versione disco e aggiorna le proiezioni.

Nota dirty + modifica esterna → `conflict`, autosave sospeso, entrambe le versioni conservate.

Azioni:

- usa versione locale;
- usa versione su disco;
- salva locale come nuova nota;
- annulla.

Nessun overwrite automatico.

## OPS-CONFLICT-002 — File mancante

Se una nota aperta scompare:

- stato `missing`;
- nessuna ricreazione implicita;
- se esistono modifiche locali, si può ricreare, salvare come nuova, esportare o conservare la recovery.

Rename esterni non vengono dedotti da delete+create se non c'è prova affidabile.

---

# 10. Rename e move

## OPS-MOVE-001 — Coordinamento applicativo

Rename/move di note e cartelle è coordinato fuori dalla UI.

La V0.1 **non richiede un transaction engine generico**.

## OPS-MOVE-002 — Flusso minimo sicuro

Prima dell'operazione:

1. valida il target e le collisioni;
2. salva i documenti aperti coinvolti;
3. calcola i wikilink risolti che devono cambiare;
4. registra un **repair record minimale** con tipo operazione, old path, new path e informazioni sufficienti a capire se il rename/move principale è avvenuto.

Poi:

1. esegue il rename/move fisico;
2. aggiorna le identità runtime;
3. riscrive i link necessari una source alla volta, verificando che la source non sia cambiata da quando è stata letta;
4. aggiorna preferenze e proiezioni derivate;
5. elimina il repair record quando lo stato è coerente.

## OPS-MOVE-003 — Partial

Se una source è cambiata o non può essere riscritta:

- non viene sovrascritta;
- il rename/move fisico resta valido;
- il risultato è `partial` con elenco delle source fallite.

## OPS-MOVE-004 — Crash durante rename/move

Al riavvio, la presenza del repair record fa verificare lo stato reale dei path.

L'app offre/riprova la **riparazione specifica di quell'operazione**. Non è richiesto replay generico di step, rollback automatico, locking transazionale o event log.

## OPS-MOVE-005 — Regole rewrite

- rename dello stem → aggiorna i link resolved che altrimenti si romperebbero;
- move senza cambio stem → i basename ancora validi non vengono riscritti;
- path-qualified → aggiornati quando il path cambia;
- missing/ambiguous/code/escaped → non riscritti per supposizione.

Folder move remappa tab/history/favorites/recenti/folder colors e documenti search interessati. La recovery di una nota coinvolta viene normalmente eliminata dal save eseguito prima del move; non serve un sistema generico di remap delle bozze dirty.

---

# 11. Trash

## OPS-TRASH-001 — Solo cestino

Nessun fallback a cancellazione permanente.

Se il cestino non è disponibile, l'elemento resta intatto e l'errore è esplicito.

## OPS-TRASH-002 — Contenuto aperto

Prima del trash, eventuali buffer dirty vengono salvati. `error/conflict` irrisolti bloccano l'operazione.

Dopo trash riuscito vengono ripuliti tab/history/favorite/recent e aggiornate le proiezioni.

Una cartella non vuota richiede conferma esplicita.

---

# 12. Recenti, preferiti e filtro sidebar

## OPS-RECENT-001 — Recenti

Recenti è una lista locale ordinata dall'uso più recente della nota. Rename/move conserva l'entry; not-found confermato la rimuove.

La dimensione massima è un dettaglio implementativo ragionevole, non un contratto di prodotto.

## OPS-FAV-001 — Preferiti

Preferiti è locale alla campagna, ordinato in modo deterministico e remappato su rename/move.

## OPS-FILTER-001 — Filtro sidebar

Il filtro è case-insensitive su nome/percorso.

- match nota → mostra nota + antenati;
- match cartella → mostra cartella + subtree;
- l'espansione temporanea del filtro non distrugge lo stato normale dell'albero.

---

# 13. Ricerca full-text e command palette

## OPS-SEARCH-001 — Vista centrale

`Ricerca` nel rail apre una vista centrale full-text distinta dal filtro sidebar e da `Ctrl+K`.

Query vuota mostra uno stato semplice `Digita per cercare nelle note`.

## OPS-SEARCH-002 — Contenuto indicizzato

V0.1 indicizza:

- titolo filename;
- path;
- testo Markdown normalizzato.

**Non interpreta campi frontmatter come alias, tag o categorie.**

Il frontmatter può essere escluso o trattato come testo non prioritario secondo il parser scelto, purché non introduca semantica applicativa nascosta.

## OPS-SEARCH-003 — Ranking

Titolo esatto/prefisso deve prevalere sui match profondi nel corpo. Il ranking resta lessicale e deterministico.

La tolleranza semplice ai diacritici è desiderabile ma **non è un gate V0.1** se il motore scelto la rende costosa o inaffidabile.

## OPS-SEARCH-004 — Stati indice

Indice `missing/stale/error` non blocca la campagna.

- se esiste un indice precedente, i risultati possono essere marcati `in aggiornamento`;
- senza indice valido, Search mostra `Preparazione ricerca…`;
- è sempre disponibile `Ricostruisci indice`.

## OPS-SEARCH-005 — Command palette

La palette distingue note e azioni. Deve includere almeno le azioni principali realmente presenti nella V0.1: nuova nota/cartella, viste Note/Ricerca/Grafo/Recenti/Preferiti/Impostazioni, apri/chiudi campagna, rename/move/trash della nota, modalità lettura/modifica e rebuild ricerca.

---

# 14. Graph view

## OPS-GRAPH-001 — Modello

Nodi = note. Archi = wikilink `resolved`, diretti `source → target`. Note isolate restano visibili.

## OPS-GRAPH-002 — Filtri

I filtri cartella sono multi-select:

- cartella selezionata include i discendenti;
- più cartelle = OR;
- non matching attenuati, non rimossi;
- reset filtri non cancella la selezione e viceversa.

## OPS-GRAPH-003 — Layout e drag

Il layout deve essere sufficientemente stabile da non sembrare casuale a ogni apertura/rebuild.

Trascinare un nodo modifica solo la disposizione visuale corrente.

**La persistenza delle singole posizioni manuali non è requisito V0.1.** Se la libreria scelta la rende quasi gratuita può essere aggiunta come preferenza locale, ma non deve introdurre remap/migrazioni aggiuntive.

Camera e filtri utili possono essere ripristinati localmente.

## OPS-GRAPH-004 — Errori derivati

Un errore di graph projection non trasforma un save Markdown riuscito in fallimento. Il grafo viene marcato stale e può essere ricostruito.

---

# 15. Impostazioni V0.1

## OPS-SET-001 — Vista minima

Poiché il rail già contiene `Impostazioni`, V0.1 può aprire una vista minima di manutenzione con:

- path campagna + `Apri in Esplora file`;
- stato/rebuild ricerca;
- reset disposizione pannelli;
- versione app.

Non vengono inventate preferenze configurabili solo per riempire la pagina.

---

# 16. Errori e feedback

## OPS-ERR-001 — Categorie minime

L'app deve distinguere almeno:

```text
campaign_unavailable
read_only
permission_denied
metadata_invalid
unsupported_schema
invalid_path
collision
case_collision
not_found
conflict
trash_unavailable
disk_full
encoding_error
io_error
index_error
operation_partial
preferences_corrupt
```

La UI non deve parsare stringhe di eccezione native per capire cosa è successo.

## OPS-ERR-002 — Modalità di presentazione

Errori non distruttivi usano stato inline/banner/toast. Dialoghi modali si usano solo quando l'utente deve decidere se perdere, sovrascrivere, cestinare o cambiare contesto con dati non confermati.

---

# 17. Preferenze locali

`ui.json` può contenere:

- vista attiva;
- tab/order/history;
- pannelli;
- recenti/preferiti;
- folder colors;
- camera/filtri grafo.

Non contiene il Markdown autorevole.

Se `ui.json` è corrotto, la campagna apre con default. Un errore di preferenze non rende fallito un save Markdown riuscito.

---

# 18. Keyboard e accessibilità

Minimo Windows:

- `Ctrl+K` command palette;
- `Ctrl+S` save;
- `Esc` annulla/chiude il livello corrente;
- `Invio` conferma/apre secondo contesto;
- frecce per liste/palette/grafo quando il focus non è nell'editor.

Drag & drop non è l'unico percorso per move/rename/trash o altre azioni primarie.

La V0.1 mantiene l'obiettivo WCAG 2.2 AA per i criteri applicabili, senza dichiarare conformità prima della verifica reale.

---

# 19. Scala e performance

## OPS-PERF-001 — Dataset di validazione

`200 note / 15 cartelle` resta il dataset minimo per i test UX previsti.

Una fixture più grande (per esempio **2.000 note / 100 cartelle**) è utile come **stress test informativo**, non come gate di release.

Non si introduce caching, virtualizzazione complessa o ottimizzazione architetturale prima di avere misure che ne dimostrino la necessità.

## OPS-PERF-002 — Gate Windows

La V0.1 è supportata ufficialmente su Windows. Packaging, path, watcher, safe save, system trash e crash recovery devono essere verificati realmente su Windows.

---

# 20. Scelte lasciate all'implementazione

Sono intenzionalmente liberi, se rispettano il comportamento sopra:

- struttura fisica dei moduli applicativi;
- libreria editor e parser Markdown;
- motore/format dell'indice locale;
- batch size e dettagli ranking non osservabili;
- algoritmo del graph layout;
- persistenza opzionale delle posizioni manuali del grafo;
- state management UI;
- component/icon library;
- timing motion e dimensioni pannelli da validare;
- esatta strategia/cadenza di recovery, purché protegga realisticamente il buffer;
- formato del repair record rename/move.

Una scelta tecnica diventa decisione di prodotto solo se cambia il comportamento osservabile.

---

# 21. Scenari end-to-end obbligatori

1. **Prima apertura** — cartella writable senza metadata → crea solo `campaign.json`, nessuna conversione.
2. **Draft breve** — `Lady Maya` + uscita/save → `Lady Maya.md`.
3. **Draft lungo** — prime tre parole fissano il titolo; niente rename continuo.
4. **Draft vuoto** — nessun file e nessuna recovery residua.
5. **Collisione titolo** — nessun suffisso automatico, draft intatto.
6. **Folder CRUD** — create/rename/move/trash reali e sicuri.
7. **Wikilink ambiguo** — picker, nessuna scelta arbitraria.
8. **Wikilink mancante** — creazione target esplicita.
9. **Wikilink in code** — nessun backlink/edge.
10. **Rename con backlink** — target spostato + rewrite necessario; source concorrente → `partial`, nessun overwrite stale.
11. **Crash durante rename** — repair record rilevato; stato reale verificato e riparabile senza transaction engine generico.
12. **External conflict** — locale e disco entrambi recuperabili.
13. **Disk full** — file precedente intatto, buffer/recovery presenti.
14. **File eliminato esternamente** — `missing`, nessuna ricreazione automatica.
15. **Indice assente/corrotto** — campagna funziona e Search può rebuildare.
16. **Graph filter** — cartella + discendenti, OR multi-select, reset indipendente dalla selezione.
17. **Trash unavailable** — nessun permanent delete.
18. **Switch/close con save fallito** — nessuna perdita silenziosa.
19. **Campagna spostata/copiata** — stesso ID spostato conserva identità; doppio path chiede separazione copia.
20. **Preferenze corrotte** — contenuti e recovery restano intatti.

---

# 22. Gate finale V0.1

La V0.1 è pronta quando:

1. i flussi sopra sono coperti da test automatici/E2E appropriati;
2. nessun percorso normale perde un buffer senza save, recovery o discard esplicito;
3. rename/move/trash non sovrascrivono modifiche concorrenti silenziosamente;
4. search/backlink/graph restano derivati e ricostruibili;
5. le scelte tecniche libere non sono state trasformate in infrastruttura prematura;
6. il prodotto funziona come campaign manager locale completo su Windows.

## Regola finale

La V0.1 deve essere **robusta nei punti in cui può perdere dati e semplice negli altri**.