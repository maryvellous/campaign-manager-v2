# Campaign Manager v2 — Discord Activity Specification

## 1. Scopo e stato

Questo documento registra le decisioni di prodotto e architettura **approvate** per la futura Discord Activity del Campaign Manager.

La Discord Activity appartiene alla **V0.4**. Non deve essere implementata durante la V0.1 soltanto perché questa specifica esiste.

La specifica verrà approfondita prima dell'implementazione V0.4, ma le decisioni marcate come requisiti `ACT-*` sono già vincolanti e non devono essere reinventate dagli implementatori.

Riferimenti tecnici Discord verificati durante la progettazione:

- https://docs.discord.com/developers/activities/development-guides/multiplayer-experience
- https://docs.discord.com/developers/developer-tools/embedded-app-sdk

---

# 2. Ruolo del prodotto

## ACT-PROD-001 — L'Activity è il tavolo del giocatore

La Discord Activity non è un Campaign Manager ridotto e non è un vault alternativo.

Il suo ruolo è mostrare al giocatore **la parte della sessione live che il DM ha deciso di condividere**.

Principio:

```text
Campaign Manager Desktop
= preparazione, controllo e lato DM

Discord Activity
= lato del tavolo visto dal giocatore durante la sessione

EcoGDR / BeFolder futuro
= campagna e personaggio fuori dalla sessione live
```

L'Activity deve quindi restare piccola, focalizzata e session-oriented.

## ACT-PROD-002 — Nessun vault giocatore

L'Activity non offre automaticamente:

- explorer della campagna;
- accesso alle note private del DM;
- editor delle note;
- ricerca nel vault;
- grafo completo della campagna;
- configurazione IA;
- filesystem;
- funzioni amministrative del Campaign Manager.

Eventuali informazioni persistenti condivise con i giocatori appartengono a feature future dedicate, non vengono esposte implicitamente perché esistono nel vault del DM.

---

# 3. Esperienza del giocatore

## ACT-UX-001 — Stato di attesa

Se il giocatore entra nell'Activity mentre il DM non ha ancora pubblicato una board o una scena condivisa, deve vedere uno stato di attesa semplice e gradevole.

Esempio concettuale:

```text
Aephoredya — sessione in corso
Mary sta preparando la scena…
```

Non deve essere mostrata una dashboard vuota o un elenco di strumenti che non servono ancora.

## ACT-UX-002 — Board come superficie principale

Quando il DM pubblica una board, questa diventa la superficie principale dell'Activity.

Il giocatore può almeno:

- vedere la board pubblicata;
- usare pan e zoom;
- vedere gli elementi che il DM ha reso visibili;
- vedere i token condivisi;
- ricevere aggiornamenti realtime della sessione.

## ACT-UX-003 — Controllo limitato del token

Un giocatore può muovere soltanto i token che il DM gli ha esplicitamente autorizzato a controllare.

Il client giocatore non è trusted: il permesso deve essere validato dal lato autorevole della sessione e non soltanto nascosto nella UI.

## ACT-UX-004 — Contenuti condivisi esplicitamente

L'Activity può mostrare handout, informazioni della scena o altri contenuti soltanto quando il DM li ha esplicitamente pubblicati/condivisi.

La presenza del contenuto nella campagna locale non implica visibilità per i giocatori.

## ACT-UX-005 — Scheda/personaggio successivi

Un accesso alla scheda o al personaggio del giocatore è compatibile con la direzione del prodotto, ma non è necessario per la prima versione minima della sessione live.

La futura integrazione deve rispettare i contratti EcoGDR/personaggio quando saranno stabili e non deve trasformare l'Activity in un character manager completo.

---

# 4. Ingresso tramite Discord

## ACT-JOIN-001 — Discord gestisce l'ingresso principale

Dentro Discord, l'esperienza normale non richiede al giocatore di digitare un codice sessione.

Il giocatore entra usando il normale flusso Discord per **unirsi alla stessa istanza dell'Activity** avviata dal gruppo.

Discord assegna un `instanceId` all'istanza dell'Activity; utenti che partecipano alla stessa istanza ricevono lo stesso identificatore di istanza.

L'Activity usa quindi l'identità dell'istanza Discord come chiave del contesto multiplayer Discord, non il canale vocale come identificatore proprietario della sessione Campaign Manager.

