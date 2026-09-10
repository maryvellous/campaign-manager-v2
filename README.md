# Campaign Manager v2

Applicazione locale Windows in Electron, React e TypeScript. La cartella della campagna resta la fonte autorevole: note Markdown normali e un `campaign.json` minimo.

## Sviluppo locale

Prerequisiti: Windows, Node.js 24.15 o superiore, npm. Setup verificato con Node.js 24.15.0 e npm 11.12.1.

```powershell
npm ci
npm start
```

L'installazione scarica il runtime Electron. L'uso della campagna non richiede rete o account.

## Stato: V0.2 — Goal V02-1 completato

La shell comprende topbar, rail, albero delle note, area centrale con tab e inspector. I pannelli si possono ridimensionare e chiudere. Note, Recenti, Preferiti, Ricerca e Grafo sono tutti attivi in modo locale e coerente con la roadmap V0.1.

La campagna locale è operativa in pieno: apertura e chiusura, filesystem guardrail, save/recovery, conflitti, rinnovo di tab e preferenze, draft, move/rename/trash, wikilink risolti e backup. La UI tiene conto dei placeholder onesti per Compendio e Account, senza introdurre rete o account artificiali.

V02-1 aggiunge board locali preparate in `Boards/*.board.json`: creazione, apertura, rename, canvas freeform con pan/zoom, testo, immagini e import portabile in `Assets/Board/`. Gli elementi supportano selezione, movimento, resize, lock, z-order e undo/redo minimo. Il salvataggio usa revisioni e scrittura sicura; le modifiche board hanno recovery locale separata e il conflitto esterno non sovrascrive il file autorevole. Token e collegamenti visuali restano parte del successivo Goal V02-2.

Una nuova nota resta una bozza senza file finché non contiene testo significativo. Il titolo deriva dalle prime tre parole visibili: con tre parole il normale autosalvataggio la materializza dopo una breve pausa; con una o due parole bastano Salva, navigazione o chiusura. Una collisione richiede la correzione esplicita del titolo. Le bozze vuote o composte soltanto da marcatori non producono file o recovery.

L'albero consente filtro per nome, creazione cartelle, rinomina, spostamento tramite trascinamento o comando e cestino con conferma. Rinomine e spostamenti aggiornano i wikilink risolti, preservando riferimenti ambigui, mancanti e codice. Le operazioni interrotte hanno un record locale e un'azione di riparazione che preserva le modifiche esterne.

La navigazione ordinaria riusa la tab corrente; Ctrl+clic apre una nota in una nuova tab, attivando quella esistente se già aperta. Ogni tab conserva la propria cronologia. Preferiti, recenti, tab e dimensioni dei pannelli sono preferenze locali della campagna.

Il flusso editoriale è completo: salvataggio autorevole, recovery, rilettura esterna, conflitto e risoluzione; la ricerca locale e la proiezione grafo derivano da note e wikilink risolti; la campagna continua a funzionare anche se la cartella viene spostata o resa non disponibile e il relink automatico è verificato con `campaignId`.

Scorciatoie: `Ctrl+S` salva; `Ctrl+K` apre la palette, navigabile con frecce, Invio ed Esc. I separatori dei pannelli sono utilizzabili da tastiera. La preview Markdown e l'interazione wikilink sono integrate nell'editor; la ricerca locale e il grafo sono disponibili e ricostruibili dal patrimonio autorevole.

## Persistenza e isolamento

Le modifiche non ancora salvate hanno recovery separate. Alla chiusura o al cambio di nota/campagna l'app tenta il salvataggio; in caso di conflitto richiede risoluzione o conservazione della bozza. Tutte le tab sono verificate prima di chiudere la campagna.

Preferenze, recovery e record di riparazione risiedono sotto `app.getPath('userData')/local`, fuori dal vault. Il `campaignId` conserva la correlazione dopo uno spostamento. Una copia con lo stesso ID richiede la scelta esplicita di separazione.

Il renderer non dispone di Node.js o filesystem: il preload espone il protocollo applicativo con comandi verificati nel processo principale. Sandbox, isolamento del contesto, CSP locale e blocco di navigazione e finestre esterne restano attivi.

## Verifiche

```powershell
npm test
npm run build
```

I test usano directory temporanee e includono fault injection per disco pieno, accesso negato, root mancante, recovery e interruzioni degli spostamenti. La suite finale verifica i flussi core della V0.1: campagna, note, recovery, wikilink, rename/move/trash, ricerca, grafo e hardening di filesystem. Il controllo di build è incluso per confermare che il codice TypeScript resta coerente con il runtime app.

Nel sandbox Codex Windows, test e bundler possono richiedere accesso locale esteso per leggere le informazioni utente e risolvere le directory dei moduli.

## Organizzazione

- `packages/core/src`: identificatori, metadata, errori e policy di percorso.
- `apps/desktop/infrastructure`: filesystem, revisioni, watcher e storage locale.
- `apps/desktop/application`: documenti, tab, recovery, conflitti e organizzazione della campagna.
- `apps/desktop/main.ts` e `preload.ts`: integrazione Electron e confine IPC.
- `apps/desktop/renderer`: interfaccia React.
- `tests`: verifiche di dominio, storage e applicazione.

Per il prossimo lavoro seguire `AGENTS.md`, `docs/SPEC_INDEX.md` e il goal pertinente. I documenti di prodotto esistenti non sono stati modificati; la V0.1 locale è in stato verificato e coerente con la roadmap di goal 4 e 5.
