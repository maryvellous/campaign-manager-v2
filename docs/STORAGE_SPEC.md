# Campaign Manager v2 — Storage Specification V0.1

## 1. Scopo

Questo documento definisce il contratto di persistenza locale della V0.1.

L'obiettivo è che una campagna resti:

- leggibile come normale cartella di file;
- resistente a crash ed errori comuni;
- priva di salvataggi simulati;
- protetta da sovrascritture silenziose;
- separata da cache, preferenze UI e bozze di recovery;
- portabile senza dipendere da un database proprietario.

`docs/DOMAIN_MODEL.md` definisce il significato dei dati. Questo documento definisce **come gli adapter locali li persistono e li proteggono**.

---

# 2. Classi di dati

## STO-AUTH-001 — Dati autorevoli della campagna

Sono autorevoli:

- file Markdown delle note;
- asset dell'utente;
- future board o altri file esplicitamente dichiarati come dati campagna;
- `campaign.json` per i metadati tecnici minimi della campagna.

La perdita di cache o preferenze locali non deve modificare questi dati.

## STO-AUTH-002 — Dati locali non autorevoli

Devono vivere fuori dai file di contenuto della campagna:

- tab aperte;
- cronologia di navigazione;
- recenti e preferiti;
- dimensioni/collasso pannelli;
- colori cartella per il grafo;
- camera, filtri, selezione e posizioni manuali del grafo;
- indice di ricerca;
- backlink cache;
- bozze di recovery;
- journal di operazioni multi-file.

Questi dati possono essere eliminati e ricostruiti o reimpostati senza corrompere il vault.

## STO-AUTH-003 — Nessuna preferenza nel Markdown

Nessuna preferenza UI viene inserita automaticamente nel frontmatter o nel corpo delle note.

---

# 3. `campaign.json`

## STO-CAM-001 — Posizione

`campaign.json` vive nella root della cartella gestita.

Esempio:

```text
Aephoredya/
  campaign.json
  Notes/
  Locations/
  Assets/
```

## STO-CAM-002 — Schema V0.1

Schema minimo:

```json
{
  "schemaVersion": 1,
  "campaignId": "7f1ce920-5ea8-4e49-9c73-4b33e5e9c9a1",
  "name": "Aephoredya"
}
```

Campo futuro opzionale già compatibile col dominio:

```json
{
  "externalBinding": {
    "provider": "ecogdr",
    "campaignId": "cmp_..."
  }
}
```

La V0.1 non espone UI o networking per `externalBinding`.

## STO-CAM-003 — `campaignId`

`campaignId` è un UUID casuale generato una sola volta alla prima inizializzazione.

Non dipende dal nome o dal path della cartella.

## STO-CAM-004 — Prima apertura di una cartella

Se la cartella selezionata è leggibile e scrivibile ma non contiene `campaign.json`, l'apertura come campagna gestita può inizializzarla creando il file con `schemaVersion: 1` e un nuovo `campaignId`.

L'operazione deve essere non distruttiva: nessun altro file viene rinominato, spostato o convertito.

Se esiste già un `campaign.json` non valido, l'app **non lo sovrascrive automaticamente**.

## STO-CAM-005 — Versioni schema

- schema uguale alla versione supportata → apertura normale;
- schema precedente noto → migrazione esplicita e testata;
- schema futuro/non supportato → nessun downgrade o rewrite automatico; apertura writable bloccata con errore comprensibile.

---

# 4. Layout dello storage applicativo

## STO-APP-001 — App data separato

Preferenze, recovery, indici e journal vivono nella directory applicativa prevista dal sistema operativo, non nel vault dell'utente.

Forma concettuale:

```text
<AppData>/CampaignManagerV2/
  campaigns/
    <campaignId>/
      ui.json
      recovery/
      operations/
  indexes/
    <campaignId>/
```

La posizione fisica reale viene risolta dall'adapter Electron e non entra nel core.

## STO-APP-002 — Campagna spostata

