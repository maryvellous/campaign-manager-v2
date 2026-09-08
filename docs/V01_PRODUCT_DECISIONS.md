# Campaign Manager v2 — Decisioni di prodotto V0.1

## Scopo

Questo documento registra decisioni di prodotto **approvate e vincolanti** per la V0.1 emerse dopo la prima stesura delle specifiche verticali.

Non sostituisce `UI_UX_SPEC_V01.md`, `DOMAIN_MODEL.md`, `STORAGE_SPEC.md` o `SEARCH_SPEC.md`: le integra e, quando una formulazione precedente è incompatibile con una decisione qui registrata, **questa decisione prevale** fino al successivo riallineamento editoriale della specifica interessata.

Prefisso decisioni: `DEC-V01-*`.

---

## DEC-V01-CAM-001 — Prima apertura di una cartella

Quando l'utente seleziona una cartella locale leggibile e scrivibile che non contiene ancora `campaign.json`, il Campaign Manager la inizializza automaticamente come campagna gestita.

Comportamento richiesto:

1. l'utente sceglie la cartella;
2. l'app rileva che non contiene metadata Campaign Manager;
3. crea soltanto il `campaign.json` minimo necessario, incluso un nuovo `CampaignId`;
4. apre la cartella come campagna;
5. non rinomina, sposta, converte o riscrive le note già presenti.

Non è richiesto un wizard tecnico o una conferma separata per la normale inizializzazione.

Se esiste già un `campaign.json` non valido o incompatibile, l'app non lo sovrascrive automaticamente.

**Criterio di accettazione:** aprire per la prima volta una normale cartella di Markdown deve richiedere soltanto la selezione della cartella e non deve modificare i contenuti dell'utente.

---

## DEC-V01-CAM-002 — Copia di una campagna e CampaignId duplicato

Spostare o rinominare fisicamente una campagna non crea una nuova campagna: il suo `CampaignId` resta lo stesso.

Copiare l'intera cartella, invece, può produrre due cartelle esistenti con lo stesso `CampaignId`. Quando l'app rileva questa situazione deve renderla esplicita e offrire all'utente di trattare la cartella aperta come **nuova copia indipendente**.

Separare la copia significa generare per quella cartella un nuovo `CampaignId` senza modificare note, asset o struttura del vault.

L'app non deve cambiare automaticamente l'ID soltanto perché il path è diverso: se il vecchio path non esiste più, il caso normale è uno spostamento della stessa campagna.

**Criterio di accettazione:** spostare una campagna conserva preferenze e identità; duplicarla può essere separata chiaramente dall'originale senza ricreare il vault.

---

## DEC-V01-NOTE-001 — Nuova nota come draft temporaneo

Premere **Nuova nota** apre immediatamente un draft nell'editor, senza chiedere prima un nome e senza creare immediatamente un file `Senza titolo.md` o equivalente.

Finché il draft non contiene contenuto significativo non esiste ancora una nuova nota autorevole sul filesystem.

Se l'utente abbandona il draft senza aver scritto nemmeno un carattere significativo, la creazione viene annullata e non resta alcun file vuoto nel vault.

Per "contenuto significativo" si intende almeno un carattere testuale utile; whitespace e sola sintassi Markdown priva di testo non obbligano a materializzare una nota.

Il draft temporaneo deve comunque essere compatibile con la strategia di recovery locale quando contiene contenuto non ancora persistito.

---

## DEC-V01-NOTE-002 — Titolo automatico dalle prime parole

Alla prima materializzazione sul filesystem, una nuova nota riceve automaticamente come titolo le **prime da una a tre parole significative** scritte nel contenuto.

Esempi:

```text
Meradyl
→ Meradyl.md

Lady Maya
→ Lady Maya.md

Il vecchio castello sulla collina
→ Il vecchio castello.md
```

Regole:

- minimo: una parola;
- massimo: tre parole;
- se al momento della materializzazione esistono una o due parole, il titolo usa quelle disponibili;
- marcatori Markdown iniziali non fanno parte del titolo; per esempio `# La città perduta` produce `La città perduta`;
- il titolo automatico viene fissato alla **prima materializzazione autorevole** della nota e non continua a rinominarsi mentre l'utente prosegue a scrivere;
- una volta materializzata, eventuali cambi del titolo seguono il normale flusso di rinomina esplicita.

La prima materializzazione può essere richiesta da salvataggio/autosalvataggio, uscita dal draft o altro evento applicativo equivalente, purché rispetti le regole sopra e non crei rename ripetuti per ogni parola digitata.

---

