# Campaign Manager v2 — Board Specification

## 1. Scopo e stato

Questo documento definisce il contratto di prodotto e comportamento della board del Campaign Manager.

La board locale appartiene alla **V0.2**; la sua proiezione live entra in **V0.3** e viene poi usata dalla Discord Activity in **V0.4**.

Le decisioni con prefisso `BRD-*` sono vincolanti. L'implementatore può scegliere librerie, strutture interne e algoritmi soltanto se non cambia il comportamento osservabile qui definito.

Principio generale:

> pochi strumenti semplici che si combinano bene, non un mini-Foundry.

---

# 2. Ruolo e modello mentale

## BRD-PROD-001 — Workspace infinito semplice

La board è un workspace bidimensionale virtualmente infinito usato per:

- preparare mappe e scene;
- disporre immagini, testi, note collegate e token;
- organizzare materiale visivamente;
- pubblicare durante una sessione soltanto ciò che il DM decide di mostrare.

Non è un rules engine e non richiede automazioni da VTT completo.

## BRD-PROD-002 — Board preparata e board live sono distinte

La board salvata nella cartella della campagna è la **board preparata**.

Durante una sessione esiste una **proiezione live temporanea** contenente soltanto:

- elementi pubblicati;
- loro stato pubblico corrente;
- posizioni live dei token;
- autorizzazioni runtime;
- camera focus richiesta dal DM;
- ping e altri eventi effimeri.

Muovere token, fare ping, cambiare camera o mostrare/nascondere elementi durante il live non deve provocare scritture continue nel file della board preparata.

## BRD-PROD-003 — Nessun dato privato implicito nel live

Il live non è una copia completa della board con elementi nascosti lato client.

Un dato privato resta sul desktop del DM finché non viene pubblicato esplicitamente.

---

# 3. Creazione, apertura e identità della board

## BRD-DOC-001 — Board come contenuto persistente della campagna

Una board è un file JSON leggibile e versionato nella cartella della campagna.

Formato V0.2:

```text
*.board.json
```

La posizione predefinita per le nuove board è:

```text
Boards/<Titolo>.board.json
```

Se `Boards/` non esiste, l'app può crearla automaticamente. Questo non impone una tassonomia alle note Markdown.

## BRD-DOC-002 — Identità stabile

Ogni board contiene un `boardId` UUID stabile indipendente dal filename.

Forma minima concettuale:

```ts
interface BoardDocument {
  schemaVersion: number
  boardId: string
  title: string
  elements: BoardElement[]
}
```

Rinominare o spostare il file della board non cambia `boardId`.

## BRD-DOC-003 — Nuova board

`Nuova board` apre una board vuota e richiede un nome tramite input inline leggero, non tramite wizard tecnico.

- `Invio` conferma un nome valido;
- `Esc` annulla;
- uscire senza un nome valido non crea un file vuoto;
- collisioni di filename vengono segnalate invece di sovrascrivere una board esistente.

## BRD-DOC-004 — Rinomina

Il titolo della board può essere rinominato inline.

Come per le note:

- `Invio` o perdita del focus confermano;
- `Esc` annulla;
- il rename fisico avviene una volta sola dopo conferma;
- errori o collisioni lasciano intatto il file precedente.

## BRD-DOC-005 — Camera non autorevole

Pan, zoom, selezione corrente e ultimo viewport non sono contenuto semantico della board.

Possono essere salvati come preferenze locali per `boardId`, non devono essere necessari per ricostruire la board.

---

# 4. Salvataggio, recovery e concorrenza

## BRD-SAVE-001 — Stato reale

L'editor board distingue almeno:

- `dirty`;
- `saving`;
- `saved`;
- `error`;
- `conflict`.

`saved` può essere mostrato solo dopo persistenza confermata.

## BRD-SAVE-002 — Autosave per operazioni concluse

La board usa autosave dopo una breve inattività, ma **non salva ad ogni pixel durante un drag**.

Un'interazione continua viene coalesced e il salvataggio parte quando l'operazione si conclude e il breve debounce scade.

`Ctrl/Cmd+S` forza il tentativo immediato di salvataggio.

