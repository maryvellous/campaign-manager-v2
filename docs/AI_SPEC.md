# Campaign Manager v2 — AI Assistant Specification

## 1. Scopo

Questo documento definisce la **V0.5 — Assistente IA**.

L'IA è una funzione opzionale del Campaign Manager. Deve aiutare il DM a trovare, capire e sviluppare il materiale della campagna senza diventare un agente autonomo che modifica il vault.

Prefisso requisiti: `AI-*`.

Principio:

> l'IA può leggere, cercare e proporre; l'utente decide cosa diventa campagna.

---

# 2. Non-obiettivi

V0.5 non è:

- un agente autonomo che lavora senza richiesta;
- un sistema che rinomina/sposta/cancella file da solo;
- un motore di regole TTRPG;
- una memoria cloud della campagna;
- un sostituto dell'editor;
- un crawler del web;
- un sistema multi-agente/sub-agente;
- un motivo per introdurre embeddings/vector DB senza bisogno misurato.

---

# 3. Accesso e superfici UI

## AI-UX-001 — Nessun placeholder prima della V0.5

Prima della V0.5 non serve occupare il rail con una voce IA inutilizzabile.

Quando la feature è reale, l'utente può aprirla almeno tramite:

- command palette: `Assistente IA`;
- azione contestuale nell'inspector della nota;
- azione su selezione testuale: `Chiedi all'IA`.

L'implementazione può aggiungere una voce stabile nel rail solo se durante la V0.5 risulta davvero utile e non sovraccarica la navigazione.

## AI-UX-002 — Workspace centrale

L'Assistente si apre in una vista/tab centrale, non in un popover minuscolo.

La conversazione non sostituisce la nota corrente nel filesystem e non crea Markdown finché l'utente non applica una proposta.

## AI-UX-003 — Contesto esplicito

Il composer mostra sempre che contesto sta usando, per esempio:

```text
Contesto
• Campagna intera
• Nota: Lady Maya
• Selezione corrente
```

L'utente deve poter rimuovere un contesto aggiunto esplicitamente.

Non vengono inviati automaticamente al provider file/asset non necessari alla richiesta.

---

# 4. Configurazione provider

## AI-CONF-001 — IA opzionale

Se nessun provider è configurato, il Campaign Manager resta completamente funzionante.

Aprendo l'Assistente viene mostrato uno stato utile:

```text
Assistente IA

Configura un provider per usare questa funzione.
[Apri impostazioni IA]
```

## AI-CONF-002 — Provider come adapter

La UI e gli use case non dipendono dall'SDK concreto del provider.

Forma concettuale:

```ts
interface AiProvider {
  complete(request: AiRequest): Promise<AiResponse>
}
```

Non serve costruire una piattaforma universale di provider in V0.5. Si implementano soltanto gli adapter realmente supportati.

## AI-CONF-003 — Credenziale locale, non account Campaign Manager

Se un provider richiede una API key, la chiave:

- viene configurata localmente;
- non viene scritta nella campagna;
- non viene inviata ai player;
- viene conservata tramite storage sicuro appropriato all'OS/app quando disponibile.

Una API key del provider IA non equivale all'account Campaign Manager di `AUTHENTICATION_SPEC.md`.

## AI-CONF-004 — Nessun endpoint arbitrario di default

V0.5 non deve per forza offrire un campo generico “Base URL / modello / headers” capace di trasformare la UI in una console tecnica.

La configurazione espone solo ciò che serve ai provider realmente supportati.

---

# 5. Retrieval

## AI-RET-001 — Search esistente prima di nuove infrastrutture

La prima retrieval pipeline usa i dati e la ricerca locale già disponibili:

```text
richiesta utente
→ query/search locale
→ note candidate
→ lettura delle sole note necessarie
→ prompt al provider
```

BM25/ricerca lessicale è il default iniziale.

## AI-RET-002 — Nessun vector DB per principio

Embeddings/vector DB possono entrare soltanto se test reali mostrano che la ricerca lessicale non recupera abbastanza bene i casi d'uso approvati.

Non sono requisito V0.5.

## AI-RET-003 — Fonti visibili

Quando una risposta usa contenuto della campagna, l'Assistente mostra le note effettivamente usate come fonti, con titolo/percorso cliccabile.

Esempio:

```text
Fonti usate
• NPC/Lady Maya.md
• Luoghi/Palazzo Ali Dorate.md
```

