# Campaign Manager v2 — Architecture

## 1. Obiettivo

Campaign Manager v2 è una ricostruzione completa del progetto originale.

La vecchia repository resta riferimento funzionale/storico, non base da refactorare.

Principio:

> costruire un prodotto locale solido e aggiungere ogni capacità remota come strato separato soltanto quando serve.

---

# 2. Principi architetturali

## Local-first

La cartella della campagna sul computer del DM è autorevole per note, board e asset.

## Stato separato per natura

Distinguere:

1. dati persistenti campagna;
2. stato live temporaneo;
3. stato UI/preferenze locali;
4. dati derivati ricostruibili;
5. stato/credenziali di servizi esterni fuori dal vault.

## Confini utili, non layer per principio

UI, filesystem, realtime, Discord, IA, auth e integrazioni hanno responsabilità diverse.

Questo non obbliga a creare package vuoti in anticipo.

## Nessuna dipendenza futura anticipata

Compendio, auth ed EcoGDR possono avere oggi un **gancio** senza avere oggi un backend finto.

Il core locale non importa SDK/API di servizi futuri.

---

# 3. Repository

Forma prevista, creata progressivamente:

```text
campaign-manager-v2/
  apps/
    desktop/
    activity/

  services/
    relay/

  packages/
    core/
    protocol/
    ai/
    ui/
```

`storage`, `application`, `search`, `auth` o `integrations` diventano package separati solo se dimensione/riuso reali lo giustificano.

Un piccolo adapter può vivere inizialmente nel modulo che lo usa.

---

# 4. Desktop

Stack:

- Electron;
- React;
- TypeScript.

Responsabilità nel tempo:

- campagne locali;
- editor/lettura;
- wikilink/backlink;
- ricerca/grafo;
- board;
- live controls;
- IA;
- Compendio;
- Account/integrazioni future.

Il renderer React non accede direttamente al filesystem.

Forma:

```text
UI
→ service/use case
→ repository/adapter
→ filesystem / OS / network
```

---

# 5. V0.1 — Moduli locali

Le responsabilità applicative possono vivere nel desktop finché restano separate logicamente:

```text
campaign lifecycle
notes/folders
save/recovery/conflict
wikilinks
search
backlink/graph projections
preferences
```

Non serve un package per ogni voce.

Normativa: `docs/V01_OPERATIONAL_SPEC.md`.

---

# 6. Board

```text
board preparata (*.board.json)
          ↓ pubblicazione futura
stato live temporaneo
```

Asset persistenti devono essere interni alla campagna; drag di asset esterno = import.

Card da estratto contengono soltanto ciò che il DM ha selezionato.

Normativa: `docs/BOARD_SPEC.md`.

---

# 7. Player client / Activity

`apps/activity` è il tavolo del giocatore.

## V0.3

Web standalone con join code.

## V0.4

Stesso client adattato a Discord.

Conosce solo:

- join/resume;
- waiting state;
- board pubblica;
- snapshot/eventi;
- pan/zoom/ping;
- token controllabili;
- asset pubblici.

Non conosce filesystem, vault, note private, API key o configurazione DM.

---

# 8. Relay realtime

```text
Desktop DM
   │ HTTPS/WSS outbound
   ▼
Relay / coordinatore sessione
   ▲
   │ HTTPS/WSS
Web Player / Discord Activity
```

Il relay è autorevole soltanto per runtime accettato.

Tecnologie previste, non dogmi:

- Cloudflare Worker;
- Durable Object o equivalente come coordinatore sessione;
- R2 o equivalente per asset pubblicati temporaneamente.

Non sono ammessi:

- tunnel verso il PC del DM;
- copia cloud generale del vault;
- upload di privati non pubblicati.

---

# 9. Protocollo

V0.3 usa:

```text
HTTPS → create/join/resume/assets/autorizzazione connessione
WSS   → snapshot + eventi realtime
```