## BRD-SAVE-003 — Scrittura sicura

Il file board usa la stessa filosofia dello storage delle note:

- revisione/fingerprint della versione letta;
- scrittura atomica o equivalente sicura;
- nessun overwrite silenzioso se il file è cambiato esternamente;
- file precedente preservato in caso di fallimento prima del replace.

## BRD-SAVE-004 — Recovery

Se esistono modifiche locali non confermate, deve esistere una recovery locale separata dal file autorevole.

Un crash non deve trasformare una bozza non salvata in una board autorevole senza controllo.

## BRD-SAVE-005 — Modifica esterna

- board pulita + file cambiato esternamente → può essere ricaricato;
- board dirty + file cambiato esternamente → `conflict`, autosave sospeso, nessuna sovrascrittura automatica.

---

# 5. Strumenti del master

## BRD-TOOL-001 — Sei strumenti primari

La toolbar principale contiene soltanto:

1. **Seleziona** — selezione, spostamento, resize e multi-selezione;
2. **Mano** — pan senza modificare elementi;
3. **Nota/Testo** — testo appartenente direttamente alla board;
4. **Immagine** — mappe, illustrazioni e handout;
5. **Token** — personaggi, PNG, mostri e indicatori;
6. **Collegamento** — linee/frecce tra elementi o punti.

## BRD-TOOL-002 — Azioni contestuali

Non diventano strumenti separati:

- duplica;
- elimina;
- blocca/sblocca;
- porta avanti/indietro;
- porta in primo piano/sfondo;
- raggruppa/separa;
- mostra/nascondi ai giocatori;
- proprietà dell'elemento.

## BRD-TOOL-003 — Comandi accessibili

Le operazioni importanti devono avere un'alternativa a drag & drop e gesture precise tramite tastiera, menu contestuale o command palette.

---

# 6. Selezione e trasformazione

## BRD-SEL-001 — Selezione singola e multipla

- click su elemento → selezione singola;
- `Shift` + click → aggiunge/rimuove dalla selezione;
- trascinamento su spazio vuoto con Seleziona → marquee selection;
- `Esc` → cancella la selezione.

## BRD-SEL-002 — Spostamento

Trascinare una selezione sposta tutti gli elementi selezionati mantenendo le distanze relative.

La board non ha limiti artificiali che impediscano coordinate negative o grandi spostamenti, purché l'implementazione resti numericamente stabile.

## BRD-SEL-003 — Resize

Immagini, card e box di testo possono essere ridimensionati tramite handle.

Le immagini mantengono le proporzioni per default; un controllo contestuale può sbloccare le proporzioni.

I token restano proporzionati e non vengono deformati liberamente nella prima versione.

## BRD-SEL-004 — Tastiera

Quando il focus non è dentro un campo di testo:

- `Delete/Backspace` rimuove dalla board gli elementi selezionati dopo le normali protezioni applicabili;
- frecce possono effettuare piccoli spostamenti/nudge;
- `Ctrl/Cmd+A` seleziona gli elementi modificabili della board corrente.

Le shortcut precise devono evitare collisioni con editor e sistema operativo.

## BRD-SEL-005 — Undo/redo

Le modifiche della **board preparata** devono supportare undo/redo almeno per:

- aggiunta/rimozione;
- movimento;
- resize;
- modifica testo;
- z-order;
- raggruppamento;
- visibilità predefinita;
- proprietà degli elementi.

Undo/redo della board non riavvolge la cronologia degli eventi live generati dai giocatori.

---

# 7. Z-order, locking e gruppi

## BRD-ORDER-001 — Z-order deterministico

Gli elementi hanno un ordine di rendering persistente.

Sono disponibili almeno:

- avanti di un livello;
- indietro di un livello;
- porta in primo piano;
- porta in fondo.

Il riavvio dell'app non cambia l'ordine.

## BRD-LOCK-001 — Lock

Un elemento bloccato:

- resta visibile;
- può essere selezionato per ispezionarlo e sbloccarlo;
- non può essere spostato o ridimensionato accidentalmente;
- non viene incluso in trasformazioni collettive finché resta locked.

