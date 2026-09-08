# Campaign Manager v2 — UX Baseline V0.1

## Scopo

Questo documento chiude il deliverable storico della **Fase 0 — Baseline e UX audit** della roadmap.

Non introduce nuove decisioni di prodotto: riassume i problemi che la v2 deve evitare e gli obiettivi già consolidati dalle specifiche V0.1.

La fonte operativa prevalente è `docs/V01_OPERATIONAL_SPEC.md`.

---

## 1. Problema della v1 da non replicare

La v2 non deve crescere per accumulo di pannelli, store globali e feature collegate direttamente tra loro.

Il DM deve poter svolgere i task quotidiani senza conoscere struttura tecnica, filesystem API, indici, relay o altri dettagli implementativi.

I rischi principali da evitare sono:

- troppi passaggi per trovare/modificare una nota;
- perdita di contesto passando tra contenuti;
- salvataggi apparentemente riusciti ma non confermati;
- drag & drop come unico percorso operativo;
- file operations nascoste dentro componenti UI;
- ricerca, backlink e graph trattati come fonti dati invece che proiezioni;
- UI che copia la vecchia app invece di ripensare i flussi.

---

## 2. Task quotidiani prioritari del DM

Ordine di importanza V0.1:

1. aprire/riprendere una campagna;
2. trovare velocemente una nota;
3. creare una nota senza interrompere il flusso di scrittura;
4. scrivere e sapere se il contenuto è davvero salvo;
5. seguire wikilink/backlink e tornare indietro;
6. organizzare note/cartelle tramite rename/move/trash;
7. cercare nel contenuto;
8. esplorare il graph senza perdere tab/buffer;
9. chiudere e riaprire ritrovando il contesto.

---

## 3. Obiettivi di esperienza

### Apertura

Una cartella Markdown normale deve poter diventare campagna con un solo gesto e senza conversione dei contenuti.

### Navigazione

Sidebar, wikilink, search, recenti, preferiti e graph devono convergere sullo stesso navigation model.

### Scrittura

Creare una nota deve sembrare iniziare a scrivere, non compilare un modulo tecnico.

### Sicurezza dati

Il prodotto deve preferire:

- recovery;
- errori espliciti;
- conflict resolution;
- system trash;

alla perdita o sovrascrittura silenziosa.

### Contesto

Tab, history, cursore, pannelli e graph state devono sopravvivere ai normali cambi di vista e, quando possibile, alla riapertura.

### Tastiera e mouse

Le azioni frequenti possono essere rapide col mouse, ma nessuna azione primaria può dipendere esclusivamente da drag & drop.

---

## 4. Information architecture baseline

La shell approvata usa:

```text
top bar
+ rail
+ sidebar vault
+ area centrale
+ inspector contestuale
```

L'area centrale ospita alternativamente:

- editor/lettura;
- ricerca full-text;
- graph view;
- impostazioni minime.

Recenti e Preferiti filtrano la sidebar invece di creare dashboard decorative.

---

## 5. Criterio di successo della baseline

La Fase 0 è considerata chiusa perché oggi sappiamo descrivere senza ambiguità:

- come si apre/inizializza una campagna;
- come si trova/crea una nota;
- come si cambia nota;
- come si segue/risolve un wikilink;
- come si torna indietro;
- come si distingue dirty/saving/saved/error/conflict;
- come si recuperano modifiche non persistite;
- come vengono trattate cartelle, rename/move e trash;
- come Search e Graph restano proiezioni locali e ricostruibili.

I comportamenti esatti sono normati da `V01_OPERATIONAL_SPEC.md` e dalle specifiche verticali collegate in `SPEC_INDEX.md`.