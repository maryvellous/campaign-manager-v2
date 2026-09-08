# Campaign Manager v2 — Storage Specification V0.1

## 1. Scopo

Questo documento definisce la persistenza locale della V0.1.

Obiettivo:

- campagna leggibile come normale cartella di file;
- save reali e sicuri;
- nessuna sovrascrittura silenziosa;
- recovery separata;
- cache/preferenze eliminabili;
- niente database proprietario necessario a recuperare il vault.

`V01_OPERATIONAL_SPEC.md` prevale quando definisce una soluzione più semplice allo stesso requisito.

---

# 2. Classi di dati

## STO-AUTH-001 — Autorevoli

Sono dati autorevoli:

- note Markdown;
- asset utente;
- `campaign.json`;
- futuri file esplicitamente dichiarati contenuto campagna.

## STO-AUTH-002 — Locali non autorevoli

Vivono fuori dal vault:

- tab/history;
- recenti/preferiti;
- pannelli e folder colors;
- preferenze grafo;
- search/backlink/graph cache;
- recovery drafts;
- piccoli repair record per rename/move incompleti.

La loro perdita non deve corrompere i contenuti.

## STO-AUTH-003 — Nessuna preferenza nel Markdown

Preferenze e stato tecnico non vengono inseriti automaticamente nel frontmatter o nel corpo delle note.

---

# 3. `campaign.json`

## STO-CAM-001 — Root metadata

`campaign.json` vive nella root.

Schema minimo V0.1:

```json
{
  "schemaVersion": 1,
  "campaignId": "<uuid>"
}
```

`name` e il futuro `externalBinding` possono essere opzionali, ma V0.1 non usa networking EcoGDR.

## STO-CAM-002 — CampaignId

UUID casuale generato alla prima inizializzazione, indipendente da nome/path.

## STO-CAM-003 — Prima apertura

Cartella leggibile+writable senza metadata → crea soltanto `campaign.json`; nessun altro file viene modificato.

Metadata esistenti invalidi non vengono sovrascritti automaticamente.

## STO-CAM-004 — Schema

- corrente → apertura normale;
- precedente noto → migrazione testata;
- futuro/non supportato → nessun downgrade automatico.

Prima di una migrazione metadata viene conservata una copia recuperabile del file precedente per la durata dell'operazione.

---

# 4. AppData

## STO-APP-001 — Separazione

Forma concettuale:

```text
<AppData>/CampaignManagerV2/
  campaigns/<campaignId>/
    ui.json
    recovery/
    repairs/
  indexes/<campaignId>/
```

La struttura fisica precisa è implementativa.

## STO-APP-002 — Campagna spostata

Preferenze e recovery sono keyed by `campaignId`, quindi spostare la root non deve perdere automaticamente lo stato locale quando la campagna viene riaperta.

---

# 5. Discovery e path

## STO-DISC-001 — Note

Nota V0.1 = file regolare `.md` sotto la root.

La scansione:

- non esce dalla root;
- non segue symlink;
- ignora `campaign.json`, temp file interni, `.git`, `node_modules` e artefatti interni dichiarati.

## STO-PATH-001 — Contratti relativi

Il core usa `NoteId`/`FolderId` relativi; path assoluti restano nell'adapter.

Ogni read/write/rename/move/trash verifica il contenimento nella root.

Traversal e path assoluti ricevuti come identità logica vengono rifiutati.

## STO-PATH-002 — Policy nomi

Creazione/rinomina rifiuta almeno nomi vuoti, separatori, control chars, `.`/`..`, collisioni logiche, nomi Windows riservati e trailing dot/space problematici.

Collisioni solo per case non sono identità distinte.

---

# 6. Encoding e lettura

## STO-TEXT-001 — UTF-8

Le nuove note sono UTF-8. I file esistenti UTF-8 vengono letti senza formati proprietari.

Line ending esistente viene preservato quando pratico.

Il salvataggio non riscrive frontmatter/Markdown non modificato soltanto per comodità del parser.

## STO-REV-001 — NoteRevision

Ogni lettura restituisce una revisione del contenuto abbastanza affidabile da rilevare modifiche concorrenti.

SHA-256 dei byte è una implementazione semplice e raccomandata; `mtime`/size possono essere ottimizzazioni ma non devono introdurre overwrite stale.

---

# 7. Save sicuro

## STO-WRITE-001 — Expected revision

Save di una nota esistente include la revisione attesa. Se il contenuto corrente su disco non corrisponde → `conflict`, nessun overwrite.

## STO-WRITE-002 — Replace sicuro

Semantica richiesta:

```text
validate revision
→ scrivi temp
→ close/flush
→ replace sicuro/atomico quando supportato
→ verifica target
→ calcola nuova revision
→ saved
```

La strategia Windows concreta può variare purché il file precedente non venga deliberatamente perso in caso di errore prima del replace.

## STO-WRITE-003 — Temp

I temp file usano un pattern interno e non compaiono nel vault.

## STO-WRITE-004 — Successo reale

`saved` soltanto dopo persistenza confermata. Disco pieno, permessi o altri errori I/O producono errore tipizzato e lasciano il buffer all'application/recovery.

---

# 8. Modifiche esterne

## STO-EXT-001 — Watcher come segnale

Il watcher induce una rilettura/revisione; non è da solo prova dello stato del file.

## STO-EXT-002 — Clean vs dirty