Una mappa può quindi essere facilmente `porta in fondo + blocca` senza introdurre un tipo speciale di background.

## BRD-GROUP-001 — Gruppo semplice

Più elementi possono essere raggruppati.

Nella prima versione il gruppo serve per:

- selezionare come unità;
- spostare come unità;
- duplicare/eliminare come unità;
- applicare lock e visibilità ai membri come operazione collettiva.

Il gruppo non crea una nuova entità visibile ai giocatori e non è un contenitore di dati autonomo.

## BRD-GROUP-002 — Resize gruppo escluso

Il resize proporzionale dell'intero gruppo non è requisito V0.2.

Per ridimensionare i membri si entra nella selezione dei singoli elementi o si separa il gruppo. Questo evita trasformazioni implicite difficili da prevedere.

---

# 8. Testo della board

## BRD-TEXT-001 — Testo locale alla board

Il testo creato con Nota/Testo appartiene alla board e non crea automaticamente una nota Markdown.

## BRD-TEXT-002 — Creazione

Con lo strumento Testo:

1. click sulla board crea un box;
2. il focus entra immediatamente nel testo;
3. se l'utente esce senza aver inserito contenuto significativo, il box vuoto viene annullato;
4. il box può essere spostato e ridimensionato.

## BRD-TEXT-003 — Formattazione iniziale semplice

V0.2 richiede testo multilinea leggibile ma non un editor rich-text completo.

Tipografia, dimensioni e stili base usano il design system. Non sono richiesti font arbitrari, colori liberi, tabelle o un mini word processor.

---

# 9. Immagini e asset

## BRD-IMG-001 — Formati base

La prima implementazione supporta almeno:

- PNG;
- JPEG/JPG;
- WebP.

Altri formati possono essere aggiunti dopo validazione; un formato non supportato produce un errore chiaro e non crea un elemento rotto.

## BRD-ASSET-001 — Nessun riferimento persistente esterno

Una board salvata non può dipendere da path assoluti verso file fuori dalla campagna.

Ogni asset persistente referenziato dalla board deve essere interno alla cartella campagna.

## BRD-ASSET-002 — Drag esterno = import automatico

Trascinare un'immagine esterna sulla board significa:

```text
file esterno
→ import/copia nella campagna
→ riferimento relativo portabile
→ elemento immagine sulla board
```

L'utente non deve copiare manualmente prima il file.

## BRD-ASSET-003 — Destinazione predefinita

Gli asset importati automaticamente dalla board vengono salvati per default in:

```text
Assets/Board/
```

La directory viene creata se necessario.

L'utente può successivamente organizzare gli asset attraverso strumenti dedicati, purché i riferimenti della board vengano aggiornati in modo coordinato.

## BRD-ASSET-004 — Collisioni e duplicati

L'import non sovrascrive mai silenziosamente un file esistente.

- stesso contenuto già importato → l'implementazione può riusare l'asset esistente;
- stesso nome ma contenuto diverso → viene creato un filename distinto e comprensibile, preservando entrambi i file.

La board non deve perdere l'asset precedente.

## BRD-ASSET-005 — Eliminare elemento ≠ eliminare file

Rimuovere un'immagine dalla board non cancella il file dalla campagna.

La cancellazione fisica dell'asset è un'operazione separata.

## BRD-ASSET-006 — Sicurezza live

Soltanto asset interni alla campagna e associati a elementi esplicitamente pubblicati possono essere caricati verso lo storage live.

Un file arbitrario del computer del DM non può essere esposto semplicemente costruendone un path.

## BRD-IMG-002 — Immagine normale

Un'immagine può essere usata come mappa, illustrazione, handout o decorazione senza categorie rigide.

Una normale immagine pubblicata può essere visualizzata dai giocatori nella board; eventuale apertura ingrandita è un comportamento UI consentito ma non cambia i permessi.

Un asset pubblicato deve essere considerato effettivamente condiviso con i partecipanti: nasconderlo successivamente non può cancellare una copia già ricevuta dal loro dispositivo.

---

# 10. Note collegate e card estratto

