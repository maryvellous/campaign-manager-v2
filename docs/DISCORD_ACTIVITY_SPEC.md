# Campaign Manager v2 — Discord Activity Specification

## 1. Scopo e stato

Questo documento definisce le decisioni di prodotto e architettura della **V0.4 — Discord Activity**.

La Activity non introduce un secondo dominio live: riusa `docs/LIVE_SESSION_SPEC.md` e `docs/PROTOCOL_SPEC.md` già funzionanti nella V0.3 standalone e aggiunge Discord come adapter di identity, join e hosting.

I requisiti `ACT-*` sono vincolanti.

Riferimenti tecnici Discord da riverificare al momento dell'implementazione:

- https://docs.discord.com/developers/activities/development-guides/multiplayer-experience
- https://docs.discord.com/developers/developer-tools/embedded-app-sdk

---

# 2. Ruolo del prodotto

## ACT-PROD-001 — L'Activity è il tavolo del giocatore

La Discord Activity non è un Campaign Manager ridotto e non è un vault alternativo.

```text
Campaign Manager Desktop
= preparazione, controllo e lato DM

Discord Activity
= lato del tavolo visto dal giocatore durante la sessione

EcoGDR / BeFolder futuro
= campagna e personaggio fuori dalla sessione live
```

## ACT-PROD-002 — Nessun vault giocatore

L'Activity non offre automaticamente:

- explorer della campagna;
- note private;
- editor note;
- ricerca nel vault;
- grafo completo;
- configurazione IA;
- filesystem;
- amministrazione Campaign Manager.

## ACT-PROD-003 — Stesso client model della V0.3

La Activity riusa il player client/session model già validato nel browser standalone.

Discord non deve essere usato per mascherare una dipendenza del protocollo da API Discord.

---

# 3. Esperienza del giocatore

## ACT-UX-001 — Waiting state

Se nessuna board è pubblicata:

```text
Aephoredya — sessione in corso
Il master sta preparando la scena…
```

Nessuna dashboard vuota o lista di strumenti inutili.

## ACT-UX-002 — Board come superficie principale

Quando viene pubblicata una board, questa occupa la superficie principale.

Il giocatore può:

- pan/zoom;
- vedere solo elementi pubblici;
- vedere token condivisi;
- creare ping;
- muovere token autorizzati;
- ricevere `Porta tutti qui`;
- aprire/ingrandire contenuti pubblici quando previsto.

## ACT-UX-003 — Nessun authoring libero

Il giocatore non crea o modifica liberamente testi, immagini, card, collegamenti o board.

## ACT-UX-004 — Handout senza sottosistema separato

La prima Activity non introduce una libreria handout autonoma.

Un handout può essere condiviso come immagine/card/estratto sulla board e, se utile, aperto in overlay dal client.

## ACT-UX-005 — Layout piccolo/mobile

La Activity deve restare utilizzabile su viewport piccoli:

- board sempre prioritaria;
- toolbar player ridotta ai soli controlli realmente disponibili;
- pannelli secondari diventano overlay/collassabili;
- nessuna funzione di authoring desktop viene aggiunta per riempire spazio.

La progettazione precisa responsive viene validata sull'Activity reale, ma non può richiedere una larghezza desktop per compiere pan, zoom, ping e token move.

## ACT-UX-006 — Personaggio futuro

Scheda/personaggio restano feature successive e non bloccano V0.4.

---

# 4. Ingresso tramite Discord

## ACT-JOIN-001 — Join nativo Discord

Nel flusso normale il giocatore non inserisce il session join code standalone.

Si unisce alla stessa istanza dell'Activity usando il normale flusso Discord.

## ACT-JOIN-002 — `instanceId`, non canale vocale

Il contesto Discord è identificato dalla specifica Activity instance.

Il canale/chiamata Discord non viene usato come session ID Campaign Manager.

## ACT-JOIN-003 — Binding con live session

Dopo il pairing esiste:

```text
Discord Activity instanceId
        ↕
Campaign Manager liveSessionId
```

Il binding è runtime nel relay/session backend.

## ACT-JOIN-004 — Istanza non associata

Un'istanza Discord non ancora associata mostra soltanto uno stato neutro di collegamento e non riceve dati della campagna.

## ACT-JOIN-005 — Nuovi ingressi bloccati

Se il DM ha disattivato `Accetta nuovi giocatori`, un nuovo utente Discord che apre la Activity non viene ammesso alla live session, pur essendo tecnicamente presente nell'istanza Discord.

---

# 5. Pairing master

## ACT-PAIR-001 — Pairing una volta per istanza

Il master avvia la live session dal desktop e ottiene il pairing code definito in `LIVE_SESSION_SPEC.md`.

Flusso:

```text
Desktop → Avvia sessione → pairing ABC-DEF
Master apre Activity → Collega al Campaign Manager → ABC-DEF
Backend verifica → instanceId ↔ liveSessionId
Code consumato
```

## ACT-PAIR-002 — Proprietà del codice

Pairing code V0.4:

- 6 caratteri utili;
- formato visuale `ABC-DEF`;
- monouso;
- scadenza 10 minuti;
- rigenerabile;
- non è una password campagna;
- non è usato dai giocatori.

## ACT-PAIR-003 — Activity del master non è host

Dopo il pairing, il Campaign Manager Desktop resta l'unico host autorevole.

Chiudere la Activity del master non termina e non mette in pausa la sessione se il desktop resta online.

---

# 6. Identità Discord e participant mapping

## ACT-ID-001 — Identity verificata server-side

Il client non può dichiarare liberamente il proprio Discord user ID.

