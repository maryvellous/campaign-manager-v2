# Campaign Manager v2 — Realtime Protocol Specification

## 1. Scopo e stato

Questo documento definisce il protocollo condiviso tra:

- Campaign Manager Desktop;
- relay/session backend;
- client web standalone;
- futura Discord Activity.

La prima versione del protocollo appartiene alla **V0.3**. Discord V0.4 deve usare lo stesso protocollo e aggiungere soltanto l'adapter Discord per identity/join.

I requisiti con prefisso `PRO-*` sono vincolanti.

Principio:

> gli eventi realtime sincronizzano lo stato live; non trasferiscono il vault e non diventano un secondo formato della campagna.

---

# 2. Trasporto

## PRO-TRANS-001 — HTTPS + WSS

La V0.3 usa:

- **HTTPS** per create/join/resume, gestione codici, ticket WebSocket e pubblicazione/risoluzione asset;
- **WebSocket sicuro (`wss`)** per stato e azioni realtime.

Il desktop apre soltanto connessioni in uscita.

## PRO-TRANS-002 — Durable Object per sessione

Ogni `liveSessionId` viene instradato a una singola unità coordinatrice stateful del relay, prevista come Cloudflare Durable Object.

Quella unità serializza l'ordine delle mutazioni della sessione e mantiene lo stato runtime necessario.

La memoria volatile non è sufficiente: lo stato necessario a sopravvivere a hibernation/restart deve essere ricostruibile dallo storage del session backend.

## PRO-TRANS-003 — WebSocket Hibernation

L'implementazione Cloudflare deve preferire la Hibernation WebSocket API quando compatibile con i requisiti correnti.

Per-connection metadata necessari dopo hibernation possono essere conservati negli attachment WebSocket; stato sessione più grande o necessario oltre la singola connessione appartiene allo storage del Durable Object.

## PRO-TRANS-004 — Nessun asset binario nel protocollo eventi

Immagini e file non vengono serializzati in Base64 dentro i messaggi WebSocket.

Il protocollo trasporta soltanto `publishedAssetId` e metadata necessari.

---

# 3. Autenticazione della connessione

## PRO-AUTH-001 — Credenziali lunghe fuori dalla URL WebSocket

Host secret e participant resume credential non devono essere messi direttamente nell'URL WebSocket.

Il client usa prima HTTPS per ottenere un **WebSocket ticket** breve e monouso.

## PRO-AUTH-002 — WebSocket ticket

Il ticket:

- è opaco e casuale;
- identifica sessione + ruolo/partecipante autorizzato;
- è monouso;
- scade dopo 60 secondi;
- non è riutilizzabile dopo upgrade riuscito;
- può essere trasmesso come parametro dell'URL WebSocket perché la sua vita è brevissima e non sostituisce la credenziale primaria.

## PRO-AUTH-003 — Host ticket

Il desktop ottiene un nuovo ticket presentando la credenziale host/resume valida tramite HTTPS.

## PRO-AUTH-004 — Participant ticket

Il player ottiene un nuovo ticket tramite:

- primo join con session join code;
- resume con participant resume credential;
- futura identity Discord verificata e binding `instanceId ↔ liveSessionId`.

## PRO-AUTH-005 — Connessione non autenticata

Una connessione WebSocket senza ticket valido viene rifiutata prima di ricevere snapshot o stato della sessione.

---

# 4. Versionamento

## PRO-VER-001 — Major protocol version

Ogni messaggio dichiara una major version numerica.

V0.3 parte con:

```text
protocolVersion = 1
```

## PRO-VER-002 — Compatibilità

All'interno della stessa major version:

- nuovi campi opzionali possono essere aggiunti;
- un client deve ignorare campi sconosciuti che non cambiano il significato fondamentale del messaggio.

Una major version incompatibile viene rifiutata esplicitamente con `PROTOCOL_VERSION_UNSUPPORTED`.

## PRO-VER-003 — Schema validato

Tutti i messaggi inbound vengono validati contro schema runtime condiviso da `packages/protocol`.

TypeScript types senza runtime validation non sono sufficienti sul confine di rete.

---

# 5. Envelope dei messaggi

## PRO-MSG-001 — Envelope base

Forma concettuale:

```ts
interface ProtocolMessage<T = unknown> {
  protocolVersion: 1
  type: string
  messageId: string
  sentAt: string
  payload: T
}
```

`messageId` è opaco e univoco abbastanza da diagnosticare/traceare il messaggio.

`sentAt` è informativo; non determina l'ordine autorevole.

## PRO-MSG-002 — Command envelope

Una richiesta di mutazione proveniente da un client contiene inoltre:

```ts
requestId: string
```

Il server usa `requestId` per correlare accepted/rejected e per evitare doppia applicazione accidentale di richieste duplicate.

## PRO-MSG-003 — State sequence

Ogni mutazione **durable dello stato live** accettata incrementa un contatore monotono `stateSeq` della sessione.

Gli eventi di stato server includono il `stateSeq` risultante.

Lo snapshot include il `stateSeq` che rappresenta.

`sentAt` non sostituisce `stateSeq`.

## PRO-MSG-004 — Eventi effimeri fuori dal `stateSeq`

Eventi come preview intermedia del movimento, ping e indicatori puramente transitori possono non incrementare `stateSeq`.

La perdita di un evento effimero non deve rendere inconsistente lo snapshot futuro.

---

# 6. Handshake e snapshot

## PRO-CONN-001 — `connection.ready`

Dopo upgrade autenticato il server invia un messaggio `connection.ready` con almeno:

- ruolo runtime (`host` o `participant`);
- `liveSessionId` logico/opaque se necessario internamente;
- stato lifecycle della sessione;
- identity del client (`participantId` per player);
- `stateSeq` corrente;
- indicazione del presentation state (`waiting`/`board`).

## PRO-CONN-002 — Snapshot subito dopo connect/reconnect

Dopo `connection.ready` il server fornisce lo snapshot necessario al ruolo.

Per un partecipante include soltanto:

- stato pubblico corrente;
- board pubblica corrente se presente;
- propri token controllabili;
- informazioni di sessione necessarie alla UI.

Non include dati privati del master.

## PRO-CONN-003 — Snapshot host

Il desktop riceve lo stato runtime necessario a riprendere la sessione:

- lifecycle;
- board live conosciute nella sessione;
- current board;
- participant presence;
- assegnazioni;
- codici/binding in forma sicura o stato equivalente;
- `stateSeq`.

Non serve rimandare al relay l'intero vault per autenticare il resume.

---

# 7. Resync e perdita messaggi

## PRO-SYNC-001 — Gap detection

Se un client riceve un evento durable con `stateSeq` maggiore del successivo atteso, considera lo stato potenzialmente incompleto.

Non prova a inventare gli eventi mancanti.

## PRO-SYNC-002 — `snapshot.request`

Il client può inviare `snapshot.request`.

Il server risponde con uno snapshot corrente completo per quel ruolo.

## PRO-SYNC-003 — Nessun event replay obbligatorio

V0.3 non richiede un event log persistente né replay arbitrario della cronologia.

Il recovery standard da gap/reconnect è snapshot corrente.

## PRO-SYNC-004 — Client lento

Se un client non riesce a consumare abbastanza velocemente gli eventi:

- gli eventi effimeri possono essere scartati/coalesced;
- lo stato durable non deve essere dichiarato applicato se il client è chiaramente fuori sync;
- il client viene portato a un nuovo snapshot quando necessario.

---

# 8. Comandi host

I nomi seguenti sono parte del protocollo V1 salvo revisione esplicita della spec prima dell'implementazione.

## PRO-HOST-001 — Sessione/presentazione

Comandi:

```text
presentation.publishBoard
presentation.unpublish
presentation.switchBoard
presentation.resetBoard
session.end
```

Solo l'host può inviarli.

## PRO-HOST-002 — Elementi

Comandi:

```text
element.reveal
element.hide
element.update
element.remove
```

`element.reveal` deve contenere soltanto dati pubblicabili dell'elemento.

Il backend non riceve la versione privata completa per poi filtrarla.

## PRO-HOST-003 — Token e permessi

Comandi:

```text
token.move.commit
token.assignControllers
token.clearControllers
```

Il DM è implicitamente autorizzato a muovere tutti i token e non deve essere aggiunto come controller player.