Queste non sono citazioni accademiche: servono al DM per verificare rapidamente da dove arriva una risposta.

## AI-RET-004 — Nessuna fonte inventata

Il sistema distingue tra:

- contenuto recuperato dal vault;
- inferenza/generazione del modello.

Una nota non letta non viene presentata come fonte usata.

## AI-RET-005 — Contesto limitato

Non viene inviato l'intero vault a ogni richiesta.

Si inviano la richiesta, il contesto esplicito e le note recuperate necessarie entro i limiti del provider.

---

# 6. Flussi principali

## AI-FLOW-001 — Domanda sulla campagna

```text
Assistente IA
→ scrivi domanda
→ retrieval locale
→ risposta
→ fonti cliccabili
```

Esempi:

- “Chi sa già che Kaldrim lavora con Vorax?”
- “Riassumimi cosa abbiamo stabilito su Porto Valus.”
- “Ci sono contraddizioni tra queste due note?”

## AI-FLOW-002 — Domanda sulla nota corrente

Da una nota:

```text
Chiedi all'IA su questa nota
→ Assistente con nota già nel contesto
→ domanda
→ risposta
```

Non occorre copiare/incollare manualmente il Markdown.

## AI-FLOW-003 — Selezione testuale

Da testo selezionato:

```text
seleziona testo
→ Chiedi all'IA
→ selezione aggiunta al contesto
```

La selezione non viene modificata automaticamente.

## AI-FLOW-004 — Nuova conversazione

V0.5 mantiene al massimo una conversazione di lavoro corrente per campagna, conservata localmente come stato non autorevole.

`Nuova conversazione` azzera il thread corrente dopo conferma se contiene materiale non applicato.

Non serve una libreria completa di chat/thread/tag.

---

# 7. Proposte di modifica

## AI-EDIT-001 — Risposta ≠ modifica

Una risposta testuale non modifica il vault.

Per cambiare contenuto, l'Assistente deve produrre una **proposta** esplicita.

## AI-EDIT-002 — Tipi V0.5

La prima versione supporta soltanto:

1. proposta di modifica a **una nota esistente**;
2. proposta di **nuova nota**.

Fuori scope come azioni eseguibili automatiche:

- delete;
- rename;
- move;
- folder operations;
- modifiche bulk a molte note;
- board edits;
- session/live commands.

L'IA può suggerire queste cose in testo, ma non riceve un comando applicativo per eseguirle.

## AI-EDIT-003 — Modifica nota esistente

Flusso:

```text
IA propone modifica
→ vista diff/anteprima
→ utente legge
→ [Applica] [Modifica proposta] [Scarta]
```

`Applica` usa il normale servizio di salvataggio della nota con revisione attesa e protezione conflitto.

## AI-EDIT-004 — Nuova nota

La proposta mostra almeno:

- titolo candidato;
- cartella destinazione;
- contenuto Markdown.

L'utente può correggere titolo/cartella/contenuto prima di `Crea nota`.

La creazione usa il normale flusso V0.1 e le sue regole di collisione/path.

## AI-EDIT-005 — Una proposta alla volta

Una richiesta che coinvolge molte note non produce un pulsante unico “Applica 17 modifiche”.

V0.5 preferisce:

- risposta/analisi globale;
- proposte indipendenti da rivedere una alla volta.

Questo riduce rischio e complessità di transazioni multi-file.

## AI-EDIT-006 — Proposta stale

Una proposta su nota esistente conserva la revisione di base.

Se la nota cambia prima dell'applicazione:

- la proposta viene marcata `La nota è cambiata`;
- non viene applicata sopra la nuova versione alla cieca;
- l'utente può rigenerare/rivedere la proposta sul contenuto corrente.

---

# 8. Stato conversazione

## AI-STATE-001 — Non autorevole

Conversazione, fonti recuperate e proposte non applicate vivono fuori dal vault.

La loro perdita non corrompe la campagna.

## AI-STATE-002 — Persistenza leggera

È consentito salvare localmente il thread corrente per campagna in AppData per ripristinare il contesto dopo riavvio.

Non serve un database conversazionale o sync cloud nella V0.5.

## AI-STATE-003 — Clear

`Nuova conversazione` o `Cancella conversazione` rimuove soltanto stato IA locale, non note o provider configuration.

---

# 9. Privacy

## AI-PRIV-001 — Trasparenza sul provider

