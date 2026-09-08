# Campaign Manager v2 — Board Specification

## 1. Scopo e stato

Questo documento registra le decisioni di prodotto e architettura **approvate** per la board del Campaign Manager.

La board appartiene alla **V0.2**; la condivisione live della board entra in **V0.3** e viene poi usata dalla Discord Activity in **V0.4**.

Le decisioni qui definite con prefisso `BRD-*` sono vincolanti e non devono essere reinventate dagli implementatori.

---

# 2. Ruolo della board

## BRD-PROD-001 — Board semplice, non VTT universale

La board è un workspace infinito per preparazione e sessione, ma il Campaign Manager non deve trasformarsi prematuramente in un concorrente completo di Foundry/Roll20.

La prima versione privilegia pochi strumenti generali e controlli contestuali.

## BRD-PROD-002 — Preparazione e live sono distinti

La board salvata nella campagna è **board preparata**.

Durante una sessione il sistema mantiene una **proiezione live temporanea** di ciò che i giocatori vedono e dello stato operativo della sessione.

Muovere token o cambiare stato live non deve riscrivere automaticamente e continuamente la board preparata.

Al termine della sessione potrà esistere un'azione esplicita equivalente a `Salva stato finale nella board`.

---

# 3. Strumenti del master

## BRD-TOOL-001 — Sei strumenti primari

La prima board usa sei strumenti principali:

1. **Seleziona** — selezione, spostamento, resize, multi-selezione;
2. **Mano** — pan della board senza spostare elementi;
3. **Nota/Testo** — testo appartenente direttamente alla board;
4. **Immagine** — mappe, illustrazioni, handout e immagini decorative;
5. **Token** — personaggi, PNG, mostri e indicatori;
6. **Collegamento** — linee/frecce tra elementi.

## BRD-TOOL-002 — Azioni contestuali, non nuovi strumenti

Azioni come:

- duplica;
- elimina;
- blocca/sblocca;
- porta avanti/indietro;
- raggruppa/separa;
- proprietà dell'elemento;

sono controlli contestuali dell'oggetto selezionato e non devono gonfiare la toolbar principale.

## BRD-TOOL-003 — Note del vault via drag & drop

Una nota Markdown della campagna viene aggiunta alla board trascinandola dal vault/sidebar o tramite comando equivalente accessibile.

Non richiede un settimo strumento dedicato.

---

# 4. Tipi di elemento

## BRD-ELEM-001 — Immagine

Un'immagine può essere:

- mappa principale;
- illustrazione;
- handout;
- elemento decorativo.

Può essere posizionata, ridimensionata e organizzata nello z-order.

## BRD-ELEM-002 — Testo board

Il testo creato con lo strumento Nota/Testo appartiene alla board stessa.

Non crea automaticamente una nuova nota Markdown nel vault.

## BRD-ELEM-003 — Nota collegata

Una nota trascinata dal vault diventa una card collegata alla nota originale tramite la sua identità di campagna.

La board non deve duplicare automaticamente l'intero contenuto Markdown come nuova fonte autorevole.

La nota originale resta autorevole nel vault.

Il comportamento preciso del **contenuto pubblico** della card collegata è ancora da finalizzare; in ogni caso il Markdown privato della nota non deve essere pubblicato automaticamente ai giocatori.

## BRD-ELEM-004 — Token

Un token è un elemento con almeno:

- identità runtime/board stabile;
- nome visuale;
- immagine/avatar opzionale;
- posizione e dimensione;
- visibilità live;
- eventuale assegnazione di controllo a uno o più giocatori nella sessione.

## BRD-ELEM-005 — Collegamento

Linee/frecce servono a collegare visivamente elementi della board.

Non modificano wikilink o relazioni del dominio note salvo futura feature esplicita.

---

# 5. Asset e portabilità

## BRD-ASSET-001 — Nessun riferimento persistente a file esterni

Una board salvata non può dipendere da path assoluti verso file esterni alla cartella della campagna.

Gli asset persistenti della board devono essere contenuti nella campagna e referenziati tramite path relativi o identificatori portabili.

## BRD-ASSET-002 — Drag di file esterno = import

Se l'utente trascina sulla board un file esterno alla campagna, l'app lo **importa** automaticamente nella cartella della campagna prima di creare l'elemento board.

Flusso concettuale:

```text
file esterno
→ copia/import nella campagna
→ riferimento portabile interno
→ elemento sulla board
```

L'utente non deve essere obbligato a copiare manualmente il file prima del drag & drop.

La cartella di destinazione interna esatta (`Assets/` o struttura equivalente) verrà fissata nella storage spec della board prima dell'implementazione.

## BRD-ASSET-003 — Eliminare elemento non elimina asset

