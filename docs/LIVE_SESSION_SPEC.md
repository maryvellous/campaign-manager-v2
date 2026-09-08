# Campaign Manager v2 — Live Session Specification

## 1. Scopo e stato

Questo documento definisce il contratto di prodotto e comportamento della **V0.3 — Sessione live web**.

La V0.3 deve funzionare interamente con il client web standalone. La Discord Activity V0.4 riusa lo stesso dominio di sessione, lo stesso relay e lo stesso protocollo aggiungendo Discord come adapter di ingresso e identità.

I requisiti con prefisso `LIVE-*` sono vincolanti. `docs/BOARD_SPEC.md` resta autorità sul comportamento della board; `docs/PROTOCOL_SPEC.md` è autorità sul trasporto e sui messaggi realtime.

Principio:

> la campagna resta locale; il relay conserva soltanto lo stato temporaneo necessario a far vivere la sessione.

---

# 2. Modello di autorità

## LIVE-AUTH-001 — Tre livelli distinti

Durante una sessione esistono tre autorità diverse:

1. **filesystem locale del DM** — autorevole per campagna, note, board preparate e asset originali;
2. **desktop DM** — autorevole per ciò che viene pubblicato, per i permessi e per le intenzioni del master;
3. **relay/session backend** — autorevole per membership, ordering e stato runtime già accettato della sessione.

Il relay non diventa il database della campagna e il desktop non può fidarsi delle dichiarazioni provenienti dai client giocatore.

## LIVE-AUTH-002 — Client giocatore non trusted

Browser standalone e Discord Activity sono client non autorevoli.

Possono richiedere azioni consentite, ma il relay/session authority valida sempre:

- sessione;
- identità runtime;
- stato della sessione;
- permesso sul token;
- validità del payload.

## LIVE-AUTH-003 — Un solo host DM

V0.3 ha un solo host autorevole: il Campaign Manager Desktop che ha creato la sessione.

Non sono requisiti V0.3:

- co-DM;
- passaggio di ownership;
- host dal browser;
- sessione che continua autonomamente dopo la chiusura volontaria del desktop.

---

# 3. Identità, codici e credenziali

## LIVE-ID-001 — `liveSessionId`

Ogni sessione ha un `liveSessionId` opaco, casuale e non prevedibile, con almeno 128 bit di entropia.

Non viene mostrato come codice da digitare e non contiene `CampaignId`, nome campagna, timestamp leggibile o altre informazioni semantiche.

## LIVE-ID-002 — Credenziale host

Alla creazione della sessione il backend rilascia al desktop una credenziale host/resume ad alta entropia, distinta dal `liveSessionId`.

La credenziale:

- non viene inviata ai giocatori;
- non viene scritta nei file della campagna;
- può essere conservata temporaneamente nell'AppData locale per consentire reconnect dopo crash/disconnessione;
- viene invalidata alla chiusura definitiva della sessione.

## LIVE-CODE-001 — Session join code standalone

Il client web standalone usa un codice leggibile dall'utente.

Formato V0.3:

```text
ABCD-EFGH
```

Regole:

- 8 caratteri utili, separatore visuale escluso;
- alfabeto maiuscolo non ambiguo, evitando caratteri facilmente confondibili;
- generazione crittograficamente casuale;
- valido soltanto per la sessione corrente;
- può essere ruotato dal DM in qualsiasi momento;
- il vecchio codice smette immediatamente di accettare nuovi ingressi;
- i partecipanti già autenticati non vengono espulsi dalla rotazione.

Il codice è un meccanismo di ingresso, non l'identità interna della sessione.

## LIVE-CODE-002 — Pairing code Discord

Il pairing desktop ↔ Discord Activity usa un codice distinto:

```text
ABC-DEF
```

Regole:

- 6 caratteri utili;
- casuale e non prevedibile;
- monouso;
- scadenza: 10 minuti;
- consumato immediatamente dopo pairing riuscito;
- può essere rigenerato se scade;
- invalidato alla chiusura della sessione.

Non viene usato dai giocatori per entrare nella sessione.

## LIVE-ID-003 — ParticipantId

Ogni partecipante riceve un `participantId` runtime opaco e stabile per la durata della sessione.

Il `participantId` non coincide con il nome visualizzato e non deve essere ricavato dal nome.

## LIVE-ID-004 — Resume del partecipante

Dopo il primo ingresso un client riceve una credenziale di resume ad alta entropia valida soltanto per quella sessione.