Prima della prima richiesta effettiva a un provider remoto, la UI comunica in modo comprensibile che il testo necessario alla richiesta verrà inviato al provider configurato.

## AI-PRIV-002 — Minimo contesto necessario

Non si inviano automaticamente:

- intero vault;
- board private non richieste;
- asset binari;
- recovery draft non richiesti;
- credenziali;
- file fuori campagna.

## AI-PRIV-003 — Nessun accesso filesystem libero

Il modello non riceve uno strumento arbitrario `readFile(path)`.

Può ottenere note tramite use case controllati che accettano `NoteId` validi della campagna aperta.

## AI-PRIV-004 — Nessun tool di rete generico

V0.5 non dà al modello un browser/web tool generico come parte del Campaign Manager.

Se un giorno servirà ricerca web, sarà una feature separata con UX e permessi espliciti.

---

# 10. Stati ed errori

La vista deve distinguere almeno:

```text
not_configured
ready
thinking
cancelled
offline
auth/provider_key_invalid
rate_limited
provider_error
context_too_large
source_missing
proposal_stale
save_conflict
```

## AI-ERR-001 — Provider non configurato

Mostra CTA verso impostazioni; nessun errore tecnico rumoroso.

## AI-ERR-002 — Offline/provider error

La conversazione locale resta disponibile. La richiesta può essere riprovata.

Nessun dato della campagna viene alterato.

## AI-ERR-003 — Context too large

Il sistema riduce/ri-seleziona il contesto quando possibile e, se non basta, spiega che la richiesta è troppo ampia invece di troncare contenuto in modo invisibile.

## AI-ERR-004 — Cancel

L'utente può interrompere una generazione in corso.

La cancellazione non applica proposte parziali.

---

# 11. Implementazione e confini

## AI-ARCH-001 — Modulo separato quando serve

`packages/ai` è appropriato quando contiene provider adapters, request types e logica condivisa sufficiente a giustificarlo.

Non deve contenere filesystem o React.

## AI-ARCH-002 — Toolset minimo

La prima implementazione necessita al massimo di use case equivalenti a:

```text
searchNotes(query)
readNote(noteId)
proposeNoteEdit(noteId, ...)
proposeNewNote(...)
```

Il provider non chiama direttamente i repository autorevoli.

## AI-ARCH-003 — Nessun agent framework obbligatorio

Una richiesta può fare più passaggi interni di search/read se necessario, ma V0.5 non richiede framework agentico generale, planner, sub-agenti o code execution.

---

# 12. Acceptance flows

## AI-ACC-001 — Nessun provider

Campagna completamente utilizzabile; Assistente mostra configurazione necessaria.

## AI-ACC-002 — Q&A con fonte

Domanda con risposta derivata da una nota → nota mostrata come fonte e apribile.

## AI-ACC-003 — Domanda non supportata dal vault

Il modello può rispondere come generazione/inferenza ma non attribuisce la risposta a una nota inesistente/non letta.

## AI-ACC-004 — Edit approvato

Proposta → diff → Applica → normale save → file aggiornato.

## AI-ACC-005 — Edit scartato

Scarta → filesystem invariato.

## AI-ACC-006 — Nota cambiata

Proposta basata su revisione vecchia → Apply bloccato/riconciliazione richiesta.

## AI-ACC-007 — Nuova nota

Proposta nuova nota → utente modifica destinazione/titolo → normale create.

## AI-ACC-008 — Provider offline

Errore IA non blocca editor/search/board.

## AI-ACC-009 — Privacy

Una richiesta su una nota non invia automaticamente altre note non selezionate/recuperate né asset.

---

# 13. Gate V0.5

La V0.5 è completa quando:

1. il prodotto resta usabile senza IA;
2. provider e secret sono separati dal vault;
3. Q&A usa retrieval locale e mostra fonti reali;
4. edit/new note richiedono anteprima e azione utente;
5. nessun comando IA può cancellare/rinominare/spostare file;
6. proposta stale non sovrascrive una nota cambiata;
7. errore provider non modifica dati locali;
8. non sono stati introdotti vector DB o agent framework senza evidenza reale.

---

## Regola finale

L'Assistente è riuscito se rende più facile lavorare sulla campagna senza mai creare il dubbio:

> “Ha cambiato qualcosa senza che me ne accorgessi?”

La risposta deve essere **no**.