## PRO-HOST-004 — Camera

Comando:

```text
camera.focus
```

È one-shot e non crea follow mode.

## PRO-HOST-005 — Partecipanti

Comando:

```text
participant.remove
```

La gestione di join lock e rotazione codici può usare HTTPS management endpoint invece del WebSocket; non deve essere duplicata in due fonti di verità.

---

# 9. Comandi giocatore

## PRO-PLAYER-001 — Ping

Comando:

```text
ping.create
```

Payload minimo:

```ts
{
  boardId: string
  x: number
  y: number
}
```

Valido soltanto sulla board correntemente pubblicata.

## PRO-PLAYER-002 — Movimento token preview

Durante drag il client può inviare:

```text
token.move.preview
```

Il preview:

- viene validato sul controller;
- è effimero;
- può essere coalesced/scartato;
- non diventa automaticamente posizione durable.

Frequenza client target massima: circa **20 aggiornamenti al secondo**; il server può ridurre/batchare ulteriormente.

## PRO-PLAYER-003 — Movimento token commit

Al rilascio il client invia:

```text
token.move.commit
```

Il commit:

- viene validato;
- aggiorna la posizione live durable;
- incrementa `stateSeq`;
- produce conferma/broadcast autorevole.

## PRO-PLAYER-004 — Nessun comando generico

Non esiste un comando player tipo `board.patch` o `element.modify` che permetta al client di scegliere arbitrariamente cosa cambiare.

Le capacità sono espresse con comandi stretti e specifici.

---

# 10. Eventi server

## PRO-EVT-001 — Lifecycle

Eventi durable:

```text
session.state
session.ended
```

## PRO-EVT-002 — Presentazione

Eventi durable:

```text
presentation.waiting
board.snapshot
board.activated
```

Il cambio board può essere rappresentato direttamente da nuovo `board.snapshot`; `board.activated` è consentito solo se non crea due meccanismi concorrenti per la stessa transizione.

## PRO-EVT-003 — Elementi

Eventi durable:

```text
element.revealed
element.hidden
element.updated
element.removed
```

Un `element.hidden` non contiene il contenuto privato dell'elemento nascosto.

## PRO-EVT-004 — Token

Eventi:

```text
token.move.preview   // effimero
token.position       // durable
token.controllers    // durable e filtrato per ruolo
```

Un partecipante riceve soltanto le informazioni necessarie a sapere quali token può controllare; non è necessario esporre la matrice completa dei permessi di tutti.

## PRO-EVT-005 — Presenza

Eventi:

```text
participant.joined
participant.updated
participant.disconnected
participant.removed
```

La quantità di presenza mostrata al client giocatore può essere ridotta rispetto al desktop.

## PRO-EVT-006 — Camera e ping

Eventi effimeri:

```text
camera.focus
ping.show
```

---

# 11. Accepted/rejected

## PRO-ACK-001 — Risposta alle richieste mutanti

Ogni comando che può modificare stato produce una risposta correlata a `requestId`:

```text
request.accepted
```

o

```text
request.rejected
```

## PRO-ACK-002 — Rejection tipizzata

`request.rejected` contiene almeno:

- `requestId`;
- `code`;
- messaggio breve safe per UI/log;
- eventuale stato autorevole minimo necessario a correggere il client.

Per token move rifiutato può includere la posizione autorevole corrente.

## PRO-ACK-003 — Idempotenza

Il server conserva abbastanza informazione recente da riconoscere il riinvio dello stesso `requestId` e non applicare due volte una mutazione non idempotente.

Finestra target minima: 5 minuti o durata tecnica equivalente sufficiente ai reconnect/retry normali.

---

# 12. Error taxonomy

## PRO-ERR-001 — Codici minimi

Il protocollo/backend deve distinguere almeno:

```text
AUTH_FAILED
SESSION_NOT_FOUND
SESSION_ENDED
HOST_OFFLINE
JOIN_LOCKED
CODE_INVALID
CODE_EXPIRED
PAIRING_INVALID
PAIRING_EXPIRED
PERMISSION_DENIED
TOKEN_NOT_CONTROLLABLE
BOARD_NOT_ACTIVE
BOARD_NOT_FOUND
ASSET_UNAVAILABLE
PAYLOAD_INVALID
RATE_LIMITED
STALE_STATE
PROTOCOL_VERSION_UNSUPPORTED
INTERNAL_ERROR
```

