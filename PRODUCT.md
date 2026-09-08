# PRODUCT.md — Diaspro RPG Campaign Manager v2

## 1. Scopo

**Diaspro RPG Campaign Manager v2** è un'applicazione desktop local-first per Dungeon Master che permette di organizzare, consultare e usare durante la partita il materiale di una campagna TTRPG.

Il prodotto deve rendere semplice:

- organizzare note e cartelle;
- collegare informazioni con wikilink;
- cercare e vedere relazioni tramite grafo;
- preparare board con mappe, immagini, testi e token;
- condividere ai giocatori soltanto ciò che il DM decide;
- usare un assistente IA opzionale senza perdere controllo sui file;
- aggiungere in futuro servizi cloud/integrations senza trasformare la campagna locale in un database remoto.

La **Desktop App del DM è il prodotto principale**.

---

# 2. Principio fondamentale

La v2 è un progetto nuovo.

La repository precedente resta soltanto:

- riferimento funzionale/storico;
- archivio di idee;
- eventuale fonte di formati/comportamenti da valutare;
- esempio di problemi architetturali da non ripetere.

Non è una base da refactorare e non si copia codice senza motivazione esplicita.

---

# 3. Utenti

## Dungeon Master

Il DM non deve dover capire database, server, networking o cloud per usare il prodotto.

Esperienza ideale:

```text
apri una cartella
→ scrivi e organizza
→ prepara una board
→ avvia una sessione
→ mostra solo ciò che vuoi
→ chiudi senza gestire infrastruttura
```

## Giocatori

Non installano Campaign Manager.

Durante il live usano un client web leggero, standalone o dentro Discord, per:

- vedere la board pubblica;
- fare pan/zoom/ping;
- muovere soltanto token assegnati.

---

# 4. Principi di prodotto

## Local-first

La cartella della campagna sul computer del DM è la fonte autorevole dei dati persistenti.

Note, board e asset devono restare utilizzabili senza Internet.

## Nessun lock-in

Formati principali:

- Markdown per note;
- JSON documentato per board/dati strutturati;
- normali cartelle/file per asset.

## Cloud soltanto quando serve

Il cloud entra per funzioni realmente remote:

- live relay;
- asset pubblicati temporaneamente;
- futuro Compendio cloud;
- future integrazioni.

Non ospita automaticamente il vault.

## Account opzionale

Campaign Manager funziona senza account.

Un futuro login viene richiesto soltanto da una feature cloud che ne abbia realmente bisogno.

## Modifiche esplicite

Collegare, copiare, pubblicare e sincronizzare sono azioni diverse.

Nessuna di queste implica automaticamente le altre.

## Complessità solo quando serve

Non si costruiscono framework, database, plugin system o layer perché “potrebbero servire”.

Se due soluzioni danno lo stesso comportamento, si preferisce quella con meno stato e meno manutenzione.

---

# 5. Desktop Campaign Manager

Responsabilità nel tempo:

- campagne locali;
- note/editor/lettura;
- wikilink/backlink;
- ricerca e grafo;
- board;
- strumenti live;
- configurazione IA opzionale;
- Compendio;
- ganci futuri account/integrazioni.

La Desktop App deve funzionare normalmente anche senza relay, Discord, IA, Compendio cloud o account.

---

# 6. Campagna e persistenza

Una campagna è una normale cartella.

Esempio possibile:

```text
My Campaign/
  Notes/
  Characters/
  Locations/
  Boards/
  Assets/
  campaign.json
```

La struttura non è imposta rigidamente.

`campaign.json` contiene soltanto metadata tecnici necessari, come `schemaVersion`, `campaignId` ed eventuale futuro `externalBinding`.

Preferenze UI, recovery, indici e credenziali non contaminano il vault.

---

# 7. Note

Le note sono Markdown.

Core:

- create/edit/rename/move/trash;
- cartelle;
- wikilink;
- backlink;
- ricerca;
- grafo.

