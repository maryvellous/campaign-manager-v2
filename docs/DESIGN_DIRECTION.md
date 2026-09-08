# Campaign Manager v2 — Design Direction

## 1. Scopo

Questo documento definisce la direzione visiva e di motion della UI della v2.

Non sostituisce la UX specification: i flussi, la gerarchia e l'ergonomia vengono prima del polish visivo.

La v2 non deve replicare l'aspetto della vecchia applicazione. L'obiettivo è una UI più efficiente, comoda e leggibile, con un carattere visivo morbido e riconoscibile.

Riferimento palette: `docs/palette.svg`.

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

## 3. Colori riservati alla vista grafo

I seguenti colori sono riservati alla visualizzazione del grafo:

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
- decorazioni dell'interfaccia principale.

La loro funzione è differenziare nodi, categorie o relazioni nella vista grafo.

La vista grafo non deve affidarsi esclusivamente al colore per comunicare informazioni: quando serve, categorie e stati devono poter essere distinti anche tramite etichette, forma, icone o altri segnali.

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

I colori del grafo vivono fuori da questa gerarchia e compaiono solo dove hanno un significato specifico nella graph view.

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

La direzione "liquida / bubbly" suggerisce componenti non eccessivamente rigidi, ma raggi, curvature e proporzioni definitive restano da validare durante la progettazione dei wireframe e dei componenti reali.

Per ora valgono questi principi:

- evitare un'interfaccia fatta solo di rettangoli duri e bordi netti;
- preferire curvature coerenti e morbide;
- differenziare chiaramente pannelli, controlli e superfici;
- non sacrificare densità ed efficienza per ottenere grandi card decorative;
- mantenere le aree di lavoro compatte dove serve.

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

Il bianco mantiene un contrasto elevato sui quattro colori principali della UI; eventuali opacità del testo secondario andranno validate sui componenti reali.

Focus, selezione e stato attivo devono restare distinguibili anche senza affidarsi unicamente a microanimazioni.

---

## 11. Decisioni già fissate

Sono considerate approvate:

- background principale `#1E1333`;
- gradient companion `#4D3B6B`;
- highlight/surface accent `#3D1F48`;
- small UI / buttons `#833D6F`;
- testo bianco;
- colori graph-only `#9A85C0`, `#A8C6DE`, `#9CA98B`, `#EFDEBD`, `#8F5A5A`;
- motion leggero, liquido e liscio;
- dettagli occasionalmente bubbly e giocosi;
- priorità dell'efficienza UX rispetto al puro effetto estetico.

---

## 12. Decisioni ancora aperte

Restano da definire durante il lavoro UI/UX:

- tipografia;
- scala tipografica;
- raggi definitivi;
- spacing scale;
- iconografia;
- densità precisa dei pannelli;
- comportamento specifico di sidebar, tab e pannelli;
- durata/easing standard delle animazioni;
- pattern definitivi per menu, modali, tooltip e command palette.

Queste decisioni devono emergere dai flussi reali della V0.1, non essere fissate in astratto.