## BRD-NOTE-001 — Trascinare una nota intera

Trascinare una nota dal vault sulla board crea una **card collegata** con:

- titolo della nota;
- riferimento alla `NoteId` sorgente;
- nessuna copia automatica del Markdown completo.

Per il master la card funziona come accesso rapido: aprirne il collegamento porta alla nota sorgente.

Se viene pubblicata ai giocatori, una card senza estratto mostra soltanto il proprio contenuto esplicitamente presente sulla card; non concede accesso alla nota.

## BRD-NOTE-002 — Creare una card da un estratto

Il flusso approvato per condividere una parte di nota è:

```text
seleziona testo dentro una nota
→ Porta sulla board / drag verso board
→ crea card collegata con titolo della nota + solo l'estratto selezionato
```

Il Campaign Manager non chiede di compilare un secondo modulo "testo pubblico".

## BRD-NOTE-003 — Comando `Porta sulla board…`

Deve esistere un percorso accessibile anche senza drag & drop:

1. l'utente seleziona testo nella nota;
2. usa `Porta sulla board…`;
3. sceglie la board di destinazione da un picker leggero;
4. l'app apre/attiva quella board;
5. la nuova card è pronta per essere posizionata;
6. click conferma la posizione; `Esc` annulla la creazione.

Se una sola board è già il target inequivocabile, l'implementazione può saltare il picker.

## BRD-NOTE-004 — Estratto come snapshot sicuro

L'estratto viene copiato nella card al momento della creazione.

Modificare successivamente la nota sorgente **non aggiorna automaticamente** il testo della card.

Questo evita che una modifica privata alla nota venga pubblicata accidentalmente.

## BRD-NOTE-005 — Modifica della card

Il testo dell'estratto sulla board può essere modificato dal master come contenuto della card.

Queste modifiche:

- non modificano la nota sorgente;
- non pretendono di restare sincronizzate con essa;
- mantengono comunque il collegamento alla nota per uso del master.

La card è quindi una copia editoriale controllata di ciò che il DM vuole mostrare, non una finestra live sul Markdown privato.

## BRD-NOTE-006 — Rendering del frammento

L'estratto può conservare la formattazione Markdown sicura supportata dal renderer della nota.

Wikilink presenti nell'estratto mostrato ai giocatori non diventano automaticamente link navigabili verso il vault privato. Possono essere renderizzati come testo leggibile.

## BRD-NOTE-007 — Rename/move sorgente

Se la nota sorgente viene rinominata o spostata tramite Campaign Manager, i riferimenti delle card devono essere aggiornati insieme alle altre referenze coordinate.

Il titolo visuale della card **non cambia automaticamente se è stato modificato manualmente** sulla board.

Se usa ancora il titolo derivato originale e non è stato personalizzato, l'implementazione può aggiornarlo al nuovo titolo della nota.

## BRD-NOTE-008 — Nota sorgente mancante

Se la nota sorgente viene eliminata o scompare esternamente:

- la card resta sulla board;
- il suo estratto non viene perso;
- il master vede che il collegamento alla sorgente è mancante;
- i giocatori non ricevono dettagli tecnici sul path mancante.

---

# 11. Token

## BRD-TOKEN-001 — Modello minimo

Un token persistente contiene almeno:

- `elementId` stabile;
- nome visuale;
- immagine/avatar opzionale interno alla campagna;
- posizione;
- dimensione;
- z-order;
- stato di lock e visibilità predefinita.

## BRD-TOKEN-002 — Creazione

Con lo strumento Token:

1. click sulla board crea un token placeholder;
2. il master assegna almeno un nome oppure annulla;
3. può aggiungere/sostituire l'immagine con un asset della campagna o importandone uno;
4. il token resta utilizzabile anche senza immagine tramite rappresentazione neutra + nome.

## BRD-TOKEN-003 — Controllo giocatore è stato live

L'associazione tra partecipante live e token **non appartiene al file board V0.2**.

Durante la sessione il DM può assegnare uno o più partecipanti autorizzati a un token.

Il master può sempre controllare tutti i token.

## BRD-TOKEN-004 — Movimento live