- nota clean + revisione cambiata → nuova versione può diventare autorevole;
- nota dirty + revisione cambiata → conflict, nessun overwrite delle due versioni.

## STO-EXT-003 — Missing/rename esterno

File scomparso → `not_found`, nessuna ricreazione automatica.

Delete+create non viene dichiarato rename se non può essere correlato in modo affidabile.

---

# 9. Recovery semplice

## STO-REC-001 — Fuori dal vault

Le recovery vivono in AppData.

## STO-REC-002 — Target

Devono poter proteggere sia una nota esistente sia un draft non ancora materializzato.

Forma concettuale:

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

## STO-REC-003 — Frequenza

La recovery viene aggiornata abbastanza spesso da proteggere da crash realistici.

**Nessun intervallo numerico è imposto dallo storage contract.** La strategia può essere debounce/periodica/event-driven purché non dipenda dal successo del save autorevole.

## STO-REC-004 — Lifecycle

Recovery eliminabile soltanto dopo:

- persistenza confermata dello stesso contenuto; oppure
- discard esplicito.

Alla riapertura:

- file invariato → ripristino semplice;
- file cambiato → conflict flow;
- file mancante → ricrea/salva come nuova/esporta.

Non è richiesto un framework separato di version history.

---

# 10. Preferenze

## STO-PREF-001 — Separate

Le preferenze locali possono contenere tab/history, pannelli, recenti/preferiti, folder colors e stato utile del grafo.

Posizioni manuali dei nodi possono essere conservate se l'implementazione lo rende semplice, ma **non sono requisito V0.1**.

## STO-PREF-002 — Corruzione

`ui.json` corrotto non blocca la campagna. Si ripristinano default e si segnala soltanto la perdita delle preferenze.

Un errore di salvataggio preferenze non rende fallito un save Markdown riuscito.

---

# 11. Indici derivati

Search, backlink e graph projection:

- sono eliminabili e ricostruibili;
- non contengono contenuto esclusivo necessario al vault;
- non fanno fallire un save già riuscito se il loro update fallisce;
- vengono marcati stale/rebuildati quando necessario.

---

# 12. Rename/move fisico e repair record

## STO-MOVE-001 — Adapter singola risorsa

Il filesystem adapter rinomina/sposta una risorsa. La riscrittura wikilink e il remap applicativo restano fuori dall'adapter.

## STO-MOVE-002 — Preflight

Prima del move/rename applicativo vengono controllati target, collisioni e le revisioni delle source che dovranno essere riscritte.

## STO-MOVE-003 — Repair record minimale

Una operazione che deve rinominare/spostare e poi riscrivere altri file salva prima un piccolo record locale sufficiente a diagnosticare un crash.

Forma concettuale:

```ts
interface MoveRepairRecord {
  operationId: string
  kind: 'rename-note' | 'move-note' | 'move-folder'
  campaignId: CampaignId
  oldPath: string
  newPath: string
  startedAt: string
}
```

Può contenere altre informazioni strettamente necessarie alla riparazione concreta, ma **non deve diventare un engine generico di planned/completed steps**.

## STO-MOVE-004 — Crash

Alla riapertura:

1. verifica se old/new path esistono realmente;
2. ricostruisce dal vault corrente quali link necessitano ancora riparazione;
3. propone/esegue la riparazione specifica;
4. elimina il record quando lo stato è coerente.

Non sono richiesti rollback automatico, event sourcing o replay generico.

## STO-MOVE-005 — Partial

Move fisico riuscito + alcune source non riscrivibili → `partial` con dettaglio; nessuna source stale viene sovrascritta.

---

# 13. Cestino

V0.1 usa un adapter del cestino di sistema.

Se non disponibile/fallisce:

- errore `trash_unavailable` o appropriato;
- elemento intatto;
- nessun fallback a `unlink` permanente.

---

# 14. Migrazioni

Solo metadata tecnici versionati richiedono migration schema.

Ogni migrazione incompatibile di `campaign.json` ha test before/after.

Non si riscrivono massivamente note Markdown per introdurre feature che possono restare derivate/locali.

---

# 15. Error taxonomy

Almeno:

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

La UI usa categorie strutturate, non parsing di stringhe native.

---

# 16. Test obbligatori

Su directory temporanee verificare almeno:

- create/read/update note;
- create/rename/move cartella;
- rename/move note;
- safe write fallito;
- conflict revision;
- trash adapter;
- recovery: file invariato/cambiato/mancante + draft nuovo;
- repair record con crash dopo rename fisico;
- Unicode/spazi/traversal/case collision;
- root spostata/non disponibile;
- indice eliminato ricostruibile.

Dataset 200 note / 15 cartelle resta il minimo di validazione funzionale. Dataset più grandi sono stress test, non gate storage.

---

# 17. Scenari di accettazione

1. Prima apertura crea solo metadata minimi.
2. Save riuscito è leggibile identico da processo esterno.
3. Save fallito non distrugge il file precedente e non produce `saved`.
4. Modifica esterna concorrente produce conflict.
5. Cestino indisponibile non cancella nulla.
6. Preferenze corrotte non compromettono le note.
7. Eliminare l'indice non modifica il vault e permette rebuild.
8. Root spostata mantiene `campaignId`.
9. Crash durante rename/move lascia un repair record sufficiente a verificare/riparare il caso concreto.

## Regola finale

Il vault deve restare comprensibile anche se l'app sparisce domani. La robustezza serve a **non perdere dati**, non a costruire un database transazionale sopra una cartella Markdown.