Un reconnect con credenziale valida ripristina lo stesso `participantId`, le assegnazioni token e lo stato di presenza.

La credenziale viene invalidata quando:

- il DM rimuove il partecipante;
- la sessione termina;
- il backend la revoca per ragioni di sicurezza.

---

# 4. Lifecycle della sessione

## LIVE-LIFE-001 — Una sessione attiva per desktop

V0.3 permette al Campaign Manager Desktop di avere **una sola live session attiva alla volta**.

Tentare di avviarne una seconda porta alla sessione esistente invece di crearne una concorrente.

## LIVE-LIFE-002 — Avvio senza wizard

Il flusso normale è:

```text
DM → Avvia sessione
→ backend crea liveSessionId + credenziale host
→ genera session join code
→ genera pairing code Discord
→ sessione aperta
→ giocatori vedono waiting state finché non viene pubblicata una board
```

Non è richiesto un wizard di configurazione.

Il titolo mostrato ai giocatori usa per default il nome della campagna; il DM può impostare un titolo sessione opzionale senza rinominare la campagna.

## LIVE-LIFE-003 — Stati principali

Lo stato osservabile della sessione distingue almeno:

- `open` — host online, sessione utilizzabile;
- `host_reconnecting` — connessione host persa entro la finestra di grazia;
- `ending` — chiusura in corso;
- `ended` — sessione terminata e non riapribile.

La presentazione del giocatore è separata:

- `waiting` — nessuna board attualmente pubblicata;
- `board` — una board è attualmente pubblicata.

## LIVE-LIFE-004 — Blocca nuovi ingressi

Il DM dispone di un controllo `Accetta nuovi giocatori`.

Default: attivo.

Quando disattivato:

- nuovi join standalone vengono rifiutati con stato chiaro;
- nuovi ingressi Discord non ottengono accesso alla sessione applicativa;
- i partecipanti già autenticati e i loro reconnect continuano a funzionare.

## LIVE-LIFE-005 — Rotazione del join code

Il DM può generare un nuovo session join code senza interrompere la sessione.

L'azione è utile se il codice è stato condiviso accidentalmente.

---

# 5. Ingresso standalone

## LIVE-JOIN-001 — Flusso minimo

Il browser standalone segue:

```text
apri client web
→ inserisci session join code
→ inserisci/scegli nome visualizzato
→ entra
```

Non è richiesto un account Campaign Manager o EcoGDR.

## LIVE-JOIN-002 — Nome visualizzato

Il nome standalone:

- viene trim-mato;
- deve contenere almeno un carattere visibile;
- ha lunghezza massima ragionevole definita dal protocollo/UI;
- non è una credenziale;
- può essere modificato dal partecipante durante la sessione.

Nomi duplicati sono consentiti perché l'identità reale è `participantId`; il desktop deve disambiguarli visivamente quando necessario.

## LIVE-JOIN-003 — Ingresso automatico con codice valido

V0.3 non richiede approvazione manuale uno-per-uno.

Un codice valido e ingressi non bloccati portano direttamente nella sessione pubblica.

Il DM riceve feedback non invasivo quando entra un nuovo partecipante e può rimuoverlo successivamente.

## LIVE-JOIN-004 — Rimozione partecipante

Il DM può usare `Rimuovi dalla sessione`.

L'azione:

- chiude l'accesso runtime del partecipante;
- invalida la sua credenziale di resume;
- rimuove le sue assegnazioni token;
- non modifica board o file della campagna.

Nel client standalone una persona rimossa potrebbe tentare un nuovo ingresso usando ancora un join code valido; se serve impedirlo, il DM blocca nuovi ingressi o ruota il codice.

---

# 6. Ingresso Discord V0.4 sopra V0.3

## LIVE-DISCORD-001 — Binding dell'istanza

Dopo pairing riuscito il relay conserva:

```text
Discord instanceId ↔ liveSessionId
```

Il binding è runtime e non viene scritto in `campaign.json` o nella board.

## LIVE-DISCORD-002 — Identità Discord

All'interno di un'istanza associata, l'adapter Discord mappa l'utente Discord verificato a un `participantId` della live session.

Lo stesso utente che lascia e rientra nella stessa sessione recupera la stessa identità runtime quando possibile.

## LIVE-DISCORD-003 — Chiusura dell'Activity del master

Dopo il pairing, l'Activity aperta dal master non è l'host autorevole.

Chiuderla non termina la sessione finché il Campaign Manager Desktop resta connesso.

