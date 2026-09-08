# Campaign Manager v2 — Design Direction

## 1. Scopo

Questo documento definisce la direzione visiva e di motion della UI della v2.

Non sostituisce la UX specification: i flussi, la gerarchia e l'ergonomia vengono prima del polish visivo.

La v2 non deve replicare l'aspetto della vecchia applicazione. L'obiettivo è una UI più efficiente, comoda e leggibile, con un carattere visivo morbido e riconoscibile.

Riferimento palette: `docs/palette.svg`.

La specifica comportamentale della V0.1 è `docs/UI_UX_SPEC_V01.md`.

---

## 2. Palette principale UI

### Background principale — `#1E1333`

È il colore base dell'applicazione.

Usi previsti:

- sfondo generale;
- aree di lavoro principali;
- superfici profonde;
- base dei gradienti.

Deve essere il colore dominante dell'interfaccia.

### Gradient companion — `#4D3B6B`

Va accoppiato a `#1E1333` quando serve introdurre profondità tramite gradiente.

Uso previsto:

```css
background: linear-gradient(..., #1E1333, #4D3B6B);
```

Non va trattato come un secondo background indipendente onnipresente: la sua funzione principale è accompagnare `#1E1333` nei gradienti o creare profondità controllata.

### Highlight / accent surface — `#3D1F48`

Serve per:

- elementi UI evidenziati;
- pannelli o superfici selezionate;
- aree che devono emergere dal background senza sembrare un controllo primario;
- stati attivi quando serve un cambio di superficie.

È un accento strutturale, non un colore decorativo casuale.

### Small UI / controls — `#833D6F`

Serve principalmente per elementi UI più piccoli, ad esempio:

- pulsanti;
- controlli;
- toggle;
- badge interattivi;
- piccoli accenti funzionali.

Non deve invadere grandi superfici: il suo ruolo è dare presenza agli elementi d'azione senza rompere la gerarchia della UI.

### Testo — `#FFFFFF`

Il testo principale è bianco.

La gerarchia tipografica va ottenuta soprattutto tramite:

- dimensione;
- peso;
- opacità;
- spaziatura;

non introducendo nuovi colori di testo arbitrari.

---

## 3. Colori del grafo e delle cartelle

I seguenti colori sono riservati alla codifica semantica usata dalla vista grafo:

- `#9A85C0`
- `#A8C6DE`
- `#9CA98B`
- `#EFDEBD`
- `#8F5A5A`

Questi colori **non fanno parte della palette funzionale generale della UI**.

Non vanno usati liberamente per:

- pulsanti;
- card;
- badge generici;
- alert;
- decorazioni dell'interfaccia principale;
- testo delle righe del vault;
- background di selezione delle righe;
- focus states generici.

La loro funzione è rappresentare la codifica cromatica delle cartelle nel grafo. I nodi ereditano il colore della cartella effettiva della nota secondo le regole definite in `docs/UI_UX_SPEC_V01.md`.

### Eccezione approvata — indicatore cartella nella sidebar

È approvata una sola estensione fuori dalla graph view: accanto a una cartella nella sidebar può essere mostrato un **piccolo pallino** con lo stesso colore usato dal grafo.

Questo indicatore:

- comunica la stessa informazione semantica del grafo;
- non trasforma il colore in un accento decorativo generale;
- non cambia il colore del testo della cartella;
- non sostituisce hover, focus o selezione della riga;
- deve restare distinguibile anche tramite nome/percorso e non essere l'unico segnale informativo.

Cartelle senza colore esplicito possono ereditare il colore dall'antenato più vicino; note nella root o senza colore ereditabile usano una rappresentazione neutra nel grafo.

La vista grafo non deve affidarsi esclusivamente al colore per comunicare informazioni: categorie e stati devono poter essere distinti anche tramite etichette, percorso, forma, icone o altri segnali quando necessario.

---

## 4. Gerarchia cromatica

La UI deve mantenere una gerarchia semplice:

```text
#1E1333   background dominante
   ↓
#4D3B6B   profondità / gradient companion
   ↓
#3D1F48   superfici evidenziate
   ↓
#833D6F   controlli e piccoli elementi interattivi
   ↓
#FFFFFF   contenuto testuale
```

I cinque colori del grafo vivono fuori da questa gerarchia funzionale. Compaiono nella graph view e, come unica eccezione approvata, nel piccolo indicatore cromatico delle cartelle nella sidebar.

---

## 5. Carattere generale della UI

La UI deve risultare:

- leggera;
- fluida;
- liscia;
- morbida nelle transizioni;
- moderna senza sembrare sterile;
- a tratti bubbly e giocosa;
- efficiente prima che decorativa.

"Giocosa" non significa infantile o rumorosa.

Il carattere bubbly deve comparire in dettagli mirati: microinterazioni, forme, feedback e piccoli movimenti, non trasformare ogni componente in un elemento decorativo.

---

## 6. Motion design

