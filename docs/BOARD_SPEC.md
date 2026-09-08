# Campaign Manager v2 — Board Specification

## 1. Scopo

La board locale appartiene alla **V0.2**. La sua proiezione live viene usata dalla V0.3 e dalla Discord Activity V0.4.

Prefisso requisiti: `BRD-*`.

Principio:

> pochi strumenti semplici che si combinano bene, non un mini-Foundry.

---

# 2. Modello mentale

## BRD-PROD-001 — Workspace freeform

La board è un workspace bidimensionale virtualmente infinito per preparare mappe, scene e materiale visivo.

Contiene immagini, testo, card collegate a note, token e collegamenti visuali.

## BRD-PROD-002 — Preparata vs live

La board salvata nella campagna è la **board preparata**.

La sessione live usa una proiezione temporanea distinta, con stato pubblico, posizioni token e permessi runtime.

Movimenti live, ping e reveal/hide non scrivono continuamente il file della board preparata.

## BRD-PROD-003 — Privacy reale

Gli elementi privati non vengono inviati ai client giocatore e poi nascosti via CSS. Restano sul desktop finché il DM non li pubblica.

---

# 3. File e salvataggio

## BRD-DOC-001 — Formato

Una board è un file leggibile e versionato:

```text
Boards/<Titolo>.board.json
```

con `boardId` UUID stabile, indipendente dal filename.

La cartella `Boards/` può essere creata automaticamente.

## BRD-DOC-002 — Nuova board e rename

`Nuova board` richiede solo un nome inline leggero.

- Invio conferma;
- Esc annulla;
- collisione non sovrascrive;
- rename confermato con Invio/blur, Esc annulla.

## BRD-SAVE-001 — Save reale

Stati minimi:

- dirty;
- saving;
- saved;
- error;
- conflict.

`saved` appare solo dopo persistenza confermata.

Autosave avviene dopo una breve inattività e non a ogni pixel di un drag. `Ctrl/Cmd+S` forza il tentativo.

La board usa revision/fingerprint e scrittura sicura per evitare overwrite silenziosi.

## BRD-SAVE-002 — Recovery

Modifiche locali non confermate devono essere recuperabili dopo crash. La recovery è separata dal file autorevole.

Board dirty + modifica esterna → conflict; nessun overwrite automatico.

---

# 4. Sei strumenti del master

La toolbar principale contiene solo:

1. **Seleziona** — selezione, spostamento, resize, multi-selezione;
2. **Mano** — pan;
3. **Nota/Testo** — testo appartenente alla board;
4. **Immagine** — mappe, illustrazioni, handout;
5. **Token** — personaggi, PNG, mostri, indicatori;
6. **Collegamento** — linee/frecce.

Duplica, elimina, blocca, z-order, raggruppa, visibilità e proprietà sono azioni contestuali, non strumenti separati.

Le azioni importanti devono avere alternativa a drag/gesture tramite tastiera, menu o command palette.

---

# 5. Selezione, ordine e gruppi

## BRD-SEL-001 — Selezione

- click → singola;
- Shift+click → aggiunge/rimuove;
- marquee su spazio vuoto → multipla;
- Esc → deseleziona.

Trascinare una selezione sposta gli elementi mantenendo le distanze relative.

Immagini, card e box testo sono ridimensionabili. Le immagini mantengono le proporzioni per default. I token non vengono deformati liberamente.

## BRD-SEL-002 — Undo/redo

La board preparata supporta undo/redo almeno per aggiunta/rimozione, movimento, resize, testo, z-order, gruppo, lock e proprietà.

Non riavvolge eventi live dei giocatori.

## BRD-ORDER-001 — Z-order

Persistono almeno:

- avanti;
- indietro;
- primo piano;
- sfondo.

## BRD-LOCK-001 — Lock

Un elemento locked può essere ispezionato/sbloccato ma non spostato o ridimensionato accidentalmente.

Una mappa può quindi essere semplicemente `porta in fondo + blocca`.

## BRD-GROUP-001 — Gruppi semplici

Un gruppo serve a selezionare, spostare, duplicare/eliminare e applicare lock/visibilità ai membri insieme.

Il resize proporzionale dell'intero gruppo non è requisito V0.2.

---

# 6. Testo

Il testo creato sulla board non crea una nota Markdown.

Click con lo strumento Testo → box editabile. Se resta vuoto viene annullato.

V0.2 richiede testo multilinea leggibile, non un editor rich-text completo con font/colori arbitrari.

---

# 7. Immagini e asset

## BRD-ASSET-001 — Solo asset interni

Una board salvata non conserva path assoluti esterni alla campagna.

## BRD-ASSET-002 — Drag esterno = import

Trascinare un'immagine esterna significa:

```text
file esterno
→ copia/import in Assets/Board/
→ riferimento relativo
→ elemento board
```

PNG, JPEG/JPG e WebP sono i formati minimi.

L'import non sovrascrive silenziosamente file esistenti.

Rimuovere l'elemento dalla board **non cancella** automaticamente il file importato.

## BRD-ASSET-003 — Live sicuro

Solo asset interni associati a elementi esplicitamente pubblicati possono essere caricati nello storage live.

---

# 8. Note collegate e card da estratto

## BRD-NOTE-001 — Nota intera