Gli errori interni non devono esporre stack trace, path filesystem del DM o credenziali.

---

# 13. Pubblicazione asset

## PRO-ASSET-001 — `publishedAssetId`

Il protocollo board referenzia un asset live tramite ID opaco:

```ts
interface PublishedAssetRef {
  publishedAssetId: string
  mimeType: string
  width?: number
  height?: number
}
```

Il path locale originale non viene inviato ai player.

## PRO-ASSET-002 — Upload autorizzato

Il desktop richiede tramite HTTPS un upload authorization per un asset che deve essere pubblicato.

Il backend può restituire una presigned PUT URL o meccanismo equivalente.

Dopo upload riuscito il desktop finalizza la registrazione del `publishedAssetId` prima di rivelare l'elemento.

## PRO-ASSET-003 — Download autorizzato

Il player risolve `publishedAssetId` tramite endpoint autorizzato che restituisce accesso temporaneo al file.

Target iniziale per una singola URL di download: circa 1 ora, rinnovabile mentre la sessione è attiva.

L'URL non costituisce accesso al bucket generale.

## PRO-ASSET-004 — Content fingerprint

Il desktop/backend può usare SHA-256 o fingerprint equivalente del file per deduplicare upload identici nella stessa sessione.

Il fingerprint tecnico non sostituisce l'asset locale autorevole.

## PRO-ASSET-005 — Asset hide

Nascondere l'elemento impedisce che nuovi snapshot lo referenzino, ma non promette revoca retroattiva di bytes già scaricati.

---

# 14. Stato persistito nel relay

## PRO-STATE-001 — Stato consentito

Il session backend può conservare temporaneamente:

- lifecycle/session metadata;
- current board ID;
- stato live delle board già usate nella sessione;
- `stateSeq`;
- participant identities/runtime presence;
- token controller assignments;
- hash/stato dei codici;
- credenziali/revoche in forma sicura;
- Discord instance binding futuro;
- riferimenti agli asset pubblicati.

## PRO-STATE-002 — Stato vietato per comodità

Il relay non riceve o persiste come copia generale:

- intero vault Markdown;
- note private;
- indice search;
- graph privato;
- API key del DM;
- cartella campagna completa;
- asset non pubblicati.

## PRO-STATE-003 — Contenuto pubblico necessario

Testo/card/metadata già pubblicati possono vivere nello stato runtime perché servono a ricostruire lo snapshot pubblico durante reconnect.

Sono comunque dati effimeri della sessione, non fonte autorevole della campagna.

---

# 15. Persistenza e performance degli eventi

## PRO-PERF-001 — Mutazioni durable

Devono essere persistite/ricostruibili attraverso restart/hibernation almeno:

- board corrente;
- reveal/hide;
- contenuto pubblico corrente;
- token position commit;
- assegnazioni;
- participant/runtime credentials necessari;
- lifecycle.

## PRO-PERF-002 — Preview non durable

Non è necessario scrivere nello storage del relay ogni pixel di un token durante drag.

`token.move.preview` può restare effimero; `token.move.commit` rappresenta il punto durable.

## PRO-PERF-003 — Batching

Il relay può batchare eventi effimeri ad alta frequenza in piccole finestre temporali, purché:

- non introduca lag percepibile eccessivo;
- non perda il commit finale;
- non alteri l'ordine delle mutazioni durable.

Target iniziale ragionevole per batching preview: 50–100 ms.

## PRO-PERF-004 — Backpressure

La perdita controllata deve preferire:

1. scartare preview obsolete;
2. scartare ping già scaduti;
3. richiedere/respingere a snapshot un client troppo indietro;

mai scartare silenziosamente un commit durable dichiarandolo applicato.

---

# 16. Rate limiting e abuso

## PRO-RATE-001 — Codici

Tentativi falliti su join/pairing endpoint devono essere rate-limited per sorgente e, quando utile, per codice/sessione.

Target iniziale:

- join code: non più di ~10 tentativi falliti/minuto per sorgente prima di cooldown;
- pairing code: non più di ~5 tentativi falliti/minuto per sorgente prima di cooldown.

