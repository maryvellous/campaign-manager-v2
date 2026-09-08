# Campaign Manager v2 — Live Session Specification

## 1. Scopo

Questo documento definisce la **V0.3 — Sessione live web standalone**.

La V0.3 deve funzionare senza Discord. La Discord Activity entra soltanto in V0.4 e riusa il modello live già funzionante.

Prefisso requisiti: `LIVE-*`.

Principio:

> la campagna resta locale; il relay conserva soltanto lo stato temporaneo necessario alla sessione.

---

# 2. Autorità

## LIVE-AUTH-001 — Ruoli distinti

- filesystem del DM: autorevole per campagna, board preparate e asset originali;
- desktop DM: decide cosa pubblicare e quali permessi assegnare;
- relay/session backend: autorevole per membership, ordering e stato runtime già accettato;
- client giocatore: non autorevole.

Il relay non diventa un database della campagna.

## LIVE-AUTH-002 — Un solo host

V0.3 ha un solo host: il Campaign Manager Desktop che avvia la sessione.

Fuori scope:

- co-DM;
- handoff host;
- host browser;
- sessione autonoma senza desktop.

---

# 3. Identità e ingresso standalone

## LIVE-ID-001 — Sessione interna

Ogni sessione ha un `liveSessionId` opaco e non prevedibile. Non viene usato come codice da digitare.

Il desktop riceve una credenziale host/resume separata, non salvata nella campagna.

## LIVE-CODE-001 — Join code web

Il browser standalone usa un codice breve e leggibile, per esempio:

```text
ABCD-EFGH
```

Il codice:

- vale soltanto per la sessione corrente;
- può essere ruotato dal DM;
- smette di accettare nuovi ingressi quando ruotato;
- non espelle partecipanti già autenticati.

Il formato esatto può cambiare senza cambiare il prodotto, purché resti breve, non ambiguo e sufficientemente difficile da indovinare.

## LIVE-ID-002 — Participant identity

Ogni giocatore riceve un `participantId` runtime distinto dal nome visualizzato.

Dopo il primo ingresso riceve una credenziale di resume valida per quella sessione. Un reconnect valido recupera lo stesso partecipante e i suoi permessi.

## LIVE-JOIN-001 — Flusso web

```text
apri client web
→ inserisci join code
→ inserisci nome visualizzato
→ entra
```

Nessun account Campaign Manager/EcoGDR è richiesto.

Nomi duplicati sono ammessi; l'identità reale resta `participantId`.

## LIVE-JOIN-002 — Nessuna approvazione individuale obbligatoria

Con codice valido e ingressi aperti, il giocatore entra direttamente.

Il DM vede l'ingresso e può rimuovere il partecipante.

## LIVE-JOIN-003 — Blocca nuovi ingressi

`Accetta nuovi giocatori` è attivo per default.

Se disattivato:

- nuovi join vengono rifiutati;
- partecipanti già autenticati e reconnect validi continuano a funzionare.

---

# 4. Lifecycle

## LIVE-LIFE-001 — Una sessione attiva per desktop

Un desktop può avere una sola live session attiva alla volta.

## LIVE-LIFE-002 — Avvio semplice

```text
Avvia sessione
→ crea sessione + join code
→ waiting state
```

Nessun pairing Discord viene creato in V0.3.

Il pairing è responsabilità esclusiva della V0.4 e di `DISCORD_ACTIVITY_SPEC.md`.

## LIVE-LIFE-003 — Stati minimi

Sessione:

- `open`;
- `host_reconnecting`;
- `ending`;
- `ended`.

Vista giocatore:

- `waiting` — nessuna board condivisa;
- `board` — una board è condivisa.

---

# 5. Partecipanti e token

## LIVE-PART-001 — Pannello DM compatto

Per ogni partecipante il desktop mostra almeno:

- nome;
- connected/disconnected;
- token assegnati;
- azione `Rimuovi`.

Nessuna dashboard amministrativa complessa.

## LIVE-PART-002 — Capacità giocatore

Un giocatore può:

- vedere stato pubblico;
- pan/zoom;
- fare ping;
- muovere i token assegnati;
- aprire contenuti pubblici quando previsto.

Non può modificare board, reveal/hide, cambiare scena, assegnare token o accedere al vault.

## LIVE-PART-003 — Ownership semplice dei token

Regole V0.3:

- un partecipante può controllare più token;
- **un token può avere al massimo un partecipante-controller alla volta**;
- il DM può sempre muovere qualunque token;
- l'assegnazione è stato runtime e non viene salvata nel file board;
- riassegnare un token sostituisce il controller precedente;
- token nascosto/non pubblicato non è controllabile dal giocatore.

Questa scelta evita concorrenza multi-player sullo stesso token nella prima versione.

---

# 6. Board nella sessione

## LIVE-BOARD-001 — Una board visibile alla volta

Una sessione può usare più board, ma i giocatori ne vedono una sola alla volta.

## LIVE-BOARD-002 — Prima pubblicazione

Quando una board viene pubblicata per la prima volta nella sessione:

1. il desktop legge la board preparata;
2. crea lo stato live della board;
3. include soltanto gli elementi pubblicabili/visibili;
4. prepara gli asset necessari;
5. rende disponibile uno snapshot coerente ai giocatori.

Elementi privati non vengono inviati.

## LIVE-BOARD-003 — Stato live preservato

A → B → A ripristina lo stato live già maturato di A nella stessa sessione, inclusi reveal/hide e posizioni token.

## LIVE-BOARD-004 — Reset esplicito

