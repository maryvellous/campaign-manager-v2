# Campaign Manager v2 — Realtime Protocol Specification

## 1. Scopo

Questo documento definisce il protocollo condiviso tra Desktop, relay e player web della V0.3. La Discord Activity V0.4 riusa lo stesso protocollo dopo il proprio flusso di ingresso.

Prefisso requisiti: `PRO-*`.

Principio:

> snapshot corrente per recuperare lo stato; eventi incrementali per rendere il realtime fluido.

Il protocollo non trasferisce il vault e non diventa un secondo formato della campagna.

---

# 2. Trasporto

## PRO-TRANS-001 — HTTPS + WSS

- HTTPS per create/join/resume, gestione del join code, autorizzazione connessioni e asset;
- WSS per snapshot, presenza, board live, token e ping.

Il desktop apre soltanto connessioni in uscita.

## PRO-TRANS-002 — Coordinatore per sessione

Ogni live session deve avere un singolo coordinatore logico capace di serializzare le mutazioni accettate e ricostruire lo stato runtime necessario dopo restart/hibernation.

Cloudflare Durable Objects è l'implementazione prevista, ma il protocollo non dipende dai suoi dettagli interni.

## PRO-TRANS-003 — Asset separati

Immagini e file non viaggiano in Base64 nei messaggi realtime. I messaggi referenziano asset pubblicati separatamente.

---

# 3. Autenticazione connessioni

## PRO-AUTH-001 — Credenziali primarie fuori dalla URL WSS

Host secret e participant resume credential non vengono inseriti direttamente nella URL WebSocket.

HTTPS rilascia una credenziale/ticket breve per aprire la connessione WSS.

Scadenza e formato precisi sono dettagli di implementazione e sicurezza da tarare; il ticket deve comunque essere breve, revocabile e non sostituire la credenziale primaria.

## PRO-AUTH-002 — Confine non trusted

Una connessione non autenticata non riceve snapshot o stato sessione.

Identità, ruolo e permessi vengono stabiliti dal backend, non dal payload dichiarato dal client.

---

# 4. Versionamento e validazione

## PRO-VER-001 — Major version

Il protocollo ha una major version condivisa; la prima implementazione usa `1`.

Campi opzionali compatibili possono essere aggiunti nella stessa major. Cambi incompatibili richiedono nuova major.

## PRO-VER-002 — Runtime validation

Tutti i messaggi inbound attraversano schema validation runtime condivisa. I soli TypeScript types non bastano sul confine di rete.

---

# 5. Messaggi e ordering

## PRO-MSG-001 — Envelope minimo

Ogni messaggio necessita almeno di:

```ts
{
  protocolVersion: 1
  type: string
  payload: unknown
}
```

`messageId`, timestamp diagnostici o altri metadata possono esistere quando utili, ma non sono requisiti universali di prodotto.

## PRO-MSG-002 — `requestId` per comandi mutanti

Un comando che richiede una risposta accepted/rejected usa un `requestId` di correlazione.

Non è richiesto un framework generale di idempotenza con cache temporali prefissate.

Dopo perdita di connessione il client non ritrasmette alla cieca mutazioni vecchie e incerte: si riallinea tramite snapshot e riparte dallo stato corrente.

## PRO-MSG-003 — `stateSeq`

Ogni mutazione durevole dello stato live accettata incrementa un contatore monotono `stateSeq`.

Snapshot ed eventi durevoli dichiarano il `stateSeq` che rappresentano.

Eventi puramente effimeri come ping o preview di drag possono restare fuori dalla sequenza.

---

# 6. Connect, snapshot e resync

## PRO-CONN-001 — Connection ready

Dopo autenticazione il server comunica almeno:

- ruolo runtime;
- stato lifecycle;
- `participantId` quando applicabile;
- `stateSeq` corrente;
- waiting/board.

## PRO-CONN-002 — Snapshot iniziale

Subito dopo connect/reconnect il client riceve lo snapshot necessario al proprio ruolo.

Un player riceve soltanto stato pubblico e propri permessi.

L'host riceve stato runtime sufficiente a riprendere la sessione.

## PRO-SYNC-001 — Gap

Se un client rileva un salto nella sequenza durevole, non inventa gli eventi mancanti: richiede/riceve un nuovo snapshot.

## PRO-SYNC-002 — Nessun replay obbligatorio

V0.3 non richiede event sourcing, log persistente o replay arbitrario.

---

# 7. Comandi host

Comandi concettuali minimi:

```text
presentation.publishBoard
presentation.unpublish
presentation.switchBoard
presentation.resetBoard
session.end

element.reveal
element.hide
element.update
element.remove

token.move.commit
token.assignController
token.clearController

camera.focus
participant.remove
```

Solo l'host può inviare comandi host.

La gestione del join code può restare su HTTPS management endpoint per non duplicare fonti di verità.

---

# 8. Comandi giocatore

## PRO-PLAYER-001 — Ping

```text
ping.create
```

Valido soltanto sulla board correntemente pubblicata.

## PRO-PLAYER-002 — Token move

Durante il drag può esistere:

```text
token.move.preview
```

È effimero e può essere coalesced/scartato.

Al rilascio:

```text
token.move.commit
```

