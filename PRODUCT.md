# PRODUCT.md — Diaspro RPG Campaign Manager v2

## 1. Scopo del prodotto

**Diaspro RPG Campaign Manager v2** è un'applicazione desktop local-first per Dungeon Master che permette di organizzare, consultare e usare durante la partita tutto il materiale di una campagna TTRPG.

Il prodotto deve rendere semplice:

- organizzare note, luoghi, PNG, fazioni, quest e materiale di campagna;
- collegare le informazioni tra loro tramite wikilink;
- esplorare le relazioni tra note tramite una vista grafo derivata dai wikilink;
- usare lavagne visive con mappe, note e token;
- condividere con i giocatori solo ciò che serve durante una sessione live;
- interrogare la propria campagna tramite un assistente IA senza perdere il controllo sui dati o sulle modifiche.

La **Desktop App del DM è il prodotto principale**.

Discord Activity, relay realtime e assistente IA sono moduli collegati al Campaign Manager, non il suo fondamento.

---

## 2. Principio fondamentale

La v2 è un progetto nuovo.

La repository precedente viene mantenuta esclusivamente come:

- riferimento funzionale;
- archivio di idee;
- fonte per eventuali formati dati o comportamenti da recuperare;
- esempio di problemi architetturali da non ripetere.

**Non si effettua un refactor progressivo della v1 e non si copia codice senza una motivazione esplicita.**

Ogni componente della v2 deve essere progettato come se il prodotto venisse costruito oggi da zero.

---

## 3. Utente principale

### Dungeon Master

Il DM deve poter gestire una campagna senza conoscere:

- database;
- server;
- networking;
- configurazioni cloud;
- formati proprietari.

L'esperienza ideale è:

1. apre una cartella di campagna;
2. crea o modifica contenuti;
3. esplora collegamenti e relazioni tra note;
4. prepara una lavagna;
5. avvia una sessione;
6. decide cosa mostrare ai giocatori;
7. chiude l'app senza dover gestire infrastruttura tecnica.

### Giocatori

I giocatori non devono installare il Campaign Manager.

Durante una sessione possono usare una web app leggera, preferibilmente dentro Discord, per vedere ciò che il DM condivide e interagire con gli elementi autorizzati.

---

## 4. Principi di prodotto

### Local-first

I dati della campagna appartengono all'utente e risiedono sul suo computer.

La cartella della campagna è la fonte autorevole dei dati persistenti.

Il cloud viene usato solo quando serve per funzionalità live o asset condivisi.

### Nessun lock-in

Le informazioni principali devono essere memorizzate in formati leggibili e portabili.

Preferenze:

- Markdown per le note;
- JSON per dati strutturati;
- file `.canvas` o formato equivalente documentato per le lavagne;
- cartelle normali per immagini e allegati.

### Separazione delle responsabilità

Il prodotto è composto da moduli distinti:

- Campaign Manager Desktop;
- Discord/Web Activity;
- Relay realtime;
- Assistente IA.

Un modulo non deve conoscere dettagli interni degli altri oltre alle interfacce necessarie.

### Complessità solo quando serve

Non viene introdotta infrastruttura perché “potrebbe servire”.

Una tecnologia entra nel progetto solo quando risolve un problema reale della versione corrente.

---

## 5. Desktop Campaign Manager

La Desktop App è il cuore del prodotto.

Responsabilità principali:

- apertura e gestione delle campagne;
- navigazione del vault;
- editor Markdown;
- wikilink;
- metadati;
- ricerca;
- vista grafo delle relazioni tra note;
- lavagne;
- token;
- strumenti di sessione;
- configurazione dell'IA;
- gestione dell'avvio delle sessioni live.

La Desktop App deve funzionare normalmente anche senza Discord, relay o assistente IA.

---

## 6. Campagna e persistenza

Una campagna è una normale cartella sul filesystem.

Esempio:

```text
My Campaign/
  Notes/
  Characters/
  Locations/
  Sessions/
  Boards/
  Assets/
  campaign.json
```

La struttura non deve essere rigidamente imposta: l'utente può organizzare liberamente le proprie cartelle.

`campaign.json` contiene solo metadati e configurazioni strettamente necessarie alla campagna.

Le preferenze puramente UI non devono contaminare i contenuti della campagna se non hanno motivo di essere condivise o portabili.