Trascinare una nota sulla board crea una card collegata con titolo + riferimento alla `NoteId`, senza copiare il Markdown completo.

Per il master è un accesso rapido alla nota sorgente.

## BRD-NOTE-002 — Estratto

Flusso approvato:

```text
seleziona testo nella nota
→ Porta sulla board / drag
→ card con titolo nota + solo testo selezionato
```

Nessun modulo separato “testo pubblico”.

Il comando `Porta sulla board…` deve esistere anche senza drag.

## BRD-NOTE-003 — Snapshot sicuro

L'estratto viene copiato nella card al momento della creazione.

Modifiche successive alla nota sorgente non aggiornano automaticamente la card.

Il master può modificare la card senza cambiare la nota sorgente.

Wikilink nell'estratto mostrato ai giocatori non danno accesso al vault privato.

## BRD-NOTE-004 — Sorgente rinominata o mancante

Rename/move via Campaign Manager aggiorna il collegamento della card.

Se la sorgente manca, la card e il suo estratto restano intatti; il master vede un warning.

---

# 9. Token

## BRD-TOKEN-001 — Modello minimo

Un token persistente contiene almeno:

- `elementId` stabile;
- nome;
- immagine opzionale interna alla campagna;
- posizione;
- dimensione;
- z-order;
- lock;
- visibilità predefinita.

Un token può funzionare anche senza immagine con rappresentazione neutra + nome.

## BRD-TOKEN-002 — Controller live

L'assegnazione ai giocatori **non appartiene al file board**.

Durante una sessione:

- un giocatore può controllare più token;
- **un token può avere al massimo un controller giocatore alla volta**;
- il DM può sempre controllare tutti i token;
- riassegnare un token sostituisce il controller precedente.

## BRD-TOKEN-003 — Movimento live

Il movimento live modifica la posizione runtime, non automaticamente quella preparata.

Il client richiede il movimento; l'autorità di sessione valida il controller e comunica la posizione accettata.

---

# 10. Collegamenti visuali

Una linea/freccia può collegare due elementi, un elemento e un punto libero, o due punti liberi.

Un'estremità ancorata segue l'elemento.

Un collegamento visuale non crea wikilink Markdown.

Se un collegamento rivelerebbe un endpoint privato, non viene pubblicato finché gli endpoint necessari non sono visibili.

---

# 11. Griglia

La prima board è freeform.

Fuori scope V0.2:

- griglia tattica/snap;
- distanze;
- fog of war avanzato;
- template incantesimi;
- iniziativa;
- dadi;
- line of sight/illuminazione;
- turn tracker;
- automazioni regole;
- muri/collisioni;
- macro/scripting;
- audio/video.

---

# 12. Visibilità

## BRD-VIS-001 — Default privato

Ogni nuovo elemento nasce privato per i giocatori.

La board preparata può memorizzare `visibleByDefault`.

Durante il live reveal/hide modifica lo stato runtime corrente ma non riscrive automaticamente il default preparato.

## BRD-VIS-002 — Nessun dato privato al client

Un elemento privato non invia testo, asset, coordinate, titolo, `NoteId` o metadata non necessari.

Nascondere un elemento già rivelato lo toglie dalla vista live, ma non promette di cancellare dati già ricevuti dal dispositivo del giocatore.

---

# 13. Vista giocatore

Il giocatore ha pan/zoom indipendenti.

Il DM può usare un comando one-shot **Porta tutti qui**; dopo il focus ogni giocatore torna libero di muoversi.

Il giocatore può fare ping e muovere solo il token assegnato.

Non può creare/modificare/eliminare liberamente gli elementi della board.

---

# 14. Sincronizzazione live

La board non viene trasmessa come video.

Join/reconnect → snapshot pubblico corrente.

Poi piccoli eventi incrementali aggiornano reveal/hide, elementi, token, focus e ping.

Immagini/asset pesanti sono pubblicati separatamente.

Un nuovo elemento creato durante il live viene salvato nella board preparata ma nasce privato.

---

# 15. Fine sessione

Default: la board preparata resta intatta.

Se le posizioni live dei token differiscono, il DM sceglie:

```text
[Salva sulla board] [Lascia la board com'era]
```

Solo le posizioni finali dei token vengono eventualmente copiate nella board preparata.

Non vengono copiati automaticamente ping, camera, partecipanti, permessi o reveal/hide runtime.

---

# 16. Casi limite

- asset mancante → board apre, placeholder/warning, possibilità di sostituire;
- sorgente card mancante → estratto resta;
- board vuota → empty state utile;
- elementi dispersi → `Centra contenuto`;
- import fallito → nessun elemento rotto creato;
- save fallito → stato error + recovery, nessun falso saved.

---

# 17. Quality gate

Testare almeno:

- serializzazione/schema/boardId;
- save/conflict/recovery;
- import asset e path relativi;
- add/move/resize/delete;
- z-order/lock/group;
- undo/redo;
- linked note + linked excerpt;
- sorgente rinominata/mancante;
- visibilità privata/pubblica;
- snapshot che esclude privati;
- token controller singolo e riassegnazione;
- reconnect snapshot;
- apply/discard posizioni finali token.

---

## Regola finale

La board è riuscita se il DM prepara una scena locale, la collega a note/asset e la trasforma in una vista giocatore sicura con pochi gesti espliciti.