Concetti essenziali:

- runtime schema validation;
- `stateSeq` per stato durevole;
- snapshot per reconnect/gap;
- comandi specifici;
- server-side permission validation;
- client non trusted.

Non richiede event sourcing o framework generale di idempotenza.

Normativa: `docs/PROTOCOL_SPEC.md`.

---

# 10. Discord

Discord entra soltanto in V0.4.

Adapter responsibilities:

```text
Activity instance
identity Discord verificata
pairing instance ↔ liveSession
```

Dopo l'ingresso parla lo stesso protocollo player V0.3.

Normativa: `docs/DISCORD_ACTIVITY_SPEC.md`.

---

# 11. Autenticazione applicativa

Oggi:

```text
Impostazioni → Account → placeholder
```

Nessun provider/runtime auth.

Futuro:

```text
UI account / feature cloud
→ AuthService piccolo
→ adapter provider reale
```

Auth non entra in:

- note/core;
- board;
- live credentials V0.3;
- Discord identity V0.4;
- API key provider IA.

Token/secret futuri restano fuori dal vault.

Normativa: `docs/AUTHENTICATION_SPEC.md`.

---

# 12. Compendio

Oggi:

```text
UI Compendio
→ schermata WIP
```

Futuro:

```text
UI Compendio
→ CompendiumService/client
→ enciclopedia cloud reale
```

Nessun dataset locale finto.

`Copia nelle note` usa i normali servizi locali e produce Markdown indipendente.

Normativa: `docs/COMPENDIUM_SPEC.md`.

---

# 13. IA V0.5

```text
request
→ search/read use case controllati
→ AiProvider adapter
→ risposta + fonti
→ eventuale proposta
→ approvazione
→ normale note service
```

Il provider non riceve filesystem arbitrario.

Prima versione:

- search lessicale;
- read note by `NoteId`;
- proposta edit singola nota;
- proposta nuova nota.

Non:

- delete/rename/move;
- bulk edit;
- board/live tools;
- agent framework obbligatorio;
- vector DB obbligatorio.

Normativa: `docs/AI_SPEC.md`.

---

# 14. Personaggi V0.6

V0.6 riusa le note esistenti come riferimento personaggio.

```text
BoardToken
  └─ characterNoteId? → NoteId
```

Non esiste un character database universale.

La stessa nota può essere collegata a token in board diverse.

Il collegamento è privato al desktop; il player non riceve NoteId/Markdown.

Normativa: `docs/V06_CHARACTERS_INTEGRATIONS_SPEC.md`.

---

# 15. Provider personaggio futuri

Quando esiste EcoGDR/BeFolder o altra sorgente reale:

```text
Desktop UI
→ piccolo CharacterProvider/service
→ adapter API reale
```

Non serve un plugin framework universale.

La prima integrazione preferisce collegamento/refresh espliciti, non sync continuo.

---

# 16. EcoGDR futuro

`externalBinding` collega semanticamente campagna locale e remota.

```text
local campaign
↔ binding opzionale
↔ remote campaign
```

Il binding non è sync.

Ogni futura operazione di import/pubblicazione/update è un use case separato progettato contro API reali.

Normativa: `docs/ECOGDR_INTEGRATION_SPEC.md`.

---

# 17. UI condivisa

`packages/ui` contiene componenti realmente condivisi solo quando utile.

Meglio duplicare un piccolo componente desktop/player che creare un'astrazione fragile prematuramente.

---

# 18. Regola anti-over-engineering

Quando due soluzioni rispettano lo stesso comportamento, preferire quella con:

- meno stato;
- meno livelli;
- meno servizi;
- meno sincronizzazione;
- recupero più semplice;
- sostituzione futura più facile.

Non generalizzare una soluzione finché non esiste un secondo caso reale che richiede l'astrazione.

---

## Regola finale

L'architettura è riuscita se ogni versione può essere costruita e usata senza fingere che la successiva esista già.