---

## 7. Note

Le note sono file Markdown.

Funzionalità core:

- creazione;
- modifica;
- rinomina;
- eliminazione;
- cartelle;
- wikilink `[[Nota]]`;
- ricerca;
- frontmatter opzionale.

Il sistema deve distinguere chiaramente tra:

- contenuto salvato;
- stato dell'editor;
- indice di ricerca.

L'indice di ricerca è sempre derivato e ricostruibile.

### Vista grafo

Il grafo della V0.1 è una vista derivata dalle note e dai wikilink, non un database separato della campagna.

- i nodi rappresentano note;
- le relazioni derivano dai wikilink risolti;
- filtri, posizione della camera e disposizione visuale sono stato UI/preferenze locali;
- trascinare un nodo non modifica il contenuto delle note;
- il grafo deve poter essere ricostruito dai dati autorevoli.

I comportamenti UI/UX dettagliati sono normati da `docs/UI_UX_SPEC_V01.md`.

---

## 8. Lavagne

Le lavagne servono per preparazione e gioco.

Devono poter contenere almeno:

- testo;
- note della campagna;
- immagini;
- token;
- gruppi;
- collegamenti.

La persistenza della lavagna deve essere separata dalla sua sincronizzazione realtime.

Una lavagna deve essere pienamente utilizzabile anche senza avviare una sessione online.

---

## 9. Sessione live

Una sessione live è uno stato temporaneo distinto dai dati permanenti della campagna.

Può contenere:

- lavagna attualmente condivisa;
- token visibili;
- posizione corrente dei token;
- giocatori collegati;
- permessi;
- eventuali informazioni temporanee della sessione.

Il DM decide esplicitamente cosa viene pubblicato.

La chiusura del relay o la disconnessione di un giocatore non deve compromettere i dati locali della campagna.

---

## 10. Activity giocatori

La Activity è una web app separata e leggera.

Deve conoscere solo ciò che serve al giocatore.

Può:

- identificare il giocatore;
- entrare in una sessione;
- visualizzare la board condivisa;
- ricevere aggiornamenti realtime;
- muovere i token autorizzati;
- mostrare eventuali informazioni del personaggio.

Non deve avere accesso a:

- filesystem del DM;
- vault completo;
- note private;
- API key;
- configurazione IA;
- funzioni amministrative.

La Activity deve essere utilizzabile anche fuori da Discord durante lo sviluppo e i test.

L'integrazione Discord è un adapter, non il fondamento del client.

---

## 11. Relay realtime

Il relay è un servizio cloud minimale.

Architettura prevista:

```text
Desktop DM
    |
    | WebSocket
    v
Cloudflare Relay
    ^
    | WebSocket
    |
Player Activity
```

Il relay non è il database principale della campagna.

Serve per:

- creare e identificare sessioni live;
- inoltrare eventi realtime;
- mantenere lo stato temporaneo necessario;
- distribuire asset condivisi quando opportuno.

Il PC del DM non deve esporre direttamente server o porte pubbliche.

Non sono previsti tunnel verso il computer del DM.

---

## 12. Asset condivisi

Le immagini locali restano nella campagna.

Quando un'immagine deve essere mostrata ai giocatori, può essere pubblicata temporaneamente o permanentemente su storage dedicato.

Cloudflare R2 è il candidato principale.

Il protocollo realtime deve trasmettere riferimenti agli asset, non grandi payload Base64 dentro i messaggi WebSocket.

---

## 13. Assistente IA

L'IA è un modulo opzionale.

Il Campaign Manager deve rimanere completamente utilizzabile senza configurare alcun provider.

### Funzioni previste

L'assistente può:

- cercare informazioni nella campagna;
- rispondere a domande;
- riassumere;
- trovare contraddizioni;
- proporre nuovi contenuti;
- proporre modifiche alle note.

### Regola sulle modifiche

L'IA non modifica direttamente i file della campagna.

Flusso:

```text
richiesta utente
      ↓
ricerca nella campagna
      ↓
IA
      ↓
proposta
      ↓
diff / anteprima
      ↓
approvazione utente
      ↓
Campaign Service
      ↓
filesystem
```

Le operazioni distruttive o modificative devono passare attraverso i normali servizi applicativi.

### Retrieval