## DEC-V01-NOTE-003 — Collisione del titolo automatico

Se il titolo automatico produrrebbe un `NoteId` già esistente nella stessa destinazione logica, l'app **non** crea automaticamente nomi come `(2)`, `copia` o suffissi arbitrari.

Il draft resta intatto e l'utente viene informato che esiste già una nota con quel nome, con possibilità di modificare esplicitamente il titolo prima della creazione autorevole.

Nessun contenuto del draft viene perso a causa della collisione.

---

## DEC-V01-NOTE-004 — Conferma della rinomina dal titolo

Modificare il titolo visibile di una nota già esistente non rinomina il file a ogni carattere digitato.

Il campo titolo entra in uno stato di modifica locale.

La rinomina viene confermata quando:

- l'utente preme `Invio`; oppure
- il campo perde il focus dopo una modifica valida.

`Esc` annulla la modifica del titolo e ripristina il titolo corrente del file.

Solo dopo la conferma parte il use case di rinomina reale, incluso l'aggiornamento dei wikilink risolti previsto dalle altre specifiche.

Collisioni o errori di rinomina lasciano la nota originale intatta e producono feedback esplicito.

---

## DEC-V01-LINK-001 — Wikilink univoci, ambigui e mancanti

Il Campaign Manager deve essere utile nel risolvere i wikilink, ma non deve mai indovinare silenziosamente l'intento dell'utente.

Comportamento:

- se `[[Meradyl]]` risolve a una sola nota, il link apre quella nota;
- se più note sono candidate, il link è `ambiguous` e l'interfaccia mostra le alternative tra cui scegliere;
- il resolver non seleziona automaticamente il primo match;
- se il target non esiste, il link è `missing` e l'interfaccia offre un'azione esplicita per creare la nota mancante.

Un link con percorso esplicito continua a usare le regole path-qualified definite in `DOMAIN_MODEL.md`.

La posizione/destinazione esatta da proporre per la creazione di un target mancante non deve essere inventata da un implementatore se non è già determinata dal target stesso; se necessario viene definita nella futura `WIKILINK_SPEC.md`.

Principio approvato:

> link intelligenti, ma mai presuntuosi.

---

## DEC-V01-SEARCH-001 — La ricerca full-text è una vista centrale

La voce **Ricerca** nel rail apre una vera vista di ricerca nell'area centrale dell'app, nello stesso spazio di lavoro usato alternativamente da editor/lettura e graph view.

Non deve limitarsi ad aprire la command palette.

Restano tre strumenti distinti:

1. filtro per nome nella sidebar;
2. vista centrale di ricerca full-text;
3. command palette `Ctrl/Cmd+K` per accesso rapido a note e azioni.

La vista Ricerca:

- mostra risultati full-text con titolo, percorso/contesto e snippet quando utile;
- lascia disponibili rail e navigazione laterale coerentemente con il layout V0.1;
- aprendo un risultato torna alla nota secondo il normale navigation model;
- non distrugge tab, buffer o contesto dell'editor mentre è attiva.

---

## DEC-V01-PLATFORM-001 — Piattaforma ufficiale V0.1

La V0.1 è **ufficialmente supportata e validata su Windows**.

Il progetto continua a usare contratti e policy portability-first per non legare inutilmente dominio, path e storage a Windows, ma la V0.1 non promette ancora supporto verificato per macOS o Linux.

Conseguenze:

- i gate V0.1 devono essere superati su Windows;
- cestino, filesystem watcher, packaging e smoke test vengono validati realmente su Windows;
- il codice non deve introdurre dipendenze Windows-specific nel core quando possono restare negli adapter;
- macOS e Linux possono essere aggiunti successivamente dopo test e hardening dedicati, senza richiedere una riprogettazione del dominio.

---

# Riepilogo delle decisioni approvate

Per la V0.1 vale quindi questo comportamento:

```text
seleziona cartella nuova
→ inizializzazione automatica non distruttiva

Nuova nota
→ draft immediato
→ nessun testo = annulla
→ prime 1–3 parole = titolo automatico
→ prima persistenza = titolo fissato

modifica titolo esistente
→ Invio/blur conferma
→ Esc annulla

wikilink
→ unico: apri
→ ambiguo: scegli
→ mancante: proponi creazione

Ricerca nel rail
→ vista full-text centrale

V0.1
→ supporto ufficiale Windows
→ architettura portability-first
```

---

## Regola finale

Queste decisioni eliminano ambiguità di prodotto; l'implementatore può scegliere dettagli tecnici interni soltanto se non cambia il comportamento osservabile descritto qui.