Il movimento di un token durante la sessione modifica la posizione live, non automaticamente la posizione preparata salvata nella board.

Per un giocatore:

```text
drag token autorizzato
→ richiesta movimento
→ validazione lato autorevole
→ nuova posizione accettata
→ broadcast a tutti
```

Se la richiesta viene rifiutata, il client torna alla posizione autorevole.

## BRD-TOKEN-005 — Concorrenza movimento

Se più client autorizzati producono movimenti concorrenti, prevale l'ordine accettato dal lato autorevole della sessione.

I client convergono sempre alla posizione confermata dal server/session authority; non mantengono fork locali.

---

# 12. Collegamenti visuali

## BRD-LINK-001 — Collegamento libero o ancorato

Lo strumento Collegamento può creare una linea/freccia:

- tra due elementi;
- tra un elemento e un punto libero;
- tra due punti liberi.

Un'estremità ancorata a un elemento segue l'elemento quando questo viene spostato.

## BRD-LINK-002 — Nessun wikilink implicito

Un collegamento visuale della board non crea né modifica wikilink Markdown.

## BRD-LINK-003 — Privacy degli endpoint

Nel live, un collegamento ancorato a un elemento privato non deve rivelarne indirettamente posizione o esistenza.

Se la pubblicazione del collegamento esporrebbe un endpoint privato, il collegamento viene omesso dalla proiezione pubblica finché gli endpoint necessari non sono visibili.

---

# 13. Griglia e snapping

## BRD-GRID-001 — Freeform nella prima versione

La V0.2 è freeform.

Non sono requisiti della prima board:

- griglia tattica;
- snap-to-grid;
- misurazione distanze;
- dimensione caselle;
- movimento a turni.

Queste funzioni potranno essere aggiunte dopo uso reale senza cambiare il formato fondamentale degli elementi.

---

# 14. Visibilità preparata e live

## BRD-VIS-001 — Default sicuro

Ogni nuovo elemento nasce **privato per i giocatori**.

Il DM lo rende visibile esplicitamente tramite azione `Mostra ai giocatori`/icona equivalente.

La multi-selezione permette di rendere visibili più elementi in una sola operazione, evitando lavoro ripetitivo.

## BRD-VIS-002 — Visibilità predefinita persistente

La board preparata può memorizzare una preferenza `visibleByDefault` per ogni elemento.

Quando una nuova live session pubblica la board, gli elementi con `visibleByDefault` entrano nello snapshot iniziale; gli altri restano privati.

## BRD-VIS-003 — Reveal/hide live non riscrive il default

Durante il live, mostrare o nascondere un elemento modifica la **proiezione live corrente**.

Non cambia automaticamente il valore preparato `visibleByDefault`.

Se il DM vuole cambiare il default per le sessioni future, lo fa esplicitamente nelle proprietà della board preparata.

## BRD-VIS-004 — Elementi privati non vengono inviati

Un elemento privato non viene inviato al client e nascosto via CSS.

Finché non è pubblicato, il client non riceve:

- testo;
- asset;
- coordinate;
- titolo privato;
- `NoteId` sorgente;
- metadata non necessari.

## BRD-VIS-005 — Hide non revoca conoscenza già condivisa

Nascondere un elemento precedentemente rivelato lo rimuove dalla vista live corrente, ma non può garantire che dati già ricevuti dal dispositivo del giocatore vengano "dimenticati".

Il prodotto non deve presentare `Nascondi` come meccanismo DRM o revoca retroattiva.

---

# 15. Vista del giocatore

## BRD-PLAYER-001 — Pan e zoom indipendenti

Ogni giocatore controlla liberamente la propria camera.

La camera del DM non trascina continuamente quella degli altri.

## BRD-PLAYER-002 — `Porta tutti qui`

Il DM può inviare un comando one-shot `Porta tutti qui`.

Il comando centra la camera dei client sulla zona scelta una volta; subito dopo ogni giocatore può tornare a fare pan/zoom autonomamente.

La prima versione non richiede una modalità continua `Segui il master`.

## BRD-PLAYER-003 — Ping