La prima implementazione deve privilegiare una soluzione semplice e locale.

BM25 o altra ricerca lessicale è sufficiente finché i requisiti reali non dimostrano la necessità di embeddings o vector database.

---

## 14. Tipi di stato

Il progetto distingue esplicitamente tre categorie.

### Dati persistenti della campagna

Esempi:

- note;
- board;
- personaggi;
- configurazione della campagna.

### Stato live

Esempi:

- sessione attiva;
- giocatori connessi;
- board pubblicata;
- posizione realtime dei token.

### Stato UI

Esempi:

- modale aperta;
- tab selezionato;
- pannello attivo;
- zoom;
- sidebar;
- camera, filtri e selezione del grafo.

Queste categorie non devono essere fuse in un unico store globale.

---

## 15. Sicurezza

Principi minimi:

- nessun secret nel frontend web;
- nessuna API key dell'utente inviata ai giocatori;
- Electron con `contextIsolation` attivo;
- filesystem accessibile tramite API controllate;
- validazione dei messaggi realtime;
- autorizzazione dei movimenti dei token lato autorevole;
- il client giocatore non è mai considerato trusted.

---

## 16. Non-obiettivi iniziali

La prima fase del progetto non deve tentare di offrire:

- un VTT completo concorrente di Foundry o Roll20;
- hosting completo delle campagne;
- multiplayer persistente 24/7;
- marketplace;
- sistemi di regole automatici per ogni TTRPG;
- character builder universale;
- voice/video;
- database vettoriale cloud;
- collaborazione simultanea sull'intero vault;
- app mobile nativa.

Queste funzionalità potranno essere valutate solo dopo che il nucleo del prodotto sarà stabile.

---

## 17. Roadmap di prodotto

### v0.1 — Campaign Manager

Obiettivo:

```text
apri campagna
→ naviga note
→ crea/modifica
→ wikilink
→ ricerca o esplora nel grafo
→ salva
→ chiudi
→ riapri senza perdere nulla
```

Include:

- shell desktop;
- filesystem;
- note;
- editor/lettura;
- wikilink e backlink;
- ricerca base;
- command palette;
- graph view derivata dai wikilink;
- recovery e gestione conflitti locali.

Esclude esplicitamente Discord, realtime, cloud sync e IA.

### v0.2 — Lavagne

Include:

- board;
- note;
- immagini;
- token;
- salvataggio affidabile.

### v0.3 — Live Session

Include:

- relay;
- protocollo realtime;
- client web standalone;
- board condivisa;
- sincronizzazione token.

### v0.4 — Discord Activity

Il client web già funzionante viene integrato nel Discord Embedded App SDK.

### v0.5 — Assistente IA

Include:

- retrieval locale;
- chat;
- domande sulla campagna;
- proposte di modifica;
- diff e approvazione.

### v0.6 — Personaggi e integrazioni

Solo dopo l'uso reale del sistema si decide la forma definitiva di:

- schede personaggio;
- eventuale bot Discord;
- import/export;
- ulteriori strumenti di sessione.

---

## 18. Gate di sviluppo

Una fase non viene considerata completata perché “sembra funzionare”.

Ogni fase deve avere:

- requisiti definiti;
- test automatici per la logica critica;
- smoke test reale;
- documentazione aggiornata;
- nessuna regressione nota bloccante.

La fase successiva non deve essere usata per nascondere problemi irrisolti della precedente.

---

## 19. Criteri di successo

La v2 è riuscita se:

1. una campagna può vivere per anni senza dipendere dai servizi cloud del progetto;
2. un problema del relay non può corrompere il vault;
3. Discord può cambiare senza obbligare a riscrivere il Campaign Manager;
4. un provider IA può cambiare senza modificare l'editor o il filesystem;
5. ogni modulo può essere testato separatamente;
6. una nuova feature ha un luogo architetturale evidente in cui essere implementata;
7. il codice resta comprensibile anche dopo mesi senza lavorarci.

---

## 20. Regola anti-caos

Prima di aggiungere una nuova feature bisogna rispondere a tre domande:

1. **A quale dominio appartiene?**
2. **Qual è il modulo responsabile?**
3. **Quale problema reale della versione corrente risolve?**

Se non esiste una risposta chiara, la feature non entra ancora nel progetto.

**Prima il cavallo. Poi i brillantini.**