## LIVE-DISCORD-004 — Fine dell'istanza Discord

Se l'istanza Discord cessa di essere valida o tutti la abbandonano:

- il binding Discord può essere invalidato;
- la live session desktop resta aperta;
- il client standalone continua a funzionare;
- una nuova istanza Discord richiede un nuovo pairing code.

---

# 7. Partecipanti, presenza e permessi

## LIVE-PART-001 — Stato presenza

Il desktop mostra almeno per ogni partecipante:

- nome visualizzato;
- sorgente `web` o `discord`;
- `connected` / `disconnected`;
- token controllabili;
- azione per rimuoverlo.

Non è richiesta una dashboard amministrativa complessa.

## LIVE-PART-002 — Permessi V0.3

Un giocatore può soltanto:

- vedere stato pubblico corrente;
- pan/zoom locale;
- creare ping;
- muovere token assegnati;
- usare azioni di visualizzazione esplicitamente offerte dal client, come aprire un'immagine pubblica in grande.

Non può:

- creare/modificare/eliminare elementi persistenti;
- cambiare board;
- reveal/hide;
- assegnare token;
- invitare o rimuovere altri partecipanti;
- accedere a note private, vault, filesystem o impostazioni DM.

## LIVE-PART-003 — Assegnazione token

L'assegnazione è runtime.

Regole:

- un partecipante può controllare più token;
- un token può essere controllato da più partecipanti;
- il DM può sempre muovere qualunque token;
- le assegnazioni non vengono scritte nel file `*.board.json`;
- togliere l'assegnazione ha effetto immediato;
- nascondere un token ai giocatori sospende di fatto il suo controllo remoto perché il client non riceve più il token.

---

# 8. Board e scene nella sessione

## LIVE-BOARD-001 — Una board visibile alla volta

Una live session può usare più board, ma i giocatori vedono una sola board alla volta.

## LIVE-BOARD-002 — Prima pubblicazione di una board

La prima volta che una board viene pubblicata nella sessione:

1. il desktop legge la board preparata;
2. crea uno stato live specifico per quella sessione/board;
3. include inizialmente soltanto elementi `visibleByDefault`;
4. prepara/pubblica gli asset necessari;
5. il relay rende il nuovo stato corrente;
6. i client ricevono lo snapshot pubblico.

La pubblicazione non invia gli elementi privati.

## LIVE-BOARD-003 — Stato live per board preservato nella sessione

Se il DM passa da Board A a Board B e poi torna ad A, la sessione ripristina lo **stato live di A** già maturato nella stessa sessione:

- posizioni live dei token;
- reveal/hide correnti;
- stato pubblico corrente degli elementi.

Non ricrea automaticamente A dalla versione preparata a ogni ritorno.

## LIVE-BOARD-004 — Reset esplicito

Il DM dispone di `Reimposta live da board preparata`.

L'azione:

- ricostruisce lo stato live della board dalla versione persistente corrente;
- scarta reveal/hide e posizioni live specifiche di quella board nella sessione;
- richiede conferma se comporta perdita evidente di stato live.

## LIVE-BOARD-005 — Cambio board atomico

Il cambio della board corrente non avviene elemento per elemento davanti ai giocatori.

Il client mostra un breve stato `Cambio scena…`/loading e poi applica uno snapshot coerente della nuova board.

La board precedente smette di essere accessibile dal client giocatore salvo futura feature esplicita.

## LIVE-BOARD-006 — Torna in attesa

Il DM può `Smetti di condividere` senza terminare la sessione.

I giocatori tornano al waiting state; lo stato live della board viene conservato per un eventuale ritorno nella stessa sessione.

## LIVE-BOARD-007 — Edit mentre la board è live

Le regole di `BOARD_SPEC.md` restano valide:

- edit persistente di un elemento pubblico confermato dal desktop → aggiornamento della proiezione live;
- edit di un elemento privato → resta privato;
- nuovo elemento → salvato nella board preparata ma nasce privato;
- movimento token live → modifica la posizione runtime, non automaticamente quella preparata.

---

# 9. Pubblicazione asset

## LIVE-ASSET-001 — Upload solo quando serve

Un asset della campagna non viene caricato sullo storage live soltanto perché esiste nella board.

Viene pubblicato quando un elemento che lo usa deve diventare visibile ai giocatori.

## LIVE-ASSET-002 — Pubblicazione atomica

Per un elemento che richiede un asset:

```text
prepara/upload asset
→ conferma disponibilità live
→ pubblica/reveal elemento
```

Se l'upload fallisce, il reveal non viene presentato come riuscito e i giocatori non ricevono un elemento rotto come se fosse stato pubblicato correttamente.

## LIVE-ASSET-003 — Deduplicazione

La stessa risorsa già pubblicata nella sessione può essere riutilizzata senza nuovo upload, preferibilmente mediante fingerprint del contenuto.

## LIVE-ASSET-004 — Accesso temporaneo

Gli asset live sono riferiti tramite `publishedAssetId` e accesso temporaneo autorizzato.

Le credenziali R2 non raggiungono mai desktop renderer non necessario o client giocatore.

## LIVE-ASSET-005 — Retention

Gli asset pubblicati sono temporanei rispetto alla sessione.

Dopo la fine della sessione il backend deve poterli eliminare automaticamente; target V0.3: cleanup entro 24 ore dalla chiusura.

Il file originale nella campagna non viene toccato.

---

# 10. Movimento token e ping

## LIVE-ACT-001 — Movimento autorizzato

Il client può inviare una richiesta di movimento soltanto per un token ricevuto come controllabile.

Il server valida comunque il permesso.

## LIVE-ACT-002 — Drag fluido ma stato finale autorevole

Durante un drag possono essere trasmessi aggiornamenti intermedi coalescibili per fluidità.

L'evento finale di rilascio è il commit della posizione live.

Se un aggiornamento viene rifiutato o la connessione fallisce, il client converge all'ultima posizione confermata dall'autorità di sessione.

## LIVE-ACT-003 — Concorrenza

Se più controller muovono lo stesso token, vale l'ordine accettato dal relay/session authority.

Nessun client conserva una propria posizione divergente come fonte autorevole.

## LIVE-ACT-004 — Ping

Il ping è effimero:

- visibile ai partecipanti sulla board corrente;
- non persiste nella board o nello snapshot durable;
- durata visuale target: circa 3 secondi;
- può essere rate-limited;
- non esiste quando la sessione è in waiting state senza board.

---

# 11. Reconnect dei giocatori

## LIVE-REC-001 — Participant resume

La perdita del WebSocket non elimina immediatamente il partecipante.

Il desktop lo mostra come `disconnected` mantenendo identità e assegnazioni.

## LIVE-REC-002 — Snapshot, non replay obbligatorio

Al reconnect il client autenticato riceve lo snapshot pubblico **corrente** e il proprio set corrente di permessi/token.

Non deve ricostruire la sessione riproducendo tutta la cronologia degli eventi persi.

## LIVE-REC-003 — Rejoin senza duplicato

Una credenziale di resume valida riattiva il `participantId` esistente invece di creare `Mary (2)` come nuovo partecipante.

---

# 12. Disconnessione del master

## LIVE-HOST-001 — Stato `host_reconnecting`

Se il WebSocket del desktop host cade senza una chiusura volontaria, la sessione entra immediatamente in `host_reconnecting`.

I giocatori mantengono visibile l'ultimo snapshot pubblico ma vedono un'indicazione discreta che il master si sta riconnettendo.

## LIVE-HOST-002 — Sessione congelata

Durante `host_reconnecting`:

- pan/zoom locali continuano;
- nessun nuovo join viene accettato;
- token move, ping e altre mutazioni condivise vengono sospesi/rifiutati;
- lo stato pubblico corrente non viene modificato.

Questo evita che la sessione continui a evolvere senza il suo unico host autorevole.

## LIVE-HOST-003 — Finestra di grazia

Il desktop ha **10 minuti** per riconnettersi usando la propria credenziale host.

Se riesce:

- il backend restituisce lo stato live corrente;
- il desktop riprende la sessione senza ricrearla;
- i giocatori tornano allo stato normale;
- i codici e le assegnazioni restano validi salvo esplicita revoca.

## LIVE-HOST-004 — Timeout host

Se il master non torna entro 10 minuti:

- la sessione termina con motivo `host_timeout`;
- i client vedono `Sessione terminata`;
- nessuno stato live viene scritto automaticamente nelle board preparate;
- credenziali, codici e binding vengono invalidati.

---

# 13. Chiusura volontaria e chiusura app

## LIVE-END-001 — Fine esplicita

Il desktop offre `Termina sessione`.

Prima di terminare definitivamente applica il flusso di salvataggio finale delle posizioni token definito in `BOARD_SPEC.md`.

## LIVE-END-002 — Più board modificate