Poiché i dati locali sono keyed by `campaignId`, spostare o rinominare la root della campagna non deve perdere preferenze e recovery una volta riaperta la nuova posizione.

La lista "recenti" deve aggiornare il path noto dopo un'apertura riuscita.

---

# 5. Scoperta delle note

## STO-DISC-001 — File nota

Una nota V0.1 è un file regolare con estensione `.md` sotto la root campagna.

## STO-DISC-002 — Traversal sicuro

La scansione ricorsiva non deve mai uscire dalla root della campagna.

La V0.1 non segue symlink di file o directory durante l'indicizzazione del vault.

I symlink possono essere ignorati o segnalati, ma non attraversati implicitamente.

## STO-DISC-003 — File interni da ignorare

Non vengono indicizzati come note:

- `campaign.json`;
- file temporanei creati dall'adapter;
- directory `.git`;
- `node_modules`;
- altri artefatti interni identificati esplicitamente dal Campaign Manager.

Non si introduce una regola generica "ignora tutto ciò che inizia con punto" se può nascondere contenuti utente legittimi.

## STO-DISC-004 — Ordinamento

L'ordine fisico restituito dal filesystem non è significativo.

Explorer e ricerca applicano ordinamenti espliciti e deterministici.

---

# 6. Path e nomi

## STO-PATH-001 — Path relativi nel contratto

Il repository converte tra path assoluti del sistema operativo e `NoteId`/`FolderId` relativi.

Il core non riceve path assoluti.

## STO-PATH-002 — Contenimento nella root

Ogni operazione `read`, `write`, `rename`, `move` o `trash` deve verificare che il path risolto resti sotto la root campagna dopo normalizzazione.

Input con traversal (`..`) o path assoluti vengono rifiutati.

## STO-PATH-003 — Policy portability-first

La creazione/rinomina usa una policy compatibile col comune denominatore dei filesystem desktop supportati.

Sono rifiutati almeno:

- separatori di path nel titolo;
- caratteri di controllo;
- nomi vuoti;
- segmenti `.` e `..`;
- nomi che causerebbero collisione logica con un file/cartella esistente;
- nomi riservati non portabili sulle piattaforme supportate;
- trailing dot/space quando non portabili.

L'errore deve indicare cosa correggere.

## STO-PATH-004 — Case collision

Due path che differiscono solo per case non sono accettati come identità distinte dal Campaign Manager.

Questo evita vault che funzionano su un sistema e si rompono su un altro.

---

# 7. Encoding e testo

## STO-TEXT-001 — UTF-8

Le note create dall'app sono UTF-8.

File UTF-8 esistenti devono essere letti senza conversioni proprietarie.

## STO-TEXT-002 — Line ending

Quando possibile l'adapter preserva lo stile di line ending già presente nel file (`LF` o `CRLF`).

Una nuova nota usa il default definito dall'app per la piattaforma o dal progetto, purché sia coerente.

## STO-TEXT-003 — Frontmatter e testo sconosciuto

Il salvataggio ordinario non deve normalizzare o riscrivere porzioni di Markdown non modificate soltanto per convenienza del parser.

Chiavi frontmatter sconosciute devono essere preservate.

---

# 8. Lettura e revisioni

## STO-REV-001 — Revisione basata sul contenuto

`NoteRevision` rappresenta una fingerprint del contenuto persistito.

Implementazione raccomandata V0.1:

```text
SHA-256 dei byte del file
```

`mtime` e dimensione possono essere usati come ottimizzazione, ma non devono essere l'unica protezione se possono produrre falsi negativi.

## STO-REV-002 — Lettura

`get(noteId)` restituisce:

- contenuto Markdown;
- titolo derivato dal filename;
- `NoteRevision` della versione effettivamente letta.

## STO-REV-003 — File scomparso

Se il file sparisce tra discovery e lettura, il repository restituisce `not_found` e non crea automaticamente un nuovo file.

---

# 9. Scrittura sicura