Frontmatter dell'utente viene preservato, ma la V0.1 non introduce un sistema di metadata applicativi/alias solo perché sarebbe possibile.

Search/backlink/graph sono dati derivati e ricostruibili.

---

# 8. Board

Formato persistente:

```text
*.board.json
```

La board contiene:

- testo;
- immagini;
- token;
- card collegate alle note/estratti;
- gruppi semplici;
- collegamenti visuali.

La board preparata è distinta dallo stato live.

Asset esterni trascinati vengono importati nella campagna; una board salvata non dipende da path assoluti esterni.

Non è un VTT completo: niente griglia/LOS/automazioni/iniziativa come requisito iniziale.

---

# 9. Sessione live

Una sessione live è stato temporaneo distinto dai file campagna.

Contiene soltanto ciò che serve a giocare:

- board corrente e stato pubblico;
- partecipanti;
- token/controller;
- posizioni live;
- reveal/hide;
- presenza e stato sessione.

Il relay è autorevole sul runtime accettato, non sulla campagna.

Gli elementi privati non vengono inviati ai player e poi nascosti lato client.

Reconnect/resync usa snapshot corrente, non replay completo obbligatorio.

---

# 10. Player web e Discord

Il player web V0.3 funziona standalone con join code e senza account Campaign Manager.

La V0.4 aggiunge Discord come adapter:

- Activity instance;
- pairing master-only;
- identity Discord verificata;
- join giocatori senza codice manuale.

Discord non crea un secondo protocollo e non diventa l'autorità della sessione.

---

# 11. Relay e asset live

Il desktop apre soltanto connessioni outbound HTTPS/WSS.

Nessun tunnel/server pubblico sul PC del DM.

Tecnologia prevista, sostituibile se necessario:

- Cloudflare Worker;
- coordinatore stateful per sessione (previsto Durable Object);
- R2 o equivalente per copie temporanee degli asset pubblicati.

Gli asset live vengono caricati solo quando devono essere mostrati e possono essere rimossi dopo la sessione secondo policy operativa.

Il protocollo trasmette riferimenti, non Base64 pesante dentro ogni evento.

---

# 12. Compendio

Oggi il Compendio è una **destinazione UI WIP** senza backend/dataset finto.

Direzione futura:

```text
Compendio cloud
→ cerca/esplora
→ apri voce
→ leggi
→ Copia nelle note
→ Markdown locale indipendente
```

Il Campaign Manager non modifica la fonte canonica del Compendio.

Una copia locale non si sincronizza automaticamente con la voce cloud.

Se il vero servizio non richiede account, Campaign Manager non impone login artificiale.

Specifica: `docs/COMPENDIUM_SPEC.md`.

---

# 13. Autenticazione applicativa

Oggi:

```text
Impostazioni → Account
→ messaggio: account non necessario / in arrivo
```

Nessun login iniziale, avatar finto o token placeholder.

Futuro:

- auth contestuale quando una feature reale lo richiede;
- preferenza per browser/system auth flow;
- credenziali fuori dal vault;
- logout/session expiry degradano soltanto funzioni cloud;
- live Discord identity e API key IA restano sistemi distinti dall'account Campaign Manager.

Specifica: `docs/AUTHENTICATION_SPEC.md`.

---

# 14. Assistente IA V0.5

L'IA è opzionale.

Funzioni iniziali:

- domande sulla campagna;
- riassunti;
- confronto/contraddizioni;
- domande sulla nota/selezione;
- proposta modifica di una nota;
- proposta nuova nota.

Retrieval iniziale:

```text
search locale
→ note necessarie
→ provider
→ risposta + fonti
```

La prima implementazione usa la ricerca lessicale già esistente; embeddings/vector DB entrano solo se giustificati da test reali.

Le modifiche richiedono diff/anteprima e approvazione.

V0.5 non fornisce all'IA delete/rename/move/bulk edit/board/live commands.

