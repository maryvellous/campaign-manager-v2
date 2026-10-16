# AGENTS.md — Campaign Manager v2

## Strumenti e responsabilità
- ChatGPT in chat gestisce codebase, documentazione, branch, commit, PR e review direttamente su GitHub, anche per modifiche estese.
- Codex interviene solo quando servono browser interattivo, build/test locali, avvio dell'app, debug runtime, verifiche visive e collaudi operativi. Non duplicare su Codex attività possibili via GitHub.
- Nel lavoro misto ChatGPT implementa, Codex collauda e riferisce i problemi, ChatGPT corregge su GitHub; Codex modifica codice se indispensabile al test locale o se richiesto espressamente.
- Non incaricare l'utente di operazioni eseguibili dall'agente.

## Metodo comune
- Lavora per goal completi, non per micro-task; autonomo nelle scelte tecniche, non nelle decisioni di prodotto.
- Rispetta comportamenti, decisioni e fonti approvate. Fermati solo se un conflitto irrisolto cambia prodotto, privacy/sicurezza, dati o scope.
- Mantieni il diff focalizzato: niente refactor opportunistici, astrazioni o integrazioni per versioni future, servizi superflui, costi ricorrenti o processi inventati.
- Preserva infrastrutture, codice e dati funzionanti; leggi solo i documenti pertinenti al lavoro.
- Distingui implementazione, commit, CI, prove locali e rilascio. Una build verde non equivale al collaudo funzionale: riporta comandi e risultati, oppure «non eseguiti».
- Controlla branch/PR prima di intervenire; niente segreti nei commit, niente force-push, deploy produzione o operazioni distruttive senza incarico esplicito.

## Fonti e limiti del prodotto
- `docs/SPEC_INDEX.md` definisce ordine di autorità; poi seleziona il goal in `docs/IMPLEMENTATION_GOALS.md` e/o `ROADMAP.md`, e leggi solo le specifiche pertinenti. Mock e reference sono indizi visivi, non specifiche esaustive.
- Non inventare un comportamento «terzo» se due fonti confliggono: applica l'ordine di `SPEC_INDEX.md`. Decidi autonomamente solo dettagli che non cambiano il prodotto.
- Non implementare placeholder futuri, provider EcoGDR/BeFolder fittizi o integrazioni non attivate dalla roadmap.
- Nel Goal mode suddividi il goal in task senza chiedere conferma a ogni passo. Subagent solo se utili per verifiche davvero indipendenti; il main agent integra e verifica tutto.

## Struttura e verifiche
- Windows/Electron, Node >=24.15.0: `npm ci`, `npm start`, `npm run lint`, `npm test`, `npm run build`, `npm run test:live-network`; release installer con `npm run package:win`.
- `packages/core` dominio; `apps/desktop/application` logica e recovery; `apps/desktop/infrastructure` filesystem; `apps/desktop/renderer` UI; `apps/activity` player; `services/relay` live.
- Cartella campagna (Markdown + `campaign.json`) è la fonte canonica. Proteggere modifiche non salvate, recovery, isolamento host/player e confine IPC sandbox/preload.
- Verifica acceptance criteria, stati ed errori del goal, regressioni correlate e test di rete se pertinenti. Una prova con più partecipanti Discord reali richiede collaudo dedicato: non dedurla dai test automatici.
- Aggiorna progettazione solo se cambia davvero un comportamento approvato o viene trovata una contraddizione verificabile.