L'adapter/backend usa il flusso ufficiale Discord disponibile al momento dell'implementazione per verificare user identity e Activity instance.

## ACT-ID-002 — Discord user → participantId

Dentro una live session, un utente Discord verificato viene mappato a un `participantId` runtime.

Lo stesso utente che lascia e rientra nella stessa sessione recupera la stessa identity runtime quando possibile, incluse assegnazioni token non revocate.

## ACT-ID-003 — Nome visualizzato

Il client può mostrare display name/avatar Discord come presentazione dell'utente, ma permessi e identity non dipendono dal testo del display name.

---

# 7. Permessi

## ACT-SEC-001 — Client non trusted

Essere dentro la Activity non concede autorità.

Il backend valida sempre sessione, identity e capacità richiesta.

## ACT-SEC-002 — Token

Un giocatore muove soltanto token assegnati nella live session.

Cambiare JavaScript/client non permette di controllare token diversi perché il server rifiuta il comando.

## ACT-SEC-003 — Contenuti

La Activity riceve soltanto lo snapshot pubblico e gli eventi pubblici definiti dal protocollo.

Non riceve l'intera board con flag `hidden`, né il vault per filtrarlo localmente.

## ACT-SEC-004 — Dati vietati

Non raggiungono la Activity:

- API key;
- host credentials;
- path locali;
- note private;
- asset non pubblicati;
- configurazione DM;
- search index;
- dati EcoGDR non necessari.

---

# 8. Lifecycle Discord

## ACT-LIFE-001 — Master Activity chiusa

Se il master chiude soltanto la Activity:

- desktop resta host;
- altri giocatori restano connessi;
- sessione continua normalmente.

## ACT-LIFE-002 — Tutti lasciano l'istanza

Se l'istanza Discord termina/non è più valida:

- il binding `instanceId ↔ liveSessionId` viene invalidato quando il backend può determinarlo;
- la live session resta aperta sul desktop;
- browser standalone già autenticati continuano;
- una nuova Activity instance richiede nuovo pairing.

## ACT-LIFE-003 — Host desktop disconnesso

La Activity segue esattamente `LIVE-HOST-*`:

- mostra ultimo stato pubblico;
- segnala reconnect master;
- mutazioni condivise congelate;
- 10 minuti di grazia;
- timeout → session ended.

## ACT-LIFE-004 — Sessione terminata

Dopo `session.ended` la Activity mostra uno stato finale semplice e non tenta di creare autonomamente una nuova sessione.

---

# 9. Board switching

## ACT-BOARD-001 — Una board alla volta

La Activity mostra soltanto la board correntemente pubblicata dalla live session.

## ACT-BOARD-002 — Cambio scena

Durante switch:

```text
board A
→ breve stato Cambio scena…
→ snapshot board B
```

La Activity non conserva accesso navigabile alle board precedenti.

## ACT-BOARD-003 — Stato al ritorno

Se il master torna a una board già usata, la Activity riceve lo stato live preservato della sessione, non ricostruisce autonomamente la board preparata.

---

# 10. Protocollo e networking

## ACT-NET-001 — Stesso protocollo V0.3

Dopo authentication/join la Activity parla lo stesso `packages/protocol` del browser standalone.

Non esistono eventi `discordToken.move` o formati board Discord-specifici.

## ACT-NET-002 — Snapshot + eventi

Reconnect, resync, token move, ping, board switch e session end seguono `PROTOCOL_SPEC.md`.

## ACT-NET-003 — Discord è adapter

Forma:

```text
Live Session / Protocol
        ↑
Player Web Client
        ↑
Discord Adapter
        ↑
Embedded App SDK
```

---

# 11. Browser standalone resta supportato

## ACT-WEB-001 — Nessuna regressione standalone

L'aggiunta di Discord non può rendere il browser standalone dipendente dall'Embedded App SDK.

## ACT-WEB-002 — Join code separato

Standalone usa il codice V0.3 `ABCD-EFGH`.

Discord usa join nativo dell'Activity dopo pairing.

I due sistemi convergono nello stesso `participantId`/protocol model ma non vengono fusi nella UX.

---

# 12. Non-obiettivi V0.4

Non sono richiesti:

- co-DM;
- handoff host;
- bot Discord obbligatorio;
- comandi slash per usare la board;
- chat duplicata;
- voice/video custom;
- vault Discord;
- character manager completo;
- account EcoGDR;
- due protocolli distinti web/Discord.

---

# 13. Criteri di accettazione

La V0.4 è corretta se almeno:

1. il master abbina una Activity instance con un pairing code una sola volta;
2. un code consumato/scaduto non è riutilizzabile;
3. due giocatori nella stessa istanza associata raggiungono la stessa live session;
4. nessun giocatore inserisce un codice nel flusso Discord normale;
5. un'istanza non associata riceve zero stato campagna;
6. stesso Discord user che rientra recupera lo stesso participant runtime quando valido;
7. token non assegnato resta non controllabile anche con client modificato;
8. board switch mostra snapshot coerente e non espone la board precedente;
9. chiudere la Activity del master non termina la sessione;
10. host desktop disconnect applica i 10 minuti di grace/freeze;
11. nuova istanza Discord dopo fine della precedente richiede nuovo pairing;
12. il browser standalone continua a superare tutti i gate V0.3.

---

## Regola finale

Discord deve togliere passaggi al giocatore, non aggiungerli:

```text
Unisciti all'attività
→ sei al tavolo
```

Tutta la complessità di pairing, identity e autorizzazione resta sotto questa esperienza.