# Campaign Manager v2 — Compendium Specification

## 1. Scopo

Questo documento definisce il contratto del compendio di regolamenti del Campaign Manager.

Obiettivi:

- offrire un compendio locale utile anche prima di EcoGDR;
- evitare dipendenze da nomi localizzati come identità;
- distinguere sistema, ruleset/edizione, sorgente e lingua;
- poter sostituire la sorgente temporanea con il futuro database condiviso EcoGDR senza riscrivere UI o dominio;
- non trasformare il Campaign Manager in un character builder o rules engine universale.

La presenza di questa specifica **non assegna automaticamente il compendio alla V0.1**: il momento di implementazione resta deciso dalla roadmap. Qualunque implementazione, temporanea o futura, deve però rispettare questo contratto.

---

# 2. Principi

## CMP-CORE-001 — Sorgente sostituibile

UI e use case accedono al compendio solo tramite `CompendiumRepository`.

Non interrogano direttamente JSON, SQLite, HTTP, EcoGDR o altri formati fisici.

## CMP-CORE-002 — Identità non localizzata

Il nome visualizzato non identifica una regola.

Cambiare lingua modifica la rappresentazione, non l'identità logica dell'entry.

## CMP-CORE-003 — Ruleset esplicito

Una voce appartiene sempre a un ruleset/edizione esplicita.

Due regole di edizioni diverse non vengono considerate la stessa entry soltanto perché hanno lo stesso nome.

## CMP-CORE-004 — Nessuna dipendenza EcoGDR oggi

La prima implementazione non richiede:

- account;
- auth;
- networking;
- API EcoGDR;
- sync;
- database remoto.

## CMP-CORE-005 — Contenuto distribuibile soltanto con diritti chiari

Ogni sorgente deve dichiarare provenienza e condizioni di distribuzione.

Il progetto non deve incorporare testi di manuali proprietari senza una base di licenza o autorizzazione che ne consenta la distribuzione.

Il controllo della licenza è parte del processo di ingestione del dataset, non una responsabilità della UI.

---

# 3. Identificatori

## CMP-ID-001 — `GameSystemId`

Identifica la famiglia di gioco.

Esempio concettuale:

```text
dnd5e
pathfinder2e
```

Non deve essere un nome localizzato.

## CMP-ID-002 — `RulesetId`

Identifica una specifica edizione/revisione di regole.

Esempio:

```text
dnd5e.2014
dnd5e.2024
```

`RulesetId` è stabile e non cambia con la lingua.

## CMP-ID-003 — `SourceId`

Identifica un manuale, SRD, pacchetto o altra fonte.

Esempio concettuale:

```text
srd.2014
basic-rules.2024
```

La stringa concreta dipende dal dataset reale e non implica che l'esempio sia distribuito dal progetto.

## CMP-ID-004 — `EntryId`

Identifica la regola o voce all'interno del ruleset.

Esempio:

```text
spell.fireball
condition.prone
item.longbow
```

## CMP-ID-005 — Chiave canonica

L'identità canonica di una entry è almeno:

```ts
interface CompendiumKey {
  gameSystem: GameSystemId
  ruleset: RulesetId
  entryId: EntryId
}
```

`language` non fa parte della chiave canonica.

`source` è provenienza e può essere una o più referenze della stessa entry.

---

# 4. Modello dati

## CMP-MODEL-001 — `CompendiumEntry`

Modello logico:

```ts
interface CompendiumEntry {
  key: CompendiumKey
  type: CompendiumEntryType
  sourceRefs: SourceId[]
  attributes?: Record<string, unknown>
}
```

`attributes` contiene eventuali dati strutturati specifici del ruleset senza obbligare il core generico a conoscere campi D&D-specifici.

## CMP-MODEL-002 — Tipo entry

`CompendiumEntryType` è un identificatore stabile e non localizzato.

Esempi possibili:

```text
spell
condition
item
creature
rule
class
feature
```

L'elenco non deve essere codificato come tassonomia universale immutabile per tutti i TTRPG. Un ruleset può introdurre tipi aggiuntivi.

## CMP-MODEL-003 — Localizzazione separata

