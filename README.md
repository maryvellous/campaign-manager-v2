# Campaign Manager v2

Applicazione locale Windows in Electron, React e TypeScript. La cartella della campagna resta la fonte autorevole: note Markdown normali e un `campaign.json` minimo.

## Sviluppo locale

Prerequisiti: Windows, Node.js 24.15 o superiore, npm. Setup verificato con Node.js 24.15.0 e npm 11.12.1.

```powershell
npm ci
npm start
```

L'installazione scarica il runtime Electron. L'uso della campagna non richiede rete o account.

## Packaging Windows

Il pacchetto Windows usa NSIS e viene costruito realmente su un runner Windows della CI. In locale:

```powershell
npm ci
npm run package:win
```

L'output viene scritto in `release/` come `Diaspro-RPG-Campaign-Manager-<version>-Setup.exe`. La CI verifica che l'installer venga prodotto e lo conserva come artifact temporaneo. L'installer è attualmente **non firmato**: code signing e publisher verificato restano un passaggio di distribuzione separato perché richiedono un certificato/credenziali reali.

## Stato: V0.7 — Stabilizzazione e usabilità

La V0.7 chiude i principali problemi emersi nell’uso reale prima della verifica pubblica della Discord Activity. Il lavoro non aggiunge un nuovo sottosistema: rende affidabili e comprensibili i flussi già previsti.

Le nuove note hanno ora un lifecycle esplicito: `Salva nota` crea realmente il file Markdown e `Annulla creazione` chiude la bozza senza materializzarla. Scartare le modifiche di una nota esistente ricarica invece la versione su disco mantenendo aperta la tab. Note e cartelle dispongono inoltre di un vero menu contestuale con tasto destro; il menu `…` usa la stessa definizione di azioni e resta disponibile per accessibilità e uso touch.

La Board mantiene il formato locale esistente ma rende visibili i passaggi di creazione: strumenti con etichette chiare, suggerimenti contestuali, stato vuoto con CTA, creazione guidata dei token con avatar opzionale, immagini posizionate nella viewport e inspector dell’elemento selezionato. Da una Board si può passare direttamente a `Avvia live con questa board`.

La schermata Live segue ora il percorso `Prepara board → Avvia live → Fai entrare i giocatori → Gestisci la scena`. Prima dell’avvio si sceglie la board iniziale; dopo l’avvio codice e link giocatore sono il punto centrale. La modalità web resta autonoma e Discord Activity è presentata come accesso alternativo alla stessa sessione, con pairing guidato.

L’Assistente IA renderizza le risposte e le proposte come Markdown formattato, mantiene le fonti consultate collassabili e integra le proposte nella conversazione con anteprima, differenze opzionali, modifica del Markdown, applicazione e scarto. Richieste naturali come “modifica” o “riscrivi questa nota” possono preparare automaticamente una proposta quando il contesto è una nota; nessuna modifica viene scritta senza approvazione esplicita.

La V0.6 resta la base per i personaggi collegati alle note tramite `characterNoteId`. La V0.5 continua a fornire l’Assistente opzionale con provider OpenAI, Anthropic, Google Gemini e DeepSeek. La V0.4 Live/Discord usa ancora lo stesso relay e la stessa Activity già collaudata fino al pairing master, consenso OAuth, autenticazione e ingresso nella sessione. Il collaudo manuale con più partecipanti reali e la verifica pubblica Discord restano passi successivi alla stabilizzazione.

## Persistenza e isolamento

Le modifiche non ancora salvate hanno recovery separate. Alla chiusura o al cambio di nota/campagna l'app tenta il salvataggio; in caso di conflitto richiede risoluzione o conservazione della bozza. Tutte le tab sono verificate prima di chiudere la campagna.

Preferenze, recovery e record di riparazione risiedono sotto `app.getPath('userData')/local`, fuori dal vault. Il `campaignId` conserva la correlazione dopo uno spostamento. Una copia con lo stesso ID richiede la scelta esplicita di separazione.

Il renderer non dispone di Node.js o filesystem: il preload espone il protocollo applicativo con comandi verificati nel processo principale. Sandbox, isolamento del contesto, CSP locale e blocco di navigazione e finestre esterne restano attivi.

## Verifiche

```powershell
npm test
npm run build
npm run test:electron
npm run test:goal2
npm run test:goal3
npm run test:v07
npm run test:live-network
```

I test usano directory temporanee e includono fault injection per disco pieno, accesso negato, root mancante, recovery e interruzioni degli spostamenti. Gli smoke Electron coprono anche salvataggio e annullamento di nuove note, menu contestuale, rendering Markdown, strumenti Board e percorso iniziale Live. La suite copre anche protocollo live, privacy, permessi token, reconnect host/player, timeout, fine sessione e apply/discard delle posizioni finali. `test:live-network` avvia `wrangler dev` e verifica in loopback 1 host + 8 player WebSocket, burst di preview e commit finale autorevole.

Nel sandbox Codex Windows, test e bundler possono richiedere accesso locale esteso per leggere le informazioni utente e risolvere le directory dei moduli.

## Organizzazione

- `packages/core/src`: identificatori, metadata, errori e policy di percorso.
- `apps/desktop/infrastructure`: filesystem, revisioni, watcher e storage locale.
- `apps/desktop/application`: documenti, tab, recovery, board, proiezione privacy e client live host.
- `apps/desktop/main.ts` e `preload.ts`: integrazione Electron e confine IPC.
- `apps/desktop/renderer`: interfaccia React desktop.
- `apps/activity`: client web standalone del giocatore.
- `services/relay`: Worker, Durable Objects, lifecycle e asset live.
- `packages/protocol`: contratto runtime condiviso desktop/relay/player.
- `tests`: verifiche di dominio, storage, protocollo e lifecycle live.

Per il prossimo lavoro seguire `AGENTS.md`, `docs/SPEC_INDEX.md` e il goal pertinente. Le versioni autocontenute della roadmap fino alla V0.6 restano implementate; la V0.7 è il passaggio di stabilizzazione e UX prima della distribuzione più ampia. I milestone successivi richiedono contratti esterni reali: backend/dataset cloud per Auth/Compendio oppure API reali per EcoGDR. Per Discord restano il collaudo manuale multi-partecipante e la verifica pubblica dell’Activity dopo la chiusura dei gate V0.7.