Le animazioni fanno parte dell'esperienza, ma non devono rallentare il lavoro.

### Principi

Le transizioni devono essere:

- brevi;
- continue;
- morbide;
- con accelerazioni naturali;
- prive di scatti visivi;
- utili a far capire cosa è successo.

Il movimento deve aiutare a conservare il contesto tra uno stato e l'altro.

### Linguaggio del movimento

Preferire:

- espansioni morbide;
- pannelli che scivolano senza rigidità;
- hover con lieve risposta elastica;
- press states con compressione minima;
- elementi che entrano/escono con continuità;
- piccoli overshoot quando coerenti con il carattere bubbly;
- morph o interpolazioni semplici quando chiariscono la relazione tra due stati.

Evitare:

- bounce aggressivi;
- animazioni lunghe;
- rotazioni decorative inutili;
- effetti che spostano il layout in modo imprevedibile;
- transizioni che impediscono click o digitazione;
- motion ripetitivo che distrae durante sessioni lunghe.

**Default progettuale da verificare:** motion ordinario nell'intervallo circa 120–240 ms, con easing vicino a `cubic-bezier(.2,.8,.2,1)`. Il comportamento è vincolante; il numero preciso può essere corretto dopo verifica sull'app reale.

---

## 7. Microinterazioni

Le microinterazioni possono dare personalità alla UI.

Esempi compatibili con la direzione:

- pulsante che si comprime leggermente al click;
- highlight che si espande in modo morbido;
- tab che cambia stato con una transizione liquida;
- menu che emerge con una piccola variazione di scala e opacità;
- indicatori di salvataggio che cambiano stato senza lampeggi bruschi;
- drag & drop con risposta elastica molto contenuta;
- selezione di elementi con contorno o superficie che si assesta dolcemente.

Le microinterazioni non devono introdurre ritardo percepibile nelle azioni frequenti.

---

## 8. Forme e componenti

La direzione "liquida / bubbly" suggerisce componenti non eccessivamente rigidi, ma raggi, curvature e proporzioni definitive restano da validare durante l'implementazione reale.

Per ora valgono questi principi:

- evitare un'interfaccia fatta solo di rettangoli duri e bordi netti;
- preferire curvature coerenti e morbide;
- differenziare chiaramente pannelli, controlli e superfici;
- non sacrificare densità ed efficienza per ottenere grandi card decorative;
- mantenere le aree di lavoro compatte dove serve.

**Default progettuale da verificare:** raggi circa 10/16/22 px, ripresi dal mock approvato.

---

## 9. UX prima dell'estetica

Il linguaggio visivo non deve peggiorare l'efficienza.

In particolare:

- un'animazione non deve rallentare un'azione frequente;
- un pannello non deve occupare più spazio del necessario solo per essere estetico;
- i controlli devono restare riconoscibili;
- gli stati selezionati devono essere immediati;
- la UI deve funzionare bene anche con sessioni lunghe e molti contenuti;
- il carattere giocoso deve apparire come qualità, non come rumore.

Quando estetica e usabilità entrano in conflitto, si ridisegna la soluzione invece di forzare una delle due.

---

## 10. Accessibilità e motion

Le animazioni devono rispettare `prefers-reduced-motion`.

Gli stati importanti non devono essere comunicati solo tramite movimento.

Il bianco mantiene un contrasto elevato sui quattro colori principali della UI; eventuali opacità del testo secondario e trasparenze vanno validate sui componenti reali.

Focus, selezione e stato attivo devono restare distinguibili anche senza affidarsi unicamente a microanimazioni o ai colori del grafo.

Il riferimento di verifica della V0.1 è WCAG 2.2 AA per i criteri applicabili, come definito nella UI/UX spec; questo non costituisce una dichiarazione preventiva di conformità.

---

## 11. Decisioni già fissate

Sono considerate approvate:

- background principale `#1E1333`;
- gradient companion `#4D3B6B`;
- highlight/surface accent `#3D1F48`;
- small UI / buttons `#833D6F`;
- testo bianco;
- colori grafo/cartelle `#9A85C0`, `#A8C6DE`, `#9CA98B`, `#EFDEBD`, `#8F5A5A`;
- pallino colore cartella nella sidebar come unica eccezione fuori dalla graph view;
- motion leggero, liquido e liscio;
- dettagli occasionalmente bubbly e giocosi;
- priorità dell'efficienza UX rispetto al puro effetto estetico.

---

## 12. Default ancora da validare

Non sono decisioni di prodotto rigide, ma default iniziali documentati:

- font UI di sistema;
- monospace per Markdown;
- testo UI ordinario circa 13 px;
- testo secondario non inferiore a circa 12 px;
- editor circa 15 px;
- raggi circa 10/16/22 px;
- motion circa 120–240 ms;
- easing vicino a `cubic-bezier(.2,.8,.2,1)`.

Tipografia finale, spacing preciso, iconografia e valori dimensionali possono essere corretti dopo verifica sull'app reale senza cambiare la direzione approvata.
