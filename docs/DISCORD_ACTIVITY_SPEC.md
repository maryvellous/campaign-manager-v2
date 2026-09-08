# Campaign Manager v2 — Discord Activity Specification

## 1. Scopo

La **V0.4 — Discord Activity** riusa player client, live session e protocollo della V0.3 e aggiunge Discord come adapter di ingresso e identità.

Prefisso requisiti: `ACT-*`.

Principio:

> Discord deve togliere passaggi al giocatore, non aggiungerli.

---

# 2. Ruolo

La Activity è **il lato del tavolo visto dal giocatore**, non un mini Campaign Manager.

Non offre vault, note private, editor, ricerca campagna, graph privato, IA o amministrazione DM.

Quando nessuna board è pubblicata mostra un waiting state semplice. Quando una board è pubblicata, quella è la superficie principale.

Il giocatore può:

- pan/zoom;
- vedere contenuti pubblici;
- ping;
- muovere il token assegnato;
- ricevere `Porta tutti qui`;
- aprire/ingrandire contenuti pubblici quando previsto.

---

# 3. Join nativo Discord

## ACT-JOIN-001 — Nessun codice giocatore

Nel flusso Discord normale il giocatore fa **Unisciti all'attività** e non inserisce il join code web V0.3.

## ACT-JOIN-002 — Activity instance

La sessione Discord usa la specifica `instanceId` dell'Activity, non il canale vocale come identificatore Campaign Manager.

Una istanza non associata non riceve dati della campagna.

---

# 4. Pairing — responsabilità V0.4

## ACT-PAIR-001 — Pairing master-only

Il pairing **non esiste nella V0.3 standalone**.

Quando il master vuole usare Discord con una live session già attiva:

```text
Desktop → Collega Discord
→ genera pairing code breve monouso
→ master apre la Activity
→ inserisce il pairing code
→ backend verifica
→ instanceId ↔ liveSessionId
```

Il codice:

- è usato soltanto dal master;
- è breve, casuale e non prevedibile;
- è monouso;
- ha scadenza breve;
- può essere rigenerato;
- viene invalidato alla fine della sessione.

Formato e durata esatti sono dettagli operativi V0.4 da validare con l'API Discord reale; non sono requisiti della V0.3.

## ACT-PAIR-002 — Desktop resta host

Dopo il pairing il Campaign Manager Desktop resta l'unico host autorevole.

Chiudere la Activity del master non termina la sessione se il desktop è ancora online.

---

# 5. Identità

L'adapter/backend usa il flusso Discord ufficiale disponibile al momento dell'implementazione per verificare user identity e Activity instance.

Il client non può dichiarare arbitrariamente il proprio Discord user ID.

Un utente Discord verificato viene mappato a un `participantId` runtime della live session.

Display name/avatar Discord sono presentazione; non determinano permessi.

---

# 6. Permessi

Essere presenti nell'Activity non concede autorità.

Il backend valida sessione, identity e capacità richiesta.

La regola token è la stessa della V0.3:

- un giocatore può controllare più token;
- un token ha al massimo un controller giocatore alla volta;
- il DM controlla sempre tutto.

L'Activity riceve soltanto snapshot/eventi pubblici e mai board privata, path locali, API key, host credentials o asset non pubblicati.

---

# 7. Lifecycle

- Activity del master chiusa → sessione continua se desktop online;
- istanza Discord terminata → binding può essere invalidato, live session desktop resta attiva;
- nuova istanza → nuovo pairing;
- desktop host disconnesso → si applica `LIVE-HOST-*`;
- sessione terminata → Activity mostra stato finale e non crea sessioni autonome.

---

# 8. Board e networking

La Activity usa lo stesso protocollo player del browser standalone.

Non esistono eventi o formati board Discord-specifici.

Cambio scena, reconnect, snapshot, ping e token move seguono `LIVE_SESSION_SPEC.md` e `PROTOCOL_SPEC.md`.

La Activity deve restare usabile anche su viewport piccoli senza introdurre funzioni di authoring desktop.

---

# 9. Browser standalone resta indipendente

Aggiungere Discord non rende il browser standalone dipendente dall'Embedded App SDK.

```text
Web standalone → join code V0.3
Discord        → Activity instance + pairing master V0.4
```

Entrambi convergono nello stesso dominio live/player dopo l'ingresso.

---

# 10. Non-obiettivi V0.4

- co-DM/handoff;
- bot Discord obbligatorio;
- slash command per usare la board;
- chat duplicata;
- voice/video custom;
- vault Discord;
- character manager completo;
- account EcoGDR;
- protocollo Discord separato.

---

# 11. Gate

La V0.4 è corretta se:

1. il master abbina un'Activity instance a una live session;
2. i giocatori della stessa istanza entrano senza codici;
3. una istanza non associata riceve zero stato campagna;
4. identity Discord è verificata server-side;
5. token non assegnato resta non controllabile;
6. chiudere la Activity del master non chiude la sessione;
7. nuova istanza richiede nuovo pairing;
8. tutti i gate standalone V0.3 continuano a passare.

---

## Regola finale

```text
Unisciti all'attività
→ sei al tavolo
```

Pairing e identity restano sotto questa esperienza.