```ts
interface CompendiumLocalization {
  key: CompendiumKey
  language: LanguageCode
  name: string
  body?: string
  shortDescription?: string
  searchTerms?: string[]
}
```

La localizzazione contiene testo destinato all'utente.

## CMP-MODEL-004 — Sorgente

```ts
interface CompendiumSource {
  id: SourceId
  gameSystem: GameSystemId
  rulesets: RulesetId[]
  displayName: string
  version?: string
  license?: string
  attribution?: string
  redistributionAllowed: boolean
}
```

Un dataset bundled nell'app deve avere `redistributionAllowed: true` sulla base di una verifica reale del progetto.

## CMP-MODEL-005 — Ruleset descriptor

```ts
interface RulesetDescriptor {
  id: RulesetId
  gameSystem: GameSystemId
  displayName: string
  defaultLanguage?: LanguageCode
}
```

`displayName` è UI; `id` è identità.

---

# 5. Lingue

## CMP-LANG-001 — Lingua come rappresentazione

La stessa chiave canonica può avere più `CompendiumLocalization`.

Esempio:

```text
key: dnd5e / dnd5e.2014 / spell.fireball
language: it
name: Palla di Fuoco
```

```text
key: dnd5e / dnd5e.2014 / spell.fireball
language: en
name: Fireball
```

L'identità resta invariata.

## CMP-LANG-002 — Fallback esplicito

Quando la lingua richiesta non esiste:

1. il repository può usare la lingua di fallback configurata per il dataset/ruleset;
2. deve indicare che il risultato è in fallback;
3. non inventa o traduce automaticamente il contenuto.

Forma concettuale:

```ts
interface LocalizedCompendiumEntry {
  entry: CompendiumEntry
  localization: CompendiumLocalization
  requestedLanguage: LanguageCode
  resolvedLanguage: LanguageCode
  usedFallback: boolean
}
```

## CMP-LANG-003 — Nessun join per nome

Non si collega una traduzione alla versione originale confrontando `name`.

Il join avviene sempre tramite `CompendiumKey`.

---

# 6. Ruleset ed edizioni

## CMP-RULESET-001 — Separazione obbligatoria

Ogni query significativa deve poter essere limitata a uno o più `RulesetId`.

## CMP-RULESET-002 — Nessuna compatibilità implicita

Il repository non presume che una entry di `dnd5e.2014` sia intercambiabile con una entry omonima di `dnd5e.2024`.

## CMP-RULESET-003 — Confronti futuri

Un eventuale sistema futuro di equivalenze/migrazioni tra edizioni sarà un contratto separato.

Non entra nella prima implementazione del compendio.

---

# 7. Repository contract

## CMP-REPO-001 — Interfaccia

Contratto concettuale minimo:

```ts
interface CompendiumRepository {
  getEntry(
    key: CompendiumKey,
    language: LanguageCode
  ): Promise<LocalizedCompendiumEntry | null>

  search(
    query: string,
    context: CompendiumSearchContext
  ): Promise<CompendiumSearchResult[]>

  listRulesets(gameSystem?: GameSystemId): Promise<RulesetDescriptor[]>
  listSources(context?: CompendiumContext): Promise<CompendiumSource[]>
}
```

## CMP-REPO-002 — Search context

```ts
interface CompendiumSearchContext {
  gameSystem?: GameSystemId
  rulesets?: RulesetId[]
  sourceIds?: SourceId[]
  types?: CompendiumEntryType[]
  language: LanguageCode
  limit?: number
}
```

## CMP-REPO-003 — Risultato ricerca

```ts
interface CompendiumSearchResult {
  key: CompendiumKey
  type: CompendiumEntryType
  name: string
  snippet?: string
  sourceRefs: SourceId[]
  resolvedLanguage: LanguageCode
  usedFallback: boolean
  score?: number
}
```

Il significato preciso di `score` non è contratto pubblico tra adapter diversi; serve solo per ordinare risultati dentro la singola ricerca.

## CMP-REPO-004 — UI indipendente dall'adapter

Nessun componente UI deve importare tipi o client dell'implementazione concreta del repository.

Cambiare `FixtureCompendiumRepository` con un futuro `EcoGdrCompendiumRepository` non deve richiedere modifiche al componente di ricerca o dettaglio salvo nuove feature deliberate.

---

# 8. Prima implementazione temporanea

## CMP-FIX-001 — Fixture JSON versionata

La prima sorgente consigliata è un pacchetto JSON locale versionato e bundled con l'app.

Motivi:

- semplice da ispezionare;
- facile da testare;
- nessun server;
- nessuna migrazione DB prematura;
- sostituibile dietro il repository.

SQLite può essere introdotto in seguito come adapter locale se volume o prestazioni lo richiedono, senza cambiare il dominio.

## CMP-FIX-002 — Manifest

Forma concettuale:

```json
{
  "schemaVersion": 1,
  "datasetVersion": "0.1.0",
  "rulesets": [],
  "sources": []
}
```

## CMP-FIX-003 — Dati canonici e localizzazioni separati

Struttura concettuale:

```text
compendium/
  manifest.json
  entries.json
  locales/
    en.json
    it.json
```

La struttura fisica può essere suddivisa in più file per comodità, ma l'adapter deve esporre lo stesso contratto.

## CMP-FIX-004 — Nessun riferimento tramite array index

ID e relazioni nel dataset usano chiavi stabili, mai la posizione dell'entry in un array JSON.

## CMP-FIX-005 — Validazione all'avvio/build

Le fixture devono essere validate contro uno schema prima di essere considerate utilizzabili.

Errori di dataset non devono produrre risultati parziali silenziosi.

---

# 9. Versionamento dataset

## CMP-VER-001 — `schemaVersion`

Descrive il formato tecnico dei dati.

Una modifica incompatibile del formato incrementa `schemaVersion`.

## CMP-VER-002 — `datasetVersion`

Descrive la versione dei contenuti distribuiti indipendentemente dallo schema tecnico.

## CMP-VER-003 — Adapter future-proof

Il repository può migrare/normalizzare una sorgente fisica prima di esporla al dominio.

UI e use case non devono sapere quale `schemaVersion` fisica sta usando il provider.

---

# 10. Ricerca

## CMP-SEARCH-001 — Ricerca locale iniziale

La prima implementazione può usare ricerca testuale semplice sul dataset bundled.

Non richiede vector DB o embeddings.

## CMP-SEARCH-002 — Ambito

La ricerca deve poter filtrare almeno per:

- ruleset;
- lingua;
- tipo;
- sorgente quando utile.

## CMP-SEARCH-003 — Nome e contenuto

La ricerca può indicizzare nome, descrizione/testo e `searchTerms` localizzati.

Non usa la traduzione di una lingua per rispondere a una query in un'altra lingua salvo fallback esplicito.

## CMP-SEARCH-004 — Indice derivato

Un eventuale indice locale è eliminabile e ricostruibile dal dataset.

Non è fonte autorevole.

---

# 11. Relazione con la campagna

## CMP-CAM-001 — Compendio non dentro il vault

Le entry del compendio bundled non diventano automaticamente file della campagna.

Aprire/consultare una regola non crea Markdown nel vault.

## CMP-CAM-002 — Riferimenti futuri

Se in futuro una nota o scheda referenzia una entry, deve usare `CompendiumKey`, non il nome localizzato.

Esempio concettuale:

```json
{
  "gameSystem": "dnd5e",
  "ruleset": "dnd5e.2014",
  "entryId": "spell.fireball"
}
```

## CMP-CAM-003 — Nessuna edizione implicita

Una campagna può in futuro dichiarare un ruleset preferito, ma il compendio non deduce l'edizione dal linguaggio o dal nome di una voce.

---

# 12. Relazione futura con EcoGDR

## CMP-ECO-001 — Adapter, non rewrite

Percorso previsto:

```text
oggi
UI / use case
    ↓
CompendiumRepository
    ↓
FixtureCompendiumRepository
    ↓
JSON bundled
```

```text
futuro
UI / use case
    ↓
CompendiumRepository
    ↓
EcoGdrCompendiumRepository
    ↓
EcoGDR shared database/API
```

## CMP-ECO-002 — Nessun formato EcoGDR anticipato

Questa specifica non decide:

- API REST/GraphQL;
- database SQL/NoSQL;
- schema auth;
- caching cloud;
- protocollo di sync;
- ID account.

Il futuro adapter tradurrà i contratti reali EcoGDR nel modello definito qui.

## CMP-ECO-003 — Compatibilità verificabile

Il futuro adapter deve superare la stessa contract test suite del repository fixture per le operazioni comuni.

---

# 13. Modificabilità

## CMP-EDIT-001 — Dataset base read-only

Il compendio bundled iniziale è read-only dall'interfaccia utente.

L'utente non modifica accidentalmente la fonte base.

## CMP-EDIT-002 — Homebrew futuro separato

Eventuali entry custom/homebrew saranno una sorgente separata e non una mutazione dei record bundled.

Il design definitivo dell'homebrew è fuori scope di questa specifica iniziale.

---

# 14. Errori

Il repository deve distinguere almeno:

```text
entry_not_found
ruleset_not_found
source_not_found
language_unavailable
dataset_invalid
unsupported_schema
repository_unavailable
```

Un adapter remoto futuro può aggiungere errori infrastrutturali senza obbligare la UI a conoscere dettagli HTTP.

---

# 15. Contract tests obbligatori

## CMP-TEST-001 — Identità tra lingue

Due localizzazioni della stessa entry devono restituire la stessa `CompendiumKey`.

## CMP-TEST-002 — Edizioni distinte

Entry omonime in ruleset differenti devono restare distinguibili e filtrabili.

## CMP-TEST-003 — Ricerca localizzata

Una query in italiano deve restituire il nome/localizzazione italiana quando disponibile e segnalare esplicitamente un eventuale fallback.

## CMP-TEST-004 — Sorgenti

Ogni `sourceRef` deve risolvere a una sorgente valida nel dataset.

## CMP-TEST-005 — ID univoci

Non possono esistere due entry canoniche con la stessa `CompendiumKey` nello stesso dataset normalizzato.

## CMP-TEST-006 — Adapter swap

Una suite condivisa deve poter essere eseguita contro `FixtureCompendiumRepository` e, in futuro, contro qualsiasi altro adapter.

Le aspettative di identità, lingua, filtri ed errori restano le stesse.

## CMP-TEST-007 — Dataset corrotto

Fixture con chiave duplicata, source mancante o localizzazione orfana devono fallire validazione in modo deterministico.

---

# 16. Scenari di accettazione

### CMP-ACC-001 — Stessa regola, due lingue

Richiedere la stessa `CompendiumKey` in `it` e `en` restituisce la stessa identità canonica con testo localizzato differente.

### CMP-ACC-002 — Ruleset distinto

Cercare una voce con filtro `dnd5e.2014` non deve restituire automaticamente la variante `dnd5e.2024` come se fosse la stessa regola.

### CMP-ACC-003 — Sostituzione adapter

Un componente UI costruito contro `CompendiumRepository` deve poter usare una fixture locale o un fake remoto senza import changes nel componente.

### CMP-ACC-004 — Lingua mancante

Se la localizzazione richiesta non esiste, il risultato deve indicare `usedFallback: true` oppure restituire uno stato di lingua non disponibile secondo il contratto; mai fingere che il testo appartenga alla lingua richiesta.

### CMP-ACC-005 — Dataset base intatto

Consultare, cercare o filtrare il compendio non modifica i file bundled né crea automaticamente file nel vault.

---

# 17. Non-obiettivi

Questa specifica non definisce ancora:

- character builder;
- automazione completa delle regole;
- calcolo universale di statistiche;
- marketplace di manuali;
- acquisti;
- DRM;
- editing collaborativo;
- homebrew editor completo;
- migrazione automatica di personaggi tra edizioni;
- sincronizzazione EcoGDR.

---

## Regola finale

Il test architetturale più importante è semplice:

> se domani il database EcoGDR sostituisce le fixture locali, dobbiamo cambiare l'adapter e la configurazione, non riscrivere ricerca, UI o identità delle regole.

Se questo non è possibile, il compendio è stato accoppiato troppo presto alla sua sorgente temporanea.