Un giocatore può creare un ping temporaneo visibile agli altri partecipanti della sessione.

Il ping:

- non viene salvato nella board;
- non modifica elementi;
- scompare automaticamente dopo un breve intervallo;
- può essere rate-limited dal protocollo/relay per evitare spam.

## BRD-PLAYER-004 — Nessun editing libero

Il giocatore non può creare, eliminare o modificare liberamente testi, immagini, card o collegamenti della board preparata.

Le sue azioni V0.3 sono limitate a navigazione, ping e controllo dei token autorizzati.

---

# 16. Pubblicazione e sincronizzazione live

## BRD-SYNC-001 — Non è video streaming

La board non viene trasmessa come video o sequenza di screenshot.

Il client renderizza localmente una rappresentazione strutturata della board pubblica.

## BRD-SYNC-002 — Snapshot iniziale

Al join/reconnect il client riceve uno snapshot pubblico sufficiente a ricostruire lo stato corrente.

Lo snapshot contiene solo elementi visibili e dati pubblici.

## BRD-SYNC-003 — Eventi incrementali

Dopo lo snapshot, i cambiamenti vengono propagati tramite piccoli eventi incrementali, per esempio:

```text
element.add
element.update
element.reveal
element.hide
element.remove
token.move
camera.focus
ping.create
```

I nomi definitivi appartengono a `PROTOCOL_SPEC.md`.

## BRD-SYNC-004 — Asset separati

Immagini e altri asset pesanti vengono pubblicati separatamente e referenziati tramite URL/ID autorizzati.

Non vengono reinviati in Base64 dentro ogni messaggio realtime.

## BRD-SYNC-005 — Edit di contenuto visibile

Se durante una sessione il DM modifica un elemento persistente della board che è attualmente pubblico, dopo il salvataggio/conferma applicativa la proiezione live riceve l'aggiornamento corrispondente.

Se l'elemento è privato, la modifica resta privata.

## BRD-SYNC-006 — Nuovi elementi durante il live

Un elemento creato durante una sessione viene salvato normalmente nella board preparata ma nasce privato, come ogni nuovo elemento.

Diventa parte del live soltanto quando il DM lo pubblica.

## BRD-SYNC-007 — Reconnect

Un client riconnesso non dipende dall'aver ricevuto tutta la storia degli eventi.

Riceve lo snapshot pubblico corrente e riparte da quello stato.

---

# 17. Fine sessione e stato finale

## BRD-END-001 — Default: board preparata intatta

Chiudere una sessione non salva automaticamente le posizioni live dei token nella board preparata.

## BRD-END-002 — Posizioni token modificate

Se al termine esistono token con posizione live diversa dalla posizione preparata, il DM riceve una scelta esplicita equivalente a:

```text
Mantieni le posizioni finali dei token?
[Salva sulla board] [Lascia la board com'era]
```

La scelta appare soltanto quando esistono differenze rilevanti.

## BRD-END-003 — Cosa viene applicato

`Salva sulla board` copia nella board preparata **le posizioni finali dei token**.

Non copia automaticamente:

- ping;
- camera dei giocatori;
- partecipanti;
- permessi token runtime;
- reveal/hide temporanei;
- presenza;
- altri stati effimeri.

## BRD-END-004 — Visibilità futura esplicita

Se il DM vuole che un elemento rivelato durante la sessione sia visibile di default anche nelle sessioni future, modifica esplicitamente `visibleByDefault` nella board preparata.

---

# 18. Casi limite

## BRD-EDGE-001 — Asset mancante

Se un asset referenziato non esiste più:

- la board continua ad aprirsi;
- l'elemento mostra uno stato `asset mancante` al master;
- nessun crash dell'intera board;
- il master può sostituire/riparare il riferimento.

## BRD-EDGE-002 — Elemento sorgente note mancante

Una card con nota sorgente mancante conserva il proprio testo/estratto e resta modificabile.

## BRD-EDGE-003 — Board vuota

Una board senza elementi mostra uno stato vuoto utile e consente subito di inserire contenuti; non appare come errore.

## BRD-EDGE-004 — Elementi fuori viewport