Le soglie possono essere adattate operativamente senza cambiare la UX normale.

## PRO-RATE-002 — Ping

Il relay può rifiutare spam di ping.

Target iniziale: pochi ping al secondo per partecipante, con cooldown progressivo in caso di abuso.

## PRO-RATE-003 — Movimento

Preview di movimento oltre il rate accettato possono essere coalesced/scartati; il commit finale resta separato.

---

# 17. Discord adapter

## PRO-DISCORD-001 — Nessun fork del protocollo

La Discord Activity non introduce tipi di board/eventi separati.

Dopo authentication/join, riceve gli stessi messaggi player della web app standalone.

## PRO-DISCORD-002 — Pairing

Il pairing endpoint riceve:

- pairing code;
- Discord `instanceId` verificabile;
- identity Discord necessaria al flusso master.

In caso di successo registra il binding runtime e consuma il pairing code.

## PRO-DISCORD-003 — Participant mapping

Il backend usa l'identità Discord verificata per ottenere/creare il `participantId` della sessione.

Il client non può autoassegnarsi un Discord user ID arbitrario nel payload realtime.

---

# 18. Logging e privacy

## PRO-LOG-001 — Log tecnico minimo

Il relay può loggare:

- message/error codes;
- `messageId`/`requestId`;
- session ID tecnico opportunamente trattato;
- timing e diagnostica;
- eventi di connect/disconnect.

## PRO-LOG-002 — No secret nei log

Non devono essere loggati in chiaro:

- host secret;
- resume credentials;
- WebSocket ticket;
- join/pairing code completi;
- presigned URL complete quando contengono firme;
- contenuto privato della campagna.

## PRO-LOG-003 — No payload dump indiscriminato

Il debug non deve basarsi sul dump generale di ogni payload, perché i payload pubblicati possono comunque contenere testo della campagna destinato ai giocatori.

---

# 19. Quality gates

## PRO-QA-001 — Contract tests

Devono esistere test condivisi che dimostrino almeno:

- valid/invalid schema per ogni comando/evento;
- major version mismatch;
- permission enforcement;
- token move accepted/rejected;
- duplicate `requestId` non doppio-applicato;
- `stateSeq` monotono;
- gap → snapshot request;
- reconnect → snapshot corrente;
- elemento privato assente dallo snapshot player;
- codice/binding scaduto non accettato;
- session ended rifiuta nuovi ticket;
- host_reconnecting blocca mutazioni player;
- asset non disponibile impedisce reveal riuscito.

## PRO-QA-002 — Relay lifecycle

Testare il session backend anche attraverso restart/hibernation simulata:

- connessioni ricostruite correttamente;
- session state durable ripristinato;
- per-connection identity ripristinata quando supportato;
- nessun affidamento esclusivo a memoria volatile.

## PRO-QA-003 — Carico minimo

Validare almeno:

- 1 host + 8 player WebSocket simultanei;
- movimento concorrente di più token;
- reconnect multipli;
- board switch;
- snapshot con una board realisticamente popolata;
- burst di preview senza perdita del commit finale.

Otto player non costituiscono hard cap.

---

# 20. Dipendenze e package

## PRO-ARCH-001 — `packages/protocol`

Contiene:

- schema runtime;
- tipi TypeScript derivati/coerenti;
- enum/costanti stabili dei message type/error code;
- helpers di validazione/versioning;
- contract fixtures.

Non contiene:

- React;
- filesystem;
- Discord SDK;
- Cloudflare implementation details;
- logica UI.

## PRO-ARCH-002 — Adapter distinti

```text
Desktop SessionService ─┐
                        ├─→ protocol types/schemas
Web Player Client ──────┤
Discord Adapter ─────────┤
Relay Durable Object ────┘
```

Il protocollo è il contratto condiviso; ogni ambiente mantiene il proprio adapter.

---

## Regola finale

Il protocollo deve rendere possibile questa proprietà:

> se un client sparisce, si riconnette o perde eventi, può tornare allo stato corretto senza conoscere il filesystem del DM e senza richiedere il replay completo della storia.

Lo snapshot corrente è la rete di sicurezza; gli eventi incrementali sono l'ottimizzazione realtime.