# Campaign Manager v2

Applicazione locale Windows in Electron, React e TypeScript. La cartella della campagna resta la fonte autorevole: note Markdown normali e un `campaign.json` minimo.

## Sviluppo locale

Prerequisiti: Windows, Node.js 24.15 o superiore, npm. Setup verificato con Node.js 24.15.0 e npm 11.12.1.

```powershell
npm ci
npm start
```

L'installazione scarica il runtime Electron. L'uso della campagna non richiede rete o account.

## Stato: V0.3 — Live web standalone completata

La V0.3 aggiunge una sessione live temporanea sopra la campagna locale, senza trasformare il relay nella fonte autorevole dei file. Il desktop genera un codice sessione, i giocatori entrano da browser senza account e ricevono solo la proiezione pubblica della board attiva.

Il DM può pubblicare/cambiare board, rivelare o nascondere elementi, assegnare un controller giocatore a ciascun token, spostare qualunque token, fare focus one-shot con `Porta tutti qui` e terminare esplicitamente la sessione. I giocatori mantengono pan/zoom locale, possono fare ping e trascinare soltanto i token assegnati. Preview di drag e ping sono effimeri; il commit finale del token viene validato dal relay e aggiornato con `stateSeq`.

Le board preparate restano distinte dallo stato live. Reveal/hide, partecipanti, permessi, camera e ping non vengono scritti nei file locali. Alla fine della sessione il DM può scegliere se copiare nelle board preparate esclusivamente le posizioni finali dei token oppure lasciare tutto com'era.

La live usa un relay Cloudflare Worker con Durable Objects e R2 per gli asset pubblicati. Se il master perde la connessione, la sessione entra in `host_reconnecting` per 10 minuti: lo stato pubblico resta visibile ma nuove mutazioni e join vengono congelati. Se il desktop torna con la credenziale runtime valida, riprende la stessa sessione; allo scadere la sessione termina senza scrivere automaticamente sulle board locali. Una chiusura volontaria dell'app richiede invece di terminare la live.

La V0.2 continua a fornire le board locali portabili in `Boards/*.board.json`: canvas pan/zoom, testo, immagini in `Assets/Board/`, token, linee/frecce, card nota/estratto, gruppi semplici, lock, z-order, undo/redo, recovery e conflitti. La V0.1 resta la base locale per note Markdown, wikilink, ricerca, grafo e filesystem guardrail.

## Persistenza e isolamento

Le modifiche non ancora salvate hanno recovery separate. Alla chiusura o al cambio di nota/campagna l'app tenta il salvataggio; in caso di conflitto richiede risoluzione o conservazione della bozza. Tutte le tab sono verificate prima di chiudere la campagna.

Preferenze, recovery e record di riparazione risiedono sotto `app.getPath('userData')/local`, fuori dal vault. Il `campaignId` conserva la correlazione dopo uno spostamento. Una copia con lo stesso ID richiede la scelta esplicita di separazione.

Il renderer non dispone di Node.js o filesystem: il preload espone il protocollo applicativo con comandi verificati nel processo principale. Sandbox, isolamento del contesto, CSP locale e blocco di navigazione e finestre esterne restano attivi.

## Verifiche

```powershell
npm test
npm run build
npm run test:live-network
```

I test usano directory temporanee e includono fault injection per disco pieno, accesso negato, root mancante, recovery e interruzioni degli spostamenti. La suite copre anche protocollo live, privacy, permessi token, reconnect host/player, timeout, fine sessione e apply/discard delle posizioni finali. `test:live-network` avvia `wrangler dev` e verifica in loopback 1 host + 8 player WebSocket, burst di preview e commit finale autorevole.

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

Per il prossimo lavoro seguire `AGENTS.md`, `docs/SPEC_INDEX.md` e il goal pertinente. La V0.3 standalone è in stato verificato; il prossimo gradino previsto dalla roadmap è la V0.4 Discord Activity.