## STO-WRITE-001 — Expected revision

Salvare una nota esistente richiede la revisione attesa dall'editor/application service.

Prima del replace, il repository verifica che la versione sul disco corrisponda ancora a quella attesa.

Se non corrisponde → `conflict`.

## STO-WRITE-002 — Scrittura atomica per singolo file

Una scrittura normale non modifica direttamente il file autorevole in-place.

Flusso richiesto:

```text
validate expected revision
→ write sibling temp file
→ flush/close temp
→ replace target atomically quando supportato
→ verify target exists/readable
→ calculate new revision
→ return saved
```

Se la piattaforma richiede una strategia diversa per un replace sicuro, l'adapter può implementarla purché mantenga la stessa semantica osservabile.

## STO-WRITE-003 — Temp file

I file temporanei usano un pattern riservato e non vengono indicizzati come note.

Un crash che lascia un temp file non deve farlo apparire nel vault al riavvio.

## STO-WRITE-004 — Stato `saved`

Il repository restituisce `saved` soltanto dopo che il target autorevole è stato scritto e la nuova revisione è nota.

Il debounce di autosave appartiene alla UI/applicazione e non cambia questa regola.

## STO-WRITE-005 — Errore di scrittura

Su permission error, disco pieno, path non disponibile o altro errore I/O:

- il file originale non deve essere deliberatamente cancellato;
- il repository restituisce errore tipizzato;
- il buffer dell'editor resta responsabilità dell'applicazione/recovery;
- nessun indicatore può diventare `saved`.

---

# 10. Modifiche esterne

## STO-EXT-001 — File watcher come segnale, non verità

Il watcher filesystem notifica possibili cambiamenti. La decisione usa sempre una nuova lettura/revisione, non il solo evento del watcher.

## STO-EXT-002 — Nota pulita

Se la nota non ha modifiche locali e la revisione su disco cambia, l'app può ricaricare la nuova versione preservando il contesto dove possibile.

## STO-EXT-003 — Nota dirty

Se la nota ha un buffer dirty e la revisione su disco cambia:

- autosave viene sospeso;
- la versione locale non viene sovrascritta;
- la versione esterna non viene sovrascritta;
- entrambe diventano disponibili al flusso di confronto/recupero UI.

## STO-EXT-004 — Rename esterno

La V0.1 non deve fingere di poter correlare sempre un delete+create esterno come rinomina certa.

Se la correlazione non è affidabile, segnala file mancante/nuovo file e lascia la decisione esplicita all'utente.

---

# 11. Recovery drafts

## STO-REC-001 — Separati dal vault

Le bozze di recovery vivono in AppData e non accanto ai file Markdown.

## STO-REC-002 — Contenuto minimo

```ts
interface RecoveryDraft {
  campaignId: CampaignId
  noteId: NoteId
  baseRevision?: NoteRevision
  markdown: string
  capturedAt: string
}
```

Può includere metadata tecnici aggiuntivi purché non sostituisca il file autorevole.

## STO-REC-003 — Quando esiste

Quando un buffer contiene modifiche non ancora confermate sul filesystem, deve esistere una strategia di recovery locale sufficientemente frequente da proteggere da crash realistici.

Il timing preciso è implementativo; non può però dipendere dal fatto che il salvataggio autorevole sia riuscito.

## STO-REC-004 — Cancellazione draft

Un draft può essere eliminato automaticamente soltanto dopo che il contenuto corrispondente è stato confermato come persistito o l'utente lo ha esplicitamente scartato.

## STO-REC-005 — Recupero alla riapertura

Se esiste un draft:

- file ancora alla `baseRevision` → può essere proposto come modifica recuperabile;
- file cambiato rispetto alla base → confronto esplicito;
- file mancante → possibilità di ricreare/esportare il contenuto;
- nessun overwrite automatico di una versione più recente.

---

# 12. Preferenze locali per campagna

## STO-PREF-001 — Repository separato