## ACT-JOIN-002 — Non usare il canale vocale come session ID

La presenza nello stesso canale/chiamata Discord non è sufficiente da sola a identificare la sessione Campaign Manager.

Il canale può essere riutilizzato e può ospitare Activity differenti. Il binding applicativo deve riferirsi alla specifica istanza dell'Activity.

## ACT-JOIN-003 — Partecipanti dell'istanza

L'Activity può usare le API dell'Embedded App SDK per conoscere i partecipanti connessi alla stessa istanza e aggiornare la presenza lato UI/sessione.

La lista Discord dei partecipanti non sostituisce i permessi applicativi: essere presenti nell'istanza non concede automaticamente controllo di token o accesso a contenuti non pubblicati.

---

# 5. Pairing tra desktop e Discord Activity

## ACT-PAIR-001 — Pairing esplicito una volta per sessione

Il Campaign Manager Desktop e la Discord Activity sono applicazioni separate. La sessione live del desktop deve quindi essere associata all'`instanceId` Discord in modo esplicito e verificabile.

La prima soluzione approvata usa un **pairing code breve, temporaneo e monouso riservato al master**.

Flusso concettuale:

```text
Campaign Manager Desktop
→ Avvia sessione
→ genera pairing code temporaneo

Master apre/avvia Discord Activity
→ Collega al Campaign Manager
→ inserisce pairing code

Relay/backend
→ associa Activity instanceId ↔ liveSessionId
→ consuma il codice
```

## ACT-PAIR-002 — Il codice non è per i giocatori

Il pairing code non fa parte del normale ingresso dei giocatori dentro Discord.

Dopo il pairing, gli altri partecipanti entrano usando il normale meccanismo Discord per unirsi alla stessa Activity.

## ACT-PAIR-003 — Proprietà del pairing code

Il pairing code deve essere:

- generato per una sessione live specifica;
- breve abbastanza da poter essere digitato facilmente dal master;
- non prevedibile in modo utile;
- monouso;
- con scadenza breve;
- invalidato dopo pairing riuscito o chiusura della sessione;
- privo di significato come password permanente della campagna.

La lunghezza, l'alfabeto e la durata precise saranno fissati in `LIVE_SESSION_SPEC.md` / `PROTOCOL_SPEC.md` prima della V0.3/V0.4.

## ACT-PAIR-004 — Binding runtime

Il relay mantiene concettualmente un binding temporaneo:

```text
Discord Activity instanceId
        ↕
Campaign Manager liveSessionId
```

Questo binding appartiene allo stato live e non viene scritto come relazione permanente nei file autorevoli della campagna.

---

# 6. Client web standalone

## ACT-WEB-001 — Web client prima di Discord

Come già stabilito dalla roadmap, la sessione live viene prima costruita e validata come **client web standalone** in V0.3.

La Discord Activity V0.4 riusa il client/session model già funzionante e aggiunge Discord come ambiente di hosting, identità e join experience.

Discord non deve diventare il fondamento del protocollo realtime.

## ACT-WEB-002 — Codice sessione come fallback standalone

Fuori da Discord, il client web standalone può usare un **codice sessione** per entrare nella sessione corretta.

Flusso concettuale:

```text
browser normale
→ apri client web
→ inserisci codice sessione
→ entra nella live session
```

Questo codice è distinto dal pairing code del master.

- **pairing code**: collega desktop ↔ istanza Discord;
- **session join code**: permette a un client web standalone autorizzato di trovare/entrare nella sessione.

I due concetti non devono essere fusi soltanto per semplificare l'implementazione.

---

# 7. Sicurezza e trust

## ACT-SEC-001 — Il client non è trusted

Né un browser standalone né una Discord Activity possono essere considerati autorevoli soltanto perché dichiarano un `instanceId`, `liveSessionId`, token controllato o ruolo.

Il backend/relay deve validare sessione, identità e permessi prima di accettare azioni significative.

## ACT-SEC-002 — Validazione dell'istanza Discord

Quando la Discord Activity verrà implementata, il backend deve poter verificare server-side che l'`instanceId` presentato corrisponda realmente a un'istanza attiva dell'app Discord, usando i meccanismi ufficiali disponibili al momento dell'implementazione.

