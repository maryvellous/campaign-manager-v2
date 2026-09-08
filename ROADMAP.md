# Campaign Manager v2 — Roadmap

## Principio

La roadmap descrive **ordine logico**, non burocrazia.

Le vecchie micro-fasi non devono diventare automaticamente un branch, prompt o progetto ciascuna. Preferire pochi goal verticali grandi con gate chiari.

---

# V0.1 — Campaign Manager locale

Fonte normativa principale: `docs/V01_OPERATIONAL_SPEC.md`.

Obiettivo finale:

```text
apri una cartella campagna
→ organizza note/cartelle
→ scrivi e collega Markdown
→ cerca/naviga/grafo
→ chiudi e riapri senza perdere nulla
```

Supporto ufficiale iniziale: Windows.

## Goal 1 — Fondazione + filesystem/campagna

Include:

- workspace TypeScript/Electron/React;
- build/test/lint;
- preload/IPC sicuro;
- apertura e inizializzazione cartella;
- `campaign.json` minimo;
- CampaignId e recent paths;
- path policy;
- repository filesystem;
- safe save/revision/conflict;
- system trash;
- watcher modifiche esterne;
- recovery semplice;
- preferenze locali separate.

Gate:

- app avviabile;
- campagna reale apribile;
- save non simulato;
- nessun overwrite silenzioso;
- filesystem resta comprensibile senza app.

## Goal 2 — Shell + note + cartelle

Include:

- shell approvata;
- rail/sidebar/center/inspector;
- recenti/preferiti;
- CRUD completo cartelle;
- nuova nota come draft;
- titolo automatico prime 1–3 parole;
- tab/history;
- rename/move/trash;
- command palette base;
- vista `Compendio` come **placeholder WIP neutro**, senza rete o dataset.

Gate:

- lavoro quotidiano sul vault rapido e prevedibile;
- nessuna funzione placeholder finge di essere già attiva.

## Goal 3 — Editor + save + wikilink

Include:

- Markdown editor/read mode;
- autosave;
- recovery;
- conflitti esterni;
- CommonMark + GFM;
- wikilink canonicali;
- missing/ambiguous;
- backlink;
- rename/move con rewrite sicuro dei link;
- piccolo repair record se una operazione multi-file resta incompleta.

Gate:

- nessun percorso normale perde modifiche;
- rename/move non sovrascrive file concorrenti;
- link ambigui non vengono risolti arbitrariamente.

## Goal 4 — Search + graph

Include:

- filtro sidebar;
- full-text locale derivato;
- command palette note+azioni;
- graph derivato dai wikilink;
- colori cartella;
- filtri folder;
- stato graph locale utile.

Non include alias/frontmatter applicativi, embeddings o vector DB.

Gate:

- search/backlink/graph possono essere cancellati e ricostruiti;
- 200 note / 15 cartelle è il dataset minimo di validazione;
- fixture più grandi sono stress test informativi, non gate arbitrari.

## Goal 5 — UX polish + hardening

Include:

- design direction;
- focus/keyboard/accessibilità;
- viewport 1440×900, 1024×768, 720×600;
- zoom testo 200%;
- error/empty/loading states;
- crash/recovery smoke test;
- packaging Windows;
- verifica case rename, watcher, trash, root spostata/non disponibile.

Gate finale V0.1:

- flussi critici E2E verdi;
- nessun bug noto di perdita dati;
- nessun falso `saved`;
- documentazione normativa coerente con il codice reale.

---

# V0.2 — Board locale

Fonte: `docs/BOARD_SPEC.md`.

Obiettivo:

```text
crea board
→ aggiungi testo/immagini/token/estratti
→ organizza
→ salva
→ chiudi/riapri
```

Include:

- `*.board.json`;
- sei strumenti;
- import asset portabile;
- z-order/lock/gruppi;
- note collegate e card da estratto;
- token;
- undo/redo;
- save/recovery/conflict;
- visibilità preparata per il futuro live.

Esclude volutamente griglia tattica, fog avanzato, iniziativa, dadi, line of sight, macro e rules automation.

Gate:

- board affidabile offline;
- nessun path esterno fragile;
- nessuna esposizione involontaria del Markdown privato.

---

# V0.3 — Live session web standalone

Fonti:

- `docs/BOARD_SPEC.md`;
- `docs/LIVE_SESSION_SPEC.md`;
- `docs/PROTOCOL_SPEC.md`.

Obiettivo:

```text
desktop → Avvia sessione
→ player entra via join code web
→ board pubblica
→ token/ping
→ reconnect
→ fine sessione
```

Decisioni:

- un host DM;
- una live session attiva per desktop;
- join code web;
- niente account obbligatorio;
- una board visibile alla volta;
- più board preservabili nella stessa sessione;
- privati mai inviati;
- un token = massimo un controller giocatore;
- snapshot per reconnect/resync;
- host disconnect → freeze + 10 minuti di grace;
- asset pubblicati on-demand e temporanei;
- niente pairing Discord in V0.3;
- niente event sourcing/replay cloud.

Gate:

- 1 host + 8 player come fixture minima;
- join/reconnect;
- switch board;
- token autorizzato/non autorizzato;
- host reconnect/timeout;
- snapshot/resync;
- end session.

---

# V0.4 — Discord Activity

Fonte: `docs/DISCORD_ACTIVITY_SPEC.md`.

Obiettivo:

```text
live session V0.3 già attiva
→ master collega una Activity instance
→ giocatori: Unisciti all'attività
→ stessa esperienza player
```

Discord aggiunge soltanto:

- Activity instance;
- pairing master-only;
- identity Discord verificata;
- join senza codice per i giocatori.

Non aggiunge un secondo protocollo, un vault Discord o un bot obbligatorio.

---

# V0.5 — IA

Prima dell'implementazione va prodotto `docs/AI_SPEC.md` basato su casi d'uso reali.

Guardrail già fissati:

- IA può leggere/cercare/proporre;
- non scrive arbitrariamente sul filesystem;
- modifiche persistenti passano dai normali servizi applicativi e dall'approvazione utente;
- embeddings/vector DB solo se misure reali ne mostrano il bisogno.

---

# Compendio — hook oggi, servizio futuro

Fonte: `docs/COMPENDIUM_SPEC.md`.

Nella shell può esistere già la vista `Compendio` come placeholder WIP.

Il vero Compendio verrà implementato quando esisterà l'enciclopedia cloud reale.

Direzione futura:

```text
consulta enciclopedia cloud
→ apri voce
→ Copia nelle note
→ normale Markdown locale indipendente
```

Non si costruisce oggi un dataset locale temporaneo.

---

# Futuro EcoGDR / personaggi / integrazioni

Si progettano soltanto quando diventano milestone reali e quando esistono contratti reali.

Seguono `docs/FOUNDATION_GUARDRAILS.md`.

---

## Regola finale

Ogni versione deve poter essere usata e validata prima di costruire la successiva.

Se un goal richiede infrastruttura di una versione futura solo “per sicurezza”, fermarsi e rivalutare.