Le preferenze usano un contratto separato dal `CampaignRepository` autorevole.

Esempio concettuale:

```ts
interface CampaignPreferencesRepository {
  load(campaignId: CampaignId): Promise<CampaignPreferences>
  save(campaignId: CampaignId, value: CampaignPreferences): Promise<void>
}
```

## STO-PREF-002 — Contenuti

Può contenere:

- tab e tab attiva;
- cronologia per tab;
- pannelli e dimensioni;
- recenti;
- preferiti;
- mapping cartella → `GraphFolderColor`;
- stato grafo;
- posizioni manuali nodi;
- altre preferenze esclusivamente UI.

## STO-PREF-003 — Corruzione preferenze

Se `ui.json` è corrotto, la campagna deve comunque aprirsi.

L'app può ripristinare default e segnalare la perdita delle sole preferenze.

---

# 13. Indici derivati

## STO-IDX-001 — Ricostruibili

Indice full-text, backlink index e graph projection possono essere eliminati e ricostruiti dalle note.

## STO-IDX-002 — Mai gate per il salvataggio

Un errore nell'aggiornamento dell'indice dopo un salvataggio riuscito non trasforma il salvataggio del file in fallimento.

Deve però marcare l'indice come stale e pianificarne il rebuild.

## STO-IDX-003 — Nessun contenuto esclusivo

Nessuna informazione che esiste soltanto nell'indice può essere necessaria per ricostruire il vault.

---

# 14. Rinomina e spostamento fisico

## STO-MOVE-001 — Operazioni atomiche per singolo path

`rename`/`move` dell'adapter operano su una singola risorsa e restituiscono il nuovo `NoteId` o un errore tipizzato.

La riscrittura dei wikilink è coordinata dal use case applicativo, non nascosta dentro l'adapter filesystem.

## STO-MOVE-002 — Preflight

Prima di una rinomina/spostamento:

- target validato;
- collisioni controllate;
- permessi verificabili controllati per quanto possibile;
- piano di aggiornamento wikilink calcolato.

## STO-MOVE-003 — Operation journal multi-file

Le operazioni che possono modificare più file, come rinomina + aggiornamento di molti wikilink, registrano un journal locale prima di iniziare.

Contenuto concettuale:

```ts
interface OperationJournal {
  operationId: string
  kind: 'rename-note' | 'move-note' | 'move-folder'
  campaignId: CampaignId
  plannedSteps: OperationStep[]
  completedSteps: string[]
  startedAt: string
}
```

Il journal vive in AppData, non nel vault.

## STO-MOVE-004 — Crash durante operazione multi-file

Alla riapertura un journal incompleto deve essere rilevato.

L'app non dichiara l'operazione riuscita per deduzione. Deve verificare lo stato reale dei file e offrire/effettuare una riconciliazione deterministica secondo il piano registrato.

## STO-MOVE-005 — Esito parziale

Se alcuni aggiornamenti link falliscono ma il rename/move fisico è avvenuto, l'application service restituisce `partial` con elenco dei file falliti, come definito in `DOMAIN_MODEL.md`.

---

# 15. Cestino

## STO-TRASH-001 — Adapter di sistema

La V0.1 usa un adapter esplicito verso il cestino del sistema operativo.

```ts
interface TrashAdapter {
  trash(path: AbsolutePath): Promise<TrashResult>
}
```

L'`AbsolutePath` resta nell'infrastruttura e non entra nel core.

## STO-TRASH-002 — Nessun fallback permanente

Se il cestino non è disponibile o fallisce:

- restituisce `trash_unavailable` o errore appropriato;
- il file resta al suo posto;
- nessun `unlink` permanente viene eseguito automaticamente.

## STO-TRASH-003 — Conferme UI prima dell'adapter

Conferma cartella non vuota e buffer pending avvengono prima della richiesta di trash, secondo `UI_UX_SPEC_V01.md`.

---

# 16. Metadata migrations

## STO-MIG-001 — Versionate