Specifica: `docs/AI_SPEC.md`.

---

# 15. Personaggi e integrazioni V0.6

V0.6 non costruisce un character builder universale.

Una normale nota può essere collegata a un token come nota personaggio.

Flussi:

```text
token → Collega nota personaggio…
```

```text
nota → Crea token da questa nota…
```

La stessa nota può essere riferimento in più board; la nota resta privata al DM.

Future sorgenti EcoGDR/BeFolder entrano dietro piccoli adapter soltanto quando esiste il provider reale.

Nessun plugin framework, importatore universale o sync continuo come prerequisito.

Specifica: `docs/V06_CHARACTERS_INTEGRATIONS_SPEC.md`.

---

# 16. EcoGDR futuro

Una campagna può in futuro avere un `externalBinding` opzionale.

Flusso previsto:

```text
Collega campagna
→ scegli campagna remota
→ conferma binding
```

**Collegare non significa sincronizzare o pubblicare.**

Ogni operazione dati futura viene progettata separatamente contro API reali.

Scollegare non elimina dati locali.

Specifica: `docs/ECOGDR_INTEGRATION_SPEC.md`.

---

# 17. Tipi di stato

Il progetto distingue sempre:

1. dati persistenti campagna;
2. stato live temporaneo;
3. stato UI/preferenze;
4. dati derivati ricostruibili;
5. stato/credenziali di servizi esterni fuori dal vault.

Non vengono fusi in un unico store globale.

---

# 18. Sicurezza

Principi minimi:

- Electron `contextIsolation`;
- renderer senza filesystem arbitrario;
- client player non trusted;
- validazione runtime dei messaggi rete;
- token movement autorizzato lato server;
- private data non inviata ai player;
- API key/token auth fuori dai file campagna;
- nessun secret nei log/client player.

---

# 19. Roadmap

Ordine:

```text
V0.1  Campaign Manager locale
→ V0.2 Board
→ V0.3 Live web
→ V0.4 Discord Activity
→ V0.5 Assistente IA
→ V0.6 Personaggi leggeri + ganci integrazione
→ Auth/Compendio cloud quando backend reale esiste
→ EcoGDR quando API/contratti reali esistono
```

Dettagli operativi: `ROADMAP.md`.

---

# 20. Non-obiettivi iniziali

Non si tenta automaticamente di costruire:

- VTT completo concorrente Foundry/Roll20;
- hosting cloud del vault;
- multiplayer persistente 24/7;
- marketplace;
- rules engine universale;
- character builder universale;
- voice/video;
- collaborazione simultanea dell'intero vault;
- vector database cloud;
- plugin marketplace;
- sync cloud bidirezionale generico.

---

# 21. Gate di sviluppo

Una fase è completa solo con:

- requisiti definiti;
- test della logica critica;
- smoke/E2E del flusso reale;
- documentazione allineata;
- nessuna regressione bloccante;
- nessuna perdita dati nota.

La fase successiva non viene usata per nascondere problemi della precedente.

---

# 22. Criteri di successo

La v2 è riuscita se:

1. una campagna può vivere per anni senza i servizi cloud del progetto;
2. relay/cloud/provider IA non possono corrompere il vault;
3. Discord può cambiare senza riscrivere Campaign Manager;
4. provider IA può cambiare senza riscrivere editor/filesystem;
5. account può essere assente senza bloccare il prodotto;
6. Compendio può essere offline senza bloccare la campagna;
7. EcoGDR può essere collegato/scollegato senza prendere possesso dei file locali;
8. ogni nuova feature ha un confine evidente senza creare layer prematuri.

---

## Regola anti-caos

Prima di aggiungere una feature:

1. **A quale dominio appartiene?**
2. **Qual è il modulo responsabile?**
3. **Quale problema reale risolve adesso?**

Se non c'è una risposta chiara, la feature non entra ancora.

**Prima il cavallo. Poi i brillantini.**