Rimuovere un elemento immagine dalla board non cancella automaticamente il file asset dalla campagna.

La gestione/rimozione fisica degli asset è un'azione separata ed esplicita.

## BRD-ASSET-004 — Confine di sicurezza

La pubblicazione live può caricare o rendere disponibili soltanto asset già importati nella campagna e scelti esplicitamente per la condivisione.

La board non deve diventare un percorso implicito per esporre file arbitrari del computer del DM.

---

# 6. Visibilità live

## BRD-LIVE-001 — Visibilità per elemento

Gli elementi della board preparata possono avere uno stato di visibilità live controllato dal DM.

La presenza di un elemento nella board non implica che il giocatore possa vederlo.

## BRD-LIVE-002 — Elementi privati non vengono inviati

Un elemento privato non deve essere inviato al client giocatore e poi nascosto soltanto via CSS/UI.

Finché non viene pubblicato/revealed, il client giocatore non deve riceverne contenuto sensibile, testo, asset o metadata non necessari.

## BRD-LIVE-003 — Board live come proiezione

La board live contiene soltanto lo stato necessario ai giocatori in quel momento.

Il relay/client non riceve automaticamente l'intero file della board preparata con contenuti privati.

---

# 7. Vista dei giocatori

## BRD-PLAYER-001 — Pan e zoom indipendenti

Ogni giocatore può usare pan e zoom indipendenti.

La camera del DM non trascina continuamente la visuale di tutti i giocatori.

## BRD-PLAYER-002 — Porta tutti qui

Il DM dispone di un comando esplicito equivalente a **Porta tutti qui** per suggerire/impostare ai client la camera su una specifica zona della board.

Questo comando è distinto dalla normale navigazione della camera del DM.

## BRD-PLAYER-003 — Ping

Il giocatore può indicare temporaneamente un punto della board con un ping condiviso.

Il ping è stato live effimero e non modifica la board persistente.

## BRD-PLAYER-004 — Controllo token limitato

Il giocatore può muovere soltanto token che gli sono stati assegnati/autorizzati.

Il client invia una richiesta; il lato autorevole valida il permesso prima di accettare e propagare la nuova posizione.

---

# 8. Sincronizzazione live

## BRD-SYNC-001 — Non è video streaming

La board non viene condivisa come flusso video o sequenza continua di screenshot.

Il client giocatore renderizza localmente una rappresentazione strutturata della board live.

## BRD-SYNC-002 — Snapshot iniziale

Al join o reconnect, il client riceve uno snapshot dello stato pubblico corrente sufficiente a ricostruire la board live.

Lo snapshot contiene riferimenti agli asset pubblicati e stato strutturato degli elementi, non file locali del DM.

## BRD-SYNC-003 — Aggiornamenti incrementali

Dopo lo snapshot, le modifiche vengono propagate come eventi incrementali, per esempio:

```text
token.move
element.reveal
element.hide
element.update
camera.focus
ping.create
```

I nomi definitivi degli eventi appartengono a `PROTOCOL_SPEC.md`.

## BRD-SYNC-004 — Asset separati dagli eventi realtime

Gli asset pesanti vengono pubblicati/caricati separatamente e referenziati tramite identificatori/URL autorizzati.

Non vengono reinviati dentro ogni evento realtime e non devono essere trasmessi come grandi payload Base64 nei WebSocket.

## BRD-SYNC-005 — Reconnect tramite snapshot corrente

Un client riconnesso non deve dipendere dall'aver ricevuto tutta la cronologia degli eventi precedenti.

Dopo reconnect può richiedere/ricevere uno snapshot corrente e riprendere gli aggiornamenti incrementali da quello stato.

---

# 9. Funzioni deliberatamente escluse dalla prima board

La prima versione non richiede:

- fog of war avanzato;
- righelli tattici;
- template di incantesimi;
- iniziativa;
- dadi integrati;
- griglia tattica avanzata;
- automazioni complete da VTT;
- rules engine.

Queste feature potranno essere aggiunte soltanto quando l'uso reale ne dimostrerà la necessità.

---

# 10. Decisioni ancora aperte

Prima di chiudere la spec V0.2 restano da definire almeno:

- UX precisa della card di nota collegata e del suo contenuto pubblico;
- formato persistente/versionato della board;
- cartella e policy esatta degli asset importati;
- comportamento dettagliato di gruppi, z-order e locking;
- eventuale snap/griglia di base;
- UX del salvataggio dello stato finale live nella board preparata.

---

## Regola finale

La board deve poter essere preparata e conservata localmente come parte della campagna, mentre la sessione live ne pubblica soltanto una proiezione esplicita, limitata e ricostruibile per i giocatori.