Se durante la sessione sono state usate più board con token in posizioni finali diverse da quelle preparate, il dialogo finale elenca soltanto le board con differenze rilevanti.

Per ciascuna board il DM può scegliere se applicare le posizioni finali dei token.

Il dialogo offre almeno:

- `Termina e salva le selezionate`;
- `Termina senza salvare posizioni`;
- `Annulla`.

Reveal/hide, ping, presenza, assegnazioni e camera non vengono applicati automaticamente.

## LIVE-END-003 — Chiusura dell'app con sessione attiva

Chiudere volontariamente il Campaign Manager mentre una live session è aperta richiede una scelta esplicita.

Default:

```text
Una sessione live è ancora attiva.
[Termina sessione e chiudi] [Annulla]
```

V0.3 non mantiene la sessione attiva in background dopo la chiusura volontaria del desktop.

## LIVE-END-004 — Invalidazione

Alla fine definitiva:

- join code invalidato;
- pairing code invalidato;
- credenziale host invalidata;
- credenziali participant/resume invalidate;
- binding Discord invalidati;
- nuovi WebSocket rifiutati;
- client connessi ricevono `session.ended` prima della chiusura quando possibile.

## LIVE-END-005 — Nessuna session history cloud

V0.3 non introduce una cronologia cloud delle sessioni.

Dopo il periodo tecnico necessario a cleanup/retry, lo stato runtime può essere eliminato dal relay.

---

# 14. Pannello live del DM

## LIVE-UX-001 — Pannello compatto

La gestione live deve essere accessibile senza trasformare il Campaign Manager in una console amministrativa.

Il pannello mostra almeno:

- stato sessione;
- session join code + `Copia`;
- pairing code Discord + scadenza/rigenera;
- `Accetta nuovi giocatori`;
- partecipanti e stato connessione;
- assegnazioni token;
- board attualmente condivisa;
- `Smetti di condividere` / cambio board;
- `Porta tutti qui`;
- `Termina sessione`.

## LIVE-UX-002 — Feedback ingresso

Un nuovo ingresso produce feedback leggero al DM, ad esempio toast + comparsa nella lista partecipanti.

Non interrompe la sessione con un modal.

## LIVE-UX-003 — Errori non ambigui

Il desktop distingue almeno:

- relay non raggiungibile;
- sessione scaduta/terminata;
- host non autorizzato;
- pubblicazione asset fallita;
- comando rifiutato;
- participant disconnected;
- reconnect in corso.

---

# 15. Limiti deliberati V0.3

Non sono parte della prima live session:

- co-DM/handoff;
- account giocatore obbligatori;
- chat testuale;
- voice/video;
- dadi;
- iniziativa;
- fog of war avanzato;
- registrazione della sessione;
- replay eventi;
- editing collaborativo della board;
- pubblicazione del vault;
- sync EcoGDR;
- sessione che resta attiva senza desktop host.

---

# 16. Target di validazione

## LIVE-QA-001 — Concorrenza minima

La V0.3 deve essere validata con almeno:

- 1 desktop host;
- 8 client giocatore simultanei;
- più token controllabili;
- reconnect di almeno 2 client;
- switch tra almeno 3 board nella stessa sessione.

Otto client sono un **dataset minimo di test**, non un hard cap di prodotto.

## LIVE-QA-002 — Scenari end-to-end

Devono passare almeno:

1. start session → join web → waiting;
2. publish board → snapshot corretto;
3. elemento privato non presente nel payload giocatore;
4. reveal con asset → upload prima del reveal;
5. token autorizzato mosso e sincronizzato;
6. token non autorizzato rifiutato;
7. participant reconnect → stessa identità;
8. switch A → B → A → stato live A preservato;
9. unpublish → waiting → republish;
10. join code ruotato → vecchio codice rifiutato;
11. host disconnect → freeze → reconnect entro 10 minuti;
12. host timeout → session end senza scrivere la board;
13. fine volontaria → scelta posizioni finali;
14. client lento/perdita evento → resync tramite snapshot;
15. sessione terminata → tutte le credenziali non più valide.

---

## Regola finale

Una live session deve sembrare al DM una semplice estensione della board:

```text
Avvia sessione
→ fai entrare i giocatori
→ condividi ciò che vuoi
→ gioca
→ termina
```

La complessità di rete, autenticazione, ordering e recovery deve esistere sotto questa esperienza, non trasformarsi in lavoro amministrativo per l'utente.