La board deve offrire un comando `Centra contenuto` o equivalente per recuperare elementi dispersi fuori dalla camera corrente.

## BRD-EDGE-005 — Operazione di import fallita

Se un import asset fallisce, l'app non crea un elemento board che punti a un file inesistente e segnala il problema senza perdere altri contenuti.

---

# 19. Funzioni deliberatamente escluse dalla prima board

La V0.2/V0.3 iniziale non richiede:

- fog of war avanzato;
- griglia tattica e snap;
- righelli/distanze;
- template di incantesimi;
- iniziativa;
- dadi integrati;
- line of sight;
- illuminazione dinamica;
- turn tracker;
- automazioni di regole;
- collisioni muri/token;
- audio/video;
- drawing tool libero complesso;
- scripting/macros.

Queste feature entrano solo se l'uso reale dimostra che risolvono un problema importante.

---

# 20. Scenari di accettazione

## BRD-ACC-001 — Import portabile

Trascinare `C:\Download\castello.png` su una board importa l'immagine nella campagna e il file board non contiene quel path assoluto esterno.

## BRD-ACC-002 — Estratto sicuro

Se una nota contiene testo pubblico e segreti, selezionare soltanto il testo pubblico e `Porta sulla board` crea una card contenente esclusivamente l'estratto selezionato. Modificare dopo il resto della nota non cambia la card.

## BRD-ACC-003 — Nota rinominata

Rinominare tramite Campaign Manager una nota sorgente mantiene risolvibile la card collegata; eventuale titolo personalizzato della card resta invariato.

## BRD-ACC-004 — Sorgente eliminata

Eliminare la nota sorgente non elimina la card né il suo estratto.

## BRD-ACC-005 — Elemento privato

Un elemento privato non compare nello snapshot live e il client non ne riceve contenuto o coordinate.

## BRD-ACC-006 — Reveal

Rivelare un elemento durante il live lo aggiunge alla proiezione pubblica senza dover reinviare l'intera board.

## BRD-ACC-007 — Token giocatore

Un giocatore autorizzato può chiedere di muovere il proprio token; uno non autorizzato riceve rifiuto e non cambia lo stato autorevole.

## BRD-ACC-008 — Reconnect

Un giocatore che perde connessione e rientra ricostruisce lo stato pubblico corrente tramite snapshot senza conoscere gli eventi persi.

## BRD-ACC-009 — Fine sessione

Muovere token durante il live e scegliere `Lascia la board com'era` mantiene le posizioni preparate originali. Scegliere `Salva sulla board` aggiorna soltanto le posizioni finali dei token.

## BRD-ACC-010 — Lock e mappa

Una grande immagine mandata in fondo e bloccata resta utilizzabile come mappa senza venire trascinata accidentalmente durante la manipolazione dei token.

## BRD-ACC-011 — Save fallito

Un errore durante il salvataggio della board mantiene lo stato `error`, conserva il buffer/recovery e non mostra `saved`.

## BRD-ACC-012 — Collegamento a elemento privato

Una freccia verso un elemento segreto non deve rivelarne posizione o esistenza ai giocatori prima della pubblicazione del target.

---

# 21. Test obbligatori

La futura implementazione deve avere almeno test per:

- serializzazione/deserializzazione e schema version;
- boardId stabile dopo rename;
- autosave coalesced e conflict;
- import asset e path relativi;
- collisioni asset;
- add/move/resize/delete;
- z-order e lock;
- gruppo/spostamento gruppo;
- undo/redo preparato;
- linked note / linked excerpt;
- rename e sorgente mancante;
- visibilità predefinita e override live;
- snapshot che esclude elementi privati;
- token permission validation;
- reconnect snapshot;
- apply/discard posizioni finali token.

---

## Regola finale

La board è riuscita quando il DM può preparare liberamente una scena locale, collegarla alle proprie note e asset, e poi trasformarla in una vista giocatore sicura con pochi gesti espliciti.

Se per ottenere questo risultato servono toolbar enormi, copie automatiche del vault, streaming video o stato live mescolato ai file persistenti, l'implementazione ha violato la direzione del prodotto.