`Reimposta live da board preparata` ricostruisce la board live dalla versione persistente e scarta lo stato runtime specifico della board, previa conferma quando necessario.

## LIVE-BOARD-005 — Cambio scena atomico

Durante uno switch il client mostra un breve stato di cambio scena e applica poi uno snapshot coerente della nuova board.

## LIVE-BOARD-006 — Torna in attesa

`Smetti di condividere` torna al waiting state senza terminare la sessione e senza perdere lo stato live delle board già usate.

---

# 7. Asset live

## LIVE-ASSET-001 — Solo quando servono

Un asset viene pubblicato nello storage live soltanto quando un contenuto che lo usa deve essere mostrato ai giocatori.

## LIVE-ASSET-002 — Reveal dopo disponibilità

```text
upload/preparazione asset
→ conferma disponibilità
→ reveal/pubblicazione elemento
```

Se l'asset non è disponibile, il reveal non viene dichiarato riuscito.

## LIVE-ASSET-003 — Temporanei

Gli asset live sono copie temporanee. Il backend li elimina dopo la sessione secondo una policy operativa ragionevole.

Non è un requisito di prodotto fissare oggi un numero preciso di ore.

## LIVE-ASSET-004 — Deduplicazione non obbligatoria

Riutilizzare un asset già caricato è un'ottimizzazione consentita, non un requisito V0.3.

Il comportamento corretto viene prima della deduplicazione.

---

# 8. Movimento e ping

## LIVE-ACT-001 — Movimento autorizzato

Il client richiede il movimento; il backend verifica sempre che il partecipante sia il controller corrente del token.

## LIVE-ACT-002 — Drag fluido, commit finale

Gli aggiornamenti intermedi del drag possono essere effimeri/coalesced.

Il rilascio produce la posizione live definitiva accettata dall'autorità di sessione.

Se il comando viene rifiutato o la connessione cade, il client converge alla posizione autorevole corrente.

## LIVE-ACT-003 — Ping

Il ping:

- è effimero;
- non viene salvato;
- esiste solo con una board condivisa;
- può essere rate-limited per evitare spam.

Durata visiva e soglie precise sono dettagli UI/operativi da tarare.

---

# 9. Reconnect

## LIVE-REC-001 — Giocatore

La perdita della connessione non elimina immediatamente il partecipante.

Un resume valido ripristina lo stesso `participantId` e riceve uno snapshot pubblico corrente.

Non è richiesto replay completo degli eventi persi.

## LIVE-HOST-001 — Master disconnesso

Se l'host perde la connessione senza terminare volontariamente:

- sessione → `host_reconnecting`;
- ultimo stato pubblico resta visibile;
- pan/zoom locali continuano;
- nuove mutazioni condivise e nuovi join vengono sospesi.

## LIVE-HOST-002 — Finestra di grazia

La finestra iniziale è **10 minuti**.

Se il desktop torna con credenziale valida, riprende la stessa sessione.

Se scade, la sessione termina con `host_timeout` senza scrivere automaticamente lo stato live nelle board locali.

---

# 10. Fine sessione

## LIVE-END-001 — Fine esplicita

`Termina sessione` chiude definitivamente la sessione.

Prima della chiusura applica il flusso definito in `BOARD_SPEC.md` per decidere se copiare nella board preparata le posizioni finali dei token.

## LIVE-END-002 — Chiusura app

Con sessione attiva, chiudere volontariamente il desktop richiede:

```text
[Termina sessione e chiudi] [Annulla]
```

V0.3 non mantiene una sessione live in background dopo la chiusura volontaria dell'app.

## LIVE-END-003 — Invalidazione

A sessione terminata:

- join code non è più valido;
- credenziali host/participant non sono più valide;
- nuove connessioni vengono rifiutate;
- lo stato runtime può essere eliminato dopo il cleanup tecnico necessario.

V0.3 non conserva una cronologia cloud della sessione.

---

# 11. Pannello live del DM

Contiene almeno:

- stato sessione;
- join code + Copia;
- `Accetta nuovi giocatori`;
- partecipanti;
- token assegnati;
- board condivisa;
- cambio board / `Smetti di condividere`;
- `Porta tutti qui`;
- `Termina sessione`.

**Non contiene controlli Discord in V0.3.**

---

# 12. Errori osservabili

Il prodotto distingue almeno:

- relay non raggiungibile;
- sessione terminata/non trovata;
- host non autorizzato;
- join bloccato/codice non valido;
- asset non pubblicabile;
- comando non consentito;
- reconnect in corso.

Gli errori di rete non devono compromettere i dati locali della campagna.

---

# 13. Non-obiettivi V0.3

- Discord pairing/identity;
- co-DM/handoff;
- account giocatore obbligatori;
- chat;
- voice/video;
- dadi/initiative/fog avanzato;
- replay/registrazione sessione;
- editing collaborativo;
- sync EcoGDR;
- sessione autonoma senza desktop.

---

# 14. Validazione minima

Testare almeno:

- 1 host + 8 player come fixture di carico, non hard cap;
- join e rimozione;
- blocco nuovi ingressi;
- publish/unpublish/switch di più board;
- elemento privato assente dal payload player;
- movimento token autorizzato/non autorizzato;
- riassegnazione token da un giocatore a un altro;
- reconnect player tramite snapshot;
- host disconnect/freeze/reconnect/timeout;
- fine sessione e scelta posizioni token.

---

## Regola finale

La live session deve sembrare:

```text
Avvia sessione
→ fai entrare i giocatori
→ condividi la board
→ gioca
→ termina
```

La rete serve questa esperienza; non la trasforma in amministrazione.