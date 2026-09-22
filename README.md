# Campaign Manager v2

Applicazione locale Windows in Electron, React e TypeScript. La cartella della campagna resta la fonte autorevole: note Markdown normali e un `campaign.json` minimo.

## Sviluppo locale

Prerequisiti: Windows, Node.js 24.15 o superiore, npm. Setup verificato con Node.js 24.15.0 e npm 11.12.1.

```powershell
npm ci
npm start
```

L'installazione scarica il runtime Electron. L'uso della campagna non richiede rete o account.

## Stato: V0.5 — Assistente IA completato

La V0.5 aggiunge un Assistente IA opzionale senza rendere la campagna dipendente dalla rete. Il provider attualmente supportato è OpenAI; la API key viene conservata tramite storage sicuro di Electron nel profilo locale dell'app e non entra nel vault, nelle board o nella live.

L'Assistente ha un workspace centrale con conversazione locale per campagna, cancel/error states e selezione esplicita del contesto. Può rispondere usando la campagna intera tramite retrieval lessicale controllato, una singola nota o una selezione testuale. Solo le note effettivamente lette vengono mostrate come fonti cliccabili; l'intero vault non viene inviato automaticamente e recovery/dirty buffer non entrano nel retrieval di campagna senza una selezione esplicita.

Le risposte testuali non modificano mai la campagna. Per scrivere, l'Assistente deve creare una proposta esplicita: modifica di una singola nota oppure nuova nota. La proposta resta fuori dal vault, può essere modificata o scartata e richiede un gesto esplicito per Applica/Crea nota. Le modifiche usano i normali salvataggi revision-safe della campagna, quindi una proposta stale non può sovrascrivere una versione più recente.

La V0.4 Discord Activity resta implementata e verificata in CI. Il solo gate esterno ancora aperto è il collaudo end-to-end dentro un vero client Discord, che richiede interazione manuale con Discord/Cloudflare ma non blocca lo sviluppo locale successivo.

La V0.3 continua a fornire la sessione live standalone temporanea, con relay Cloudflare Worker, Durable Objects e R2, mentre la V0.2 mantiene le board locali portabili e la V0.1 la base note Markdown/wikilink/search/grafo.

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

Per il prossimo lavoro seguire `AGENTS.md`, `docs/SPEC_INDEX.md` e il goal pertinente. La V0.5 è implementata e verificata in CI. Il prossimo gradino è la V0.6 Personaggi + ganci integrazione; il collaudo reale della Discord Activity resta un gate operativo esterno separato.