Il backend verifica che il partecipante sia il controller corrente del token, aggiorna lo stato durevole e incrementa `stateSeq`.

Frequenza preview, batching e throttling sono dettagli da misurare sull'implementazione reale, non numeri normativi.

## PRO-PLAYER-003 — Nessun patch generico

Non esistono comandi player generici come `board.patch` o `element.modify` che permettano al client di scegliere arbitrariamente cosa cambiare.

---

# 9. Eventi server

Il protocollo deve poter rappresentare almeno:

```text
session.state
session.ended

presentation.waiting
board.snapshot

element.revealed
element.hidden
element.updated
element.removed

token.move.preview
token.position
token.controller

participant.joined
participant.updated
participant.disconnected
participant.removed

camera.focus
ping.show
```

La forma concreta può essere affinata durante implementazione purché non crei due meccanismi concorrenti per la stessa transizione.

Un player riceve solo le informazioni necessarie al proprio ruolo.

---

# 10. Accepted / rejected

## PRO-ACK-001 — Risposta correlata

Un comando mutante produce:

```text
request.accepted
```

oppure

```text
request.rejected
```

con lo stesso `requestId`.

## PRO-ACK-002 — Rifiuto utile

Il rifiuto contiene un error code safe per UI e, quando serve, lo stato autorevole minimo per correggere il client (per esempio la posizione corrente di un token).

Nessun errore espone stack trace, path locali o credenziali.

---

# 11. Error taxonomy minima

Il backend distingue almeno:

```text
AUTH_FAILED
SESSION_NOT_FOUND
SESSION_ENDED
HOST_OFFLINE
JOIN_LOCKED
CODE_INVALID
PERMISSION_DENIED
TOKEN_NOT_CONTROLLABLE
BOARD_NOT_ACTIVE
ASSET_UNAVAILABLE
PAYLOAD_INVALID
RATE_LIMITED
STALE_STATE
PROTOCOL_VERSION_UNSUPPORTED
INTERNAL_ERROR
```

Errori Discord-specifici appartengono all'adapter V0.4, non alla V0.3 standalone.

---

# 12. Asset

## PRO-ASSET-001 — Riferimento opaco

La board live usa un `publishedAssetId` o riferimento equivalente; il path locale originale non viene inviato ai player.

## PRO-ASSET-002 — Upload autorizzato

Il desktop ottiene autorizzazione temporanea a pubblicare un asset e ne conferma la disponibilità prima del reveal.

## PRO-ASSET-003 — Download autorizzato

Il player ottiene accesso temporaneo soltanto agli asset pubblicati che gli servono.

Durata URL/token e strategia di rinnovo vengono tarate durante implementazione.

## PRO-ASSET-004 — Ottimizzazioni facoltative

Fingerprint e deduplicazione sono consentiti ma non obbligatori nella prima versione.

---

# 13. Stato consentito nel relay

Il backend può conservare temporaneamente:

- lifecycle;
- board corrente;
- stato live delle board usate;
- `stateSeq`;
- participant identity/presence;
- token controller e posizioni;
- stato del join code;
- credenziali/revoche in forma sicura;
- riferimenti asset pubblicati;
- futuri binding Discord quando V0.4 è attiva.

Non conserva per comodità:

- vault Markdown;
- note private;
- search index/graph privato;
- API key;
- asset non pubblicati.

---

# 14. Backpressure e rate limiting

Il relay deve proteggersi da client lenti e abuso, ma le soglie precise sono operative.

Priorità:

1. preview obsolete possono essere scartate/coalesced;
2. ping effimeri possono essere limitati;
3. client troppo indietro torna a snapshot;
4. un commit durevole non viene dichiarato applicato e poi perso silenziosamente.

Join code, ping e movimento devono essere rate-limited in modo ragionevole senza fissare oggi numeri arbitrari.

---

# 15. Logging e privacy

I log possono contenere codici errore, identificatori tecnici e timing diagnostici.

Non devono contenere in chiaro:

- host/resume secret;
- ticket;
- join code completo;
- URL firmate complete;
- payload privati della campagna.

Nessun dump indiscriminato di tutti i payload.

---

# 16. Package/proprietà architetturale

Un eventuale `packages/protocol` contiene schema runtime, tipi condivisi, costanti e fixture di contratto.

Non contiene React, filesystem, Discord SDK o implementazione Cloudflare.

Se all'inizio il contratto resta piccolo, può essere introdotto solo quando desktop/relay/player hanno davvero bisogno di condividerlo.

---

# 17. Quality gate

Testare almeno:

- schema valido/non valido;
- version mismatch;
- permission enforcement;
- token move accepted/rejected;
- `stateSeq` monotono;
- gap → snapshot;
- reconnect → snapshot corrente;
- elemento privato assente dallo snapshot player;
- session ended rifiuta nuove connessioni;
- host_reconnecting blocca mutazioni;
- asset non disponibile impedisce reveal riuscito;
- 1 host + 8 player come fixture, non hard cap;
- burst di preview senza perdere il commit finale.

---

## Regola finale

Il protocollo è sufficientemente robusto quando un client può perdere eventi o riconnettersi e tornare allo stato corretto tramite snapshot, senza event sourcing e senza conoscere il filesystem del DM.