Al momento della stesura Discord documenta una Activity Instance API server-side per questa verifica.

Il dettaglio API concreto deve essere riverificato prima della V0.4 e non viene codificato nel core del Campaign Manager.

## ACT-SEC-003 — Minimo privilegio

Essere dentro l'Activity concede soltanto accesso allo stato della sessione che il DM ha pubblicato e alle azioni esplicitamente autorizzate.

Nessun partecipante riceve automaticamente:

- note private;
- credenziali/API key;
- accesso al filesystem;
- controllo di token altrui;
- configurazione del DM;
- dati EcoGDR non necessari alla sessione.

---

# 8. Confini architetturali

## ACT-ARCH-001 — Discord come adapter

Il dominio della live session non dipende dall'Embedded App SDK.

Forma desiderata:

```text
Live session / protocol
        ↑
client web condiviso
        ↑
Discord adapter
        ↑
Embedded App SDK
```

Il client deve poter essere eseguito fuori da Discord durante sviluppo e test.

## ACT-ARCH-002 — Nessun accesso al vault

L'Activity comunica con il relay/session API, non con il filesystem locale del DM.

## ACT-ARCH-003 — Stato pubblicato soltanto

Il desktop costruisce uno snapshot/stato live esplicitamente pubblicabile. Il relay e l'Activity non devono ricevere l'intero dominio privato della campagna per poi nasconderne parti lato client.

---

# 9. Flusso approvato end-to-end

```text
DM apre Campaign Manager
        ↓
avvia live session
        ↓
desktop genera pairing code
        ↓
DM avvia Discord Activity
        ↓
Discord crea/fornisce instanceId
        ↓
DM inserisce pairing code nell'Activity
        ↓
relay associa instanceId ↔ liveSessionId
        ↓
altri giocatori usano "Unisciti all'attività"
        ↓
ricevono la stessa istanza Discord
        ↓
relay li collega alla live session associata
        ↓
waiting state finché il DM non pubblica
        ↓
board/scena condivisa
```

Per il browser standalone:

```text
client web
→ session join code
→ liveSessionId autorizzata
→ stessa esperienza di sessione senza dipendenza da Discord
```

---

# 10. Decisioni ancora aperte intenzionalmente

Prima dell'implementazione V0.3/V0.4 andranno specificati almeno:

- formato e lifecycle esatto di `liveSessionId`;
- durata/lunghezza dei codici;
- autenticazione del client web standalone;
- mapping Discord user ↔ player/session participant;
- modello preciso dei permessi token;
- reconnect e resume;
- comportamento quando il master chiude l'Activity ma il desktop resta online;
- comportamento quando tutti lasciano l'istanza Discord;
- ownership e handoff della sessione;
- mobile layout dell'Activity;
- gestione di più board/scena durante la stessa sessione;
- handout e contenuti condivisi;
- eventuale collegamento futuro al personaggio EcoGDR.

Questi punti non devono essere inventati durante la V0.1. Verranno definiti insieme a `LIVE_SESSION_SPEC.md`, `PROTOCOL_SPEC.md` e alla revisione finale di questa specifica prima della V0.3/V0.4.

---

# 11. Criteri di accettazione futuri

La prima Discord Activity è corretta se almeno:

1. due giocatori che si uniscono alla stessa istanza Discord raggiungono la stessa live session associata;
2. nessun giocatore deve digitare un codice nel flusso Discord normale;
3. il master esegue il pairing una sola volta per quella sessione/istanza;
4. un pairing code scaduto o consumato non può essere riutilizzato;
5. un'istanza Discord non associata non riceve stato privato di alcuna campagna;
6. un token non autorizzato non può essere mosso modificando soltanto il client;
7. il client web standalone continua a funzionare senza Embedded App SDK;
8. chiudere Discord o perdere il client non corrompe né modifica i file autorevoli della campagna.

---

## Regola finale

La Discord Activity deve rendere l'ingresso dei giocatori **più semplice**, non aggiungere un secondo sistema di lobby sopra quello che Discord fornisce già.

Se un giocatore dentro Discord deve conoscere ID tecnici, scegliere manualmente la campagna o copiare codici per una sessione normalmente avviata dal gruppo, il flusso è diventato più complicato del necessario.