# Campaign Manager v2

Applicazione locale Windows in Electron, React e TypeScript. La cartella della campagna resta la fonte autorevole: note Markdown normali e un `campaign.json` minimo.

## Sviluppo locale

Prerequisiti: Windows, Node.js 24.15 o superiore, npm. Setup verificato con Node.js 24.15.0 e npm 11.12.1.

```powershell
npm ci
npm start
```

L'installazione scarica il runtime Electron. L'uso della campagna non richiede rete o account.

## Stato: V0.1 — Goal 2

La shell comprende topbar, rail, albero delle note, area centrale con tab e inspector. I pannelli si possono ridimensionare e chiudere. Note, Recenti e Preferiti sono utilizzabili; Ricerca e Grafo conservano il posto per i goal successivi. Compendio mostra «In arrivo» e Account, nelle Impostazioni, spiega che non serve un account per le campagne locali.

Una nuova nota resta una bozza senza file finché non contiene testo significativo. Il titolo deriva dalle prime tre parole visibili: con tre parole il normale autosalvataggio la materializza dopo una breve pausa; con una o due parole bastano Salva, navigazione o chiusura. Una collisione richiede la correzione esplicita del titolo. Le bozze vuote o composte soltanto da marcatori non producono file o recovery.

L'albero consente filtro per nome, creazione cartelle, rinomina, spostamento tramite trascinamento o comando e cestino con conferma. Rinomine e spostamenti aggiornano i wikilink risolti, preservando riferimenti ambigui, mancanti e codice. Le operazioni interrotte hanno un record locale e un'azione di riparazione che preserva le modifiche esterne.

La navigazione ordinaria riusa la tab corrente; Ctrl+clic apre una nota in una nuova tab, attivando quella esistente se già aperta. Ogni tab conserva la propria cronologia. Preferiti, recenti, tab e dimensioni dei pannelli sono preferenze locali della campagna.

Scorciatoie: `Ctrl+S` salva; `Ctrl+K` apre la palette, navigabile con frecce, Invio ed Esc. I separatori dei pannelli sono utilizzabili da tastiera. L'editor attuale è testuale: preview Markdown e interazione wikilink appartengono al Goal 3; ricerca completa e grafo al Goal 4.

## Persistenza e isolamento

Le modifiche non ancora salvate hanno recovery separate. Alla chiusura o al cambio di nota/campagna l'app tenta il salvataggio; in caso di conflitto richiede risoluzione o conservazione della bozza. Tutte le tab sono verificate prima di chiudere la campagna.

Preferenze, recovery e record di riparazione risiedono sotto `app.getPath('userData')/local`, fuori dal vault. Il `campaignId` conserva la correlazione dopo uno spostamento. Una copia con lo stesso ID richiede la scelta esplicita di separazione.

Il renderer non dispone di Node.js o filesystem: il preload espone il protocollo applicativo con comandi verificati nel processo principale. Sandbox, isolamento del contesto, CSP locale e blocco di navigazione e finestre esterne restano attivi.

## Verifiche

```powershell
npm run lint
npm test
npm run build
npm run test:electron
npm run test:goal2
```

I test usano directory temporanee e includono fault injection per disco pieno, accesso negato e interruzioni degli spostamenti. `test:electron` avvia l'app reale con profilo isolato e verifica salvataggio, riavvio, conflitto, recovery e cestino Windows: soltanto la nota temporanea viene cestinata. `test:goal2` verifica la shell e i flussi di creazione, organizzazione, tab, preferiti, palette e placeholder. Le schermate vengono salvate in `work/goal1-electron.png` e `work/goal2-electron.png`, ignorate da Git.

Nel sandbox Codex Windows, test e bundler possono richiedere accesso locale esteso per leggere le informazioni utente e risolvere le directory dei moduli.

## Organizzazione

- `packages/core/src`: identificatori, metadata, errori e policy di percorso.
- `apps/desktop/infrastructure`: filesystem, revisioni, watcher e storage locale.
- `apps/desktop/application`: documenti, tab, recovery, conflitti e organizzazione della campagna.
- `apps/desktop/main.ts` e `preload.ts`: integrazione Electron e confine IPC.
- `apps/desktop/renderer`: interfaccia React.
- `tests`: verifiche di dominio, storage e applicazione.

Per il prossimo lavoro seguire `AGENTS.md`, `docs/SPEC_INDEX.md` e il goal pertinente. I documenti di prodotto esistenti non sono stati modificati.
