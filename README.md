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

## Stato: V0.6 — Personaggi collegati alle note

La V0.6 permette di usare una normale nota Markdown come riferimento di un personaggio senza introdurre un database o un formato scheda proprietario. Un token può avere un collegamento opzionale `characterNoteId`; dal token il DM può collegare, sostituire, scollegare o aprire la nota associata. Se la nota viene rinominata o spostata tramite Campaign Manager, il riferimento viene aggiornato anche nelle recovery delle board senza modificare automaticamente il nome personalizzato del token.

Da una nota è disponibile anche `Crea token da questa nota…`: si sceglie la board, poi un click sulla scena posiziona un token con nome iniziale derivato dal titolo e link già impostato; `Esc` annulla. Aprire la nota personaggio dalla board non perde la board corrente, che viene ripristinata tornando alla vista Board. Una nota mancante produce soltanto un warning per il DM e il token continua a funzionare.

Il collegamento resta privato: la proiezione player non contiene `characterNoteId` né Markdown della nota. Il giocatore può vedere soltanto che un token controllato è il proprio token, usando i normali permessi live già esistenti. I token generici senza nota restano invariati.

Il Goal V06-2 non aggiunge oggi adapter o UI di integrazione fittizi. La specifica mantiene un confine futuro per provider personaggio reali, ma finché non esiste un contratto API concreto non vengono creati framework plugin, provider EcoGDR/BeFolder simulati o sincronizzazioni implicite.

La V0.5 Assistente IA resta opzionale e local-first: retrieval controllato con fonti verificabili, proposte di modifica/new-note non autorevoli e applicazione soltanto dopo approvazione esplicita. La V0.4 Discord Activity è implementata, verificata in CI e collaudata dentro un vero client Discord fino a pairing master, consenso OAuth, autenticazione e ingresso nella live session. Il test manuale con più partecipanti reali nella stessa Activity resta un collaudo separato.

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

Per il prossimo lavoro seguire `AGENTS.md`, `docs/SPEC_INDEX.md` e il goal pertinente. Le versioni autocontenute previste dalla roadmap fino alla V0.6 sono implementate e verificate in CI. I milestone successivi richiedono contratti esterni reali: backend/dataset cloud per Auth/Compendio oppure API reali per EcoGDR. Il flusso reale Discord Activity è stato verificato fino all’ingresso autenticato nella live session; resta soltanto il collaudo manuale multi-partecipante.