Ogni variazione incompatibile di `campaign.json` incrementa `schemaVersion`.

## STO-MIG-002 — Test prima dei dati reali

Ogni migrazione deve avere fixture before/after e test automatici.

## STO-MIG-003 — Backup metadata

Prima di migrare `campaign.json`, viene conservata una copia recuperabile del file precedente almeno per la durata dell'operazione.

## STO-MIG-004 — Nessuna migrazione dei contenuti per convenienza

L'aggiunta di una feature non giustifica la riscrittura massiva delle note Markdown se può essere implementata tramite dati derivati o preferenze separate.

---

# 17. Error taxonomy

Il livello storage deve esporre errori strutturati almeno per:

```text
not_found
permission_denied
read_only
invalid_path
outside_campaign_root
collision
case_collision
conflict
trash_unavailable
disk_full
encoding_error
metadata_invalid
unsupported_schema
io_error
```

Ogni errore può includere una causa tecnica per log diagnostici, ma la UI non deve dipendere dal testo grezzo dell'eccezione.

---

# 18. Test obbligatori

## STO-TEST-001 — Directory temporanee

I test storage usano directory isolate e verificano il filesystem reale prodotto.

## STO-TEST-002 — CRUD

Copertura minima:

- create;
- read;
- update;
- rename;
- move;
- trash tramite fake adapter controllabile;
- cartella create/move se implementata.

## STO-TEST-003 — Conflitto

Read `r1` → modifica esterna → save con `r1` deve produrre `conflict` e conservare la versione esterna.

## STO-TEST-004 — Scrittura fallita

Simulare errore prima del replace deve lasciare intatto il file autorevole precedente.

## STO-TEST-005 — Recovery

Draft presente + file invariato, file cambiato e file mancante devono produrre tre percorsi distinguibili.

## STO-TEST-006 — Journal

Interrompere artificialmente una rinomina multi-file dopo alcuni step deve lasciare un journal rilevabile e uno stato riconciliabile.

## STO-TEST-007 — Path

Testare almeno:

- Unicode;
- spazi;
- nomi lunghi realistici;
- separatori invaldi;
- traversal;
- case collision;
- directory spostata/non disponibile.

## STO-TEST-008 — Scala V0.1

Con almeno 200 note e 15 cartelle, apertura, discovery e rebuild degli indici devono restare funzionalmente corretti. Le prestazioni precise vengono misurate sull'implementazione reale.

---

# 19. Scenari di accettazione

### STO-ACC-001 — Primo open

Selezionare una cartella writable senza `campaign.json` crea soltanto metadata minimi e non altera i Markdown esistenti.

### STO-ACC-002 — Save vero

Dopo un save riuscito, riaprire il file con un processo separato deve mostrare esattamente il contenuto confermato dall'app.

### STO-ACC-003 — Save fallito

Se il replace fallisce, l'app non mostra `saved`; il buffer/recovery resta disponibile e il file precedente non viene deliberatamente eliminato.

### STO-ACC-004 — Conflitto esterno

Un editor dirty non sovrascrive un file modificato da un editor esterno.

### STO-ACC-005 — Cestino

Con adapter `trash_unavailable`, nessuna cancellazione fisica avviene.

### STO-ACC-006 — Preferenze corrotte

Eliminare/corrompere `ui.json` perde al massimo preferenze locali; le note restano apribili.

### STO-ACC-007 — Indice eliminato

Cancellare completamente l'indice locale e riaprire deve permetterne la ricostruzione senza modificare il vault.

### STO-ACC-008 — Spostamento root

Spostare la cartella campagna in un altro path e riaprirla conserva lo stesso `campaignId` e permette di ricollegare preferenze keyed by ID.

---

## Regola finale

Il vault deve restare comprensibile anche se l'app sparisce domani.

Se una soluzione di storage rende un file Markdown dipendente da cache, DB locale, store UI o servizio cloud per essere recuperato correttamente, non è compatibile con la V0.1.
