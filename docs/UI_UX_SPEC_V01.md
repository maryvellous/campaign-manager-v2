# Campaign Manager v2 — UI/UX Specification V0.1

## 1. Scopo, perimetro e linguaggio normativo

Questo documento trasforma le decisioni UI/UX approvate per **Campaign Manager v2 — V0.1** in un contratto verificabile per la futura implementazione.

La V0.1 deve permettere al DM di:

```text
aprire una campagna locale
→ orientarsi immediatamente
→ creare, trovare e aprire note
→ scrivere o leggere Markdown
→ navigare tramite wikilink, ricerca e grafo
→ salvare senza perdere modifiche
→ cambiare contesto senza perdere posizione o buffer
→ chiudere
→ riaprire ritrovando lo stato atteso
```

### 1.1 Linguaggio normativo

Nel documento:

- **REQUISITO** = comportamento vincolante per la V0.1;
- **DEFAULT PROPOSTO** = valore iniziale da usare finché la verifica sull'app reale non dimostra che va corretto;
- **VERIFICA PENDENTE** = proprietà da misurare sull'implementazione futura, non lasciata alla libera interpretazione dell'implementatore;
- **FUORI SCOPE** = comportamento esplicitamente escluso dalla V0.1.

I requisiti hanno identificativi stabili, ad esempio `UX-NAV-001`, `UX-SAVE-003`, `UX-GRAPH-007`.

### 1.2 Perimetro V0.1

Sono parte della V0.1:

- shell desktop;
- apertura campagna locale;
- rail principale;
- sidebar/vault explorer;
- note Markdown;
- modalità editor e lettura;
- tab e cronologia di navigazione;
- inspector contestuale;
- filtro note per nome;
- ricerca full-text locale;
- command palette;
- wikilink e backlink;
- graph view derivata dai wikilink;
- preferiti e recenti;
- colori cartella usati come metadato locale e come codifica del grafo;
- salvataggio affidabile, recovery e conflitti con modifiche esterne;
- keyboard navigation e accessibilità di base.

Sono fuori scope:

- lavagne VTT;
- realtime;
- Discord Activity;
- relay;
- AI;
- cloud sync;
- account EcoGDR;
- importazione di file esterni;
- collaborazione simultanea sul vault.

---

## 2. Fonti e registro delle decisioni

### 2.1 Fonti normative

Ordine di precedenza:

1. decisioni esplicite dell'utente raccolte durante la progettazione;
2. questo documento;
3. `PRODUCT.md`;
4. `architecture.md`;
5. `ROADMAP.md`;
6. `docs/DESIGN_DIRECTION.md`;
7. `docs/FOUNDATION_GUARDRAILS.md`;
8. mock HTML approvati come riferimento visivo e comportamentale non esaustivo.

In caso di conflitto, la decisione esplicita più recente prevale e la documentazione deve essere riallineata.

### 2.2 Mock approvati

Sono stati approvati due mock HTML:

- mock iniziale della vista note: `campaign_manager_v2_ui_mock.html`;
- mock successivo con graph view: `campaign_manager_v2_ui_mock_graph.html`.

Il secondo è il riferimento visivo più recente; il primo resta utile per la vista note originaria.

I mock dimostrano direzione, composizione, densità e motion. Non rendono automaticamente vincolante ogni numero CSS o comportamento dimostrativo contenuto negli script.

### 2.3 Decisioni approvate

Sono vincolanti:

- barra superiore + rail + sidebar vault + area centrale + inspector contestuale non modale;
- rail con Note, Ricerca, Grafo, Recenti, Preferiti, Impostazioni;
- Recenti e Preferiti filtrano la sidebar, non aprono dashboard separate;
- note aperte nella tab corrente salvo apertura esplicita in nuova tab;
- una nota già aperta viene attivata invece di duplicata;
- back/forward mantiene la cronologia per tab;
- passaggio note ↔ grafo conserva buffer, cursore, posizione di lettura e stato utile;
- editor Markdown e modalità lettura nella stessa area;
- autosave dopo breve inattività + `Ctrl/Cmd+S` immediato;
- stati `dirty`, `saving`, `saved`, `error` reali;
- bozze di recovery separate dai file autorevoli;
- conflitti con modifiche esterne mai risolti con sovrascrittura silenziosa;
- rinomina file con aggiornamento esplicito dei wikilink risolti;
- eliminazione via cestino di sistema, senza fallback silenzioso a delete permanente;
- drag & drop con alternativa tramite comandi;
- graph view in V0.1;
- nodi = note, archi = wikilink;
- colori del grafo derivati dalle cartelle reali;
- pallino colore cartella in sidebar come unica eccezione approvata all'uso graph-only dei cinque colori;
- accessibilità verificata rispetto ai criteri WCAG 2.2 AA applicabili.

---

## 3. Flussi principali del DM

### UX-FLOW-001 — Apertura campagna

**Origine:** schermata iniziale o elenco recenti.  
**Precondizioni:** nessuna campagna aperta.  
**Risultato:** l'utente seleziona una cartella valida e la shell mostra il vault.  
**Focus/contesto:** focus su ultimo contenuto ripristinabile oppure primo elemento utile della sidebar.  
**Persistenza:** percorso campagna, stato UI ripristinabile e preferenze locali per campagna.  
**Errore/recupero:** cartella assente/non leggibile → messaggio esplicito e possibilità di scegliere un'altra cartella.  
**Accettazione:** nessuna parte della UI deve suggerire che una campagna non caricata sia stata aperta correttamente.

### UX-FLOW-002 — Creazione e modifica nota

**Origine:** pulsante nuova nota, command palette o comando contestuale.  
**Precondizioni:** campagna aperta e directory scrivibile.  
**Risultato:** nuova nota selezionata nell'editor; titolo e contenuto modificabili.  
**Focus/contesto:** focus nel punto di input previsto senza perdere la struttura della shell.  
**Persistenza:** creazione reale su filesystem e stato editor separato.  
**Errore/recupero:** creazione fallita → buffer non perso, errore visibile, riprova possibile.  
**Accettazione:** nessun falso stato `saved` se il file non è stato scritto.

### UX-FLOW-003 — Navigazione tra note

Aperture da sidebar, wikilink, backlink, ricerca, recenti, preferiti o grafo seguono lo stesso modello di navigazione: tab corrente per default, nuova tab solo con azione esplicita.

### UX-FLOW-004 — Ricerca e grafo

L'utente deve poter trovare una nota senza conoscere la sua cartella tramite ricerca full-text o grafo; entrambe le vie devono riportare all'editor mantenendo una cronologia reversibile.

### UX-FLOW-005 — Chiusura e riapertura

Alla chiusura non si deve perdere un buffer locale non ancora persistito. Alla riapertura devono essere ripristinabili tab, vista attiva, pannelli, preferenze grafo e stato utile della campagna.

---

## 4. Layout desktop e gerarchia delle aree

### UX-LAYOUT-001 — Struttura principale

La finestra desktop contiene, dall'alto e da sinistra:

```text
┌────────────────────────────────────────────────────────────┐
│ barra superiore                                            │
├─────┬───────────────┬──────────────────────────┬────────────┤
│rail │ sidebar vault │ area centrale            │ inspector  │
│     │               │ editor / lettura         │ contestuale│
│     │               │ oppure graph view        │            │
└─────┴───────────────┴──────────────────────────┴────────────┘
```

L'inspector è non modale. Non deve bloccare l'editor né sostituire la navigazione primaria.

### UX-LAYOUT-002 — Barra superiore

Contiene almeno:

- identità dell'app/campagna;
- back/forward;
- breadcrumb o contesto corrente;
- stato reale di salvataggio quando applicabile;
- accesso evidente alla command palette.

### UX-LAYOUT-003 — Rail

Contiene almeno:

- Note;
- Ricerca;
- Grafo;
- Recenti;
- Preferiti;
- Impostazioni.

Il rail cambia modalità o filtro globale senza sostituire la sidebar con dashboard decorative.

### UX-LAYOUT-004 — Default dimensionali proposti

**DEFAULT PROPOSTO, non vincolo rigido:**

- top bar: 54 px;
- rail: 50 px;
- sidebar: 248 px;
- inspector: 265 px;
- sidebar ridimensionabile: 200–360 px;
- inspector ridimensionabile: 240–400 px.

Questi valori devono essere verificati sull'app reale.

---

## 5. Navigation model e conservazione del contesto

### UX-NAV-001 — Apertura nella tab corrente

Una nota aperta da sidebar, ricerca, wikilink, backlink o grafo sostituisce il contenuto della tab corrente per default.

### UX-NAV-002 — Nuova tab esplicita

Una nuova tab viene creata solo tramite comando esplicito: azione contestuale, shortcut dedicata o equivalente accessibile.

### UX-NAV-003 — Nessun duplicato tab

Se la nota è già aperta in un'altra tab, l'azione di apertura in nuova tab attiva la tab esistente invece di crearne una seconda copia.

### UX-NAV-004 — Cronologia per tab

Ogni tab mantiene cronologia back/forward propria. Seguendo un wikilink e tornando indietro si deve ritrovare la nota precedente con la posizione di lettura/cursore conservata quando possibile.

### UX-NAV-005 — Contesto tra note e grafo

Passare al grafo non chiude le tab, non svuota i buffer e non resetta la cronologia. Tornando alle note si ripristina la tab attiva precedente.

### UX-NAV-006 — Ripristino alla riapertura

Per campagna si possono ripristinare:

- tab aperte e tab attiva;
- vista attiva Note/Grafo;
- stato pannelli;
- dimensioni pannelli;
- filtri/preferenze grafo;
- preferiti;
- posizione di lettura e cursore quando tecnicamente affidabile.

Queste sono preferenze locali, non frontmatter delle note.

### UX-NAV-007 — Focus dopo overlay

Chiudendo command palette, menu o dialogo, il focus torna al controllo che li aveva aperti o al target di navigazione appena selezionato.

---

## 6. Rail, vault explorer, Recenti e Preferiti

### UX-VAULT-001 — Sidebar come navigazione primaria del vault

La sidebar mostra l'albero reale delle note e cartelle della campagna.

### UX-VAULT-002 — Filtro per nome

Il campo filtro nella sidebar filtra rapidamente note/cartelle per nome e non esegue ricerca full-text.

### UX-VAULT-003 — Recenti

Recenti mostra nella stessa sidebar un filtro/elenco ordinato di note aperte o modificate recentemente. Non apre una pagina dashboard.

### UX-VAULT-004 — Preferiti

Preferiti mostra nella stessa sidebar le note marcate come preferite. Il preferito è una preferenza locale per campagna e non modifica il contenuto Markdown.

### UX-VAULT-005 — Creazione

Creazione di nota e, se supportata, cartella deve essere accessibile dalla sidebar, command palette e/o menu contestuale senza modali inutili.

### UX-VAULT-006 — Rinomina

Rinominare una nota modifica il file reale e avvia l'aggiornamento dei wikilink risolti che puntano a quella nota. L'esito parziale o fallito deve essere esplicito.

### UX-VAULT-007 — Eliminazione

La cancellazione usa il cestino di sistema. Se il cestino non è disponibile, l'app **non** effettua automaticamente una cancellazione permanente.

Cartelle non vuote e contenuti con modifiche pendenti richiedono conferma chiara.

### UX-VAULT-008 — Spostamento

Note e cartelle possono essere spostate tramite drag & drop e tramite un comando alternativo accessibile da tastiera/menu.

### UX-VAULT-009 — Colore cartella

Una cartella può ricevere uno dei cinque colori graph-approved. Una sottocartella eredita dall'antenato più vicino con colore esplicito e può sovrascriverlo con la propria assegnazione.

### UX-VAULT-010 — Indicatore colore sidebar

Accanto alla cartella può apparire un piccolo pallino con il colore del grafo. È l'unica eccezione generale all'uso graph-only dei cinque colori. Testo, hover, focus, selezione e controlli della riga continuano a usare la palette UI normale.

---

## 7. Editor Markdown e modalità lettura

### UX-EDIT-001 — Due modalità nella stessa area

Editor Markdown e modalità lettura occupano la stessa area centrale e si alternano tramite comando esplicito.

### UX-EDIT-002 — Titolo e file

Il titolo visibile della nota rappresenta l'identità del file. Una modifica del titolo che comporta rinomina deve essere trattata come operazione filesystem, non come semplice campo decorativo.

### UX-EDIT-003 — Frontmatter non invasivo

Il frontmatter può essere supportato ma non deve dominare l'esperienza di scrittura ordinaria.

### UX-EDIT-004 — Wikilink

`[[Nota]]` è navigabile e distinguibile. Link mancanti o ambigui devono avere stato esplicito; nessuna risoluzione arbitraria silenziosa.

### UX-EDIT-005 — Undo/redo

Undo/redo editor non deve essere confuso con back/forward della navigazione. Entrambe le funzioni devono essere disponibili senza collisioni concettuali.

### UX-EDIT-006 — Cambio nota con buffer dirty

Cambiare nota non deve perdere il buffer. L'azione avvia il salvataggio della versione corrente; se il salvataggio fallisce il buffer resta recuperabile e lo stato di errore rimane visibile.

---

## 8. Inspector contestuale

### UX-INSP-001 — Non modale

L'inspector non blocca l'editor e può essere ridimensionato/collassato.

### UX-INSP-002 — Contenuti nota

Quando una nota è selezionata può mostrare almeno:

- wikilink in uscita;
- backlink;
- informazioni utili della nota;
- cartella/percorso;
- conteggi derivati utili.

### UX-INSP-003 — Stati vuoti

Se non esistono backlink o collegamenti, l'inspector mostra uno stato vuoto esplicito invece di una card vuota senza significato.

### UX-INSP-004 — Apertura collegamenti

Aprire una voce dell'inspector segue il normale navigation model della tab corrente.

---

## 9. Ricerca e command palette

### UX-SEARCH-001 — Tre strumenti distinti

Devono essere distinti:

1. filtro per nome nella sidebar;
2. ricerca full-text locale;
3. command palette.

### UX-SEARCH-002 — Full-text

La ricerca full-text cerca contenuto e titolo e mostra contesto minimo sufficiente a distinguere risultati simili.

### UX-CMD-001 — Apertura palette

`Ctrl/Cmd+K` apre la command palette.

### UX-CMD-002 — Contenuti palette

La palette può mostrare note e azioni. I due tipi devono essere distinguibili.

### UX-CMD-003 — Tastiera

Frecce navigano i risultati, Invio esegue/apre, Esc chiude.

### UX-CMD-004 — Focus

All'apertura il focus entra nel campo della palette; alla chiusura torna al contesto precedente salvo apertura di un nuovo target.

### UX-CMD-005 — Nessun risultato

Lo stato senza risultati deve essere esplicito e non sembrare un errore di caricamento.

---

## 10. Graph view

### UX-GRAPH-001 — Scope V0.1

La graph view è parte della V0.1.

### UX-GRAPH-002 — Collocazione

Il grafo sostituisce l'area editor/lettura. Rail e sidebar restano disponibili. L'inspector nota non è obbligato a restare visibile; il grafo usa un dettaglio flottante del nodo coerente con il mock approvato.

### UX-GRAPH-003 — Modello

Ogni nodo rappresenta una nota. Ogni relazione deriva da un wikilink risolto. Il grafo è dati derivati e ricostruibili.

### UX-GRAPH-004 — Drag nodo

Trascinare un nodo modifica solo la disposizione visiva del grafo. Non modifica note, cartelle, wikilink o altri dati di dominio.

### UX-GRAPH-005 — Pan e zoom

Il grafo supporta pan e zoom fluidi con mouse/trackpad e alternative accessibili tramite controlli.

### UX-GRAPH-006 — Colore nodo

Il colore del nodo deriva dal colore effettivo della cartella della nota, includendo l'eredità dalla cartella antenata più vicina.

Note in root o senza colore ereditabile usano una rappresentazione neutra che non inventa una sesta categoria cromatica.

### UX-GRAPH-007 — Filtri dinamici

Filtri e legenda derivano dalle cartelle reali della campagna e non da categorie predefinite come “Luoghi” o “Personaggi”.

### UX-GRAPH-008 — Filtro attenuante

Applicare un filtro attenua note non appartenenti al filtro senza rendere illeggibili le relazioni necessarie a comprendere il contesto.

### UX-GRAPH-009 — Colori condivisi

Più cartelle possono condividere lo stesso colore. Etichetta e percorso distinguono le categorie; il colore non è un ID.

### UX-GRAPH-010 — Selezione

Selezionare un nodo evidenzia nodo e collegamenti senza sostituire il colore di cartella con un colore funzionale diverso.

### UX-GRAPH-011 — Dettaglio flottante

Il dettaglio flottante mostra almeno nome, contesto/cartella e numero/insieme utile di collegamenti, e offre l'azione “Apri nota”.

### UX-GRAPH-012 — Apri nota

Aprire una nota dal dettaglio torna all'area editor/lettura, attiva la nota secondo il navigation model e preserva lo stato del grafo per un eventuale ritorno.

### UX-GRAPH-013 — Comandi indipendenti

`Centra vista`, `Cancella selezione` e `Ripristina filtri` sono operazioni separate. Nessuna deve cancellare stato non richiesto.

### UX-GRAPH-014 — Campagna vuota e note isolate

Il grafo gestisce esplicitamente:

- nessuna nota;
- note senza wikilink;
- un singolo nodo;
- nodi isolati;
- molte sottocartelle;
- più cartelle con lo stesso colore.

### UX-GRAPH-015 — Persistenza locale

Posizione della camera, filtri, eventuali posizioni manuali dei nodi e altre preferenze grafo sono stato locale per campagna, separato dai file Markdown.

---

## 11. Stati UI, salvataggio ed errori

### UX-SAVE-001 — Stati reali

Lo stato di una nota distingue almeno:

- `dirty`: buffer diverso dalla versione autorevole su disco;
- `saving`: scrittura realmente in corso;
- `saved`: versione corrente confermata come scritta correttamente;
- `error`: scrittura fallita o stato non confermato.

### UX-SAVE-002 — Nessun falso salvato

“Salvato” può essere mostrato solo dopo esito positivo della persistenza. La scadenza di un timer non è prova di salvataggio.

### UX-SAVE-003 — Autosave

L'autosave parte dopo una breve pausa di inattività.

**DEFAULT PROPOSTO:** 600 ms.

Non esiste una durata minima artificiale per lo stato `saving`.

### UX-SAVE-004 — Salvataggio manuale

`Ctrl/Cmd+S` forza immediatamente il tentativo di persistenza della versione corrente.

### UX-SAVE-005 — Cambio nota durante saving

L'utente può cambiare nota senza perdere il buffer. Il salvataggio continua o viene serializzato dal servizio applicativo; l'interfaccia deve mantenere lo stato per la nota di origine.

### UX-SAVE-006 — Bozza di recovery

Le modifiche non confermate vengono conservate in una bozza locale di recovery separata dal file autorevole.

### UX-SAVE-007 — Errore scrittura

In caso di errore:

- le modifiche restano visibili/recuperabili;
- lo stato `error` è persistente finché non risolto;
- sono disponibili riprova e percorso di esportazione/recupero;
- nessuna successiva navigazione deve fingere che la versione sia stata salvata.

### UX-SAVE-008 — Modifica esterna con nota pulita

Se il file cambia esternamente mentre la nota è pulita, l'app può ricaricare la nuova versione mantenendo il contesto possibile e informando l'utente quando rilevante.

### UX-SAVE-009 — Conflitto modifica esterna

Se il file cambia esternamente mentre esistono modifiche locali:

- autosave sospeso per quella nota;
- nessuna sovrascrittura automatica;
- confronto/decisione esplicita;
- entrambe le versioni devono restare recuperabili durante la risoluzione.

### UX-SAVE-010 — Recovery dopo interruzione

Dopo crash o chiusura inattesa, eventuali bozze di recovery vengono rilevate e proposte senza sovrascrivere automaticamente file più recenti.

### UX-STATE-001 — Stati generali

La UI deve avere comportamenti visivi coerenti per almeno:

- selected;
- hover;
- focus;
- loading;
- disabled;
- empty;
- dirty;
- saving;
- saved;
- error;
- conflict.

---

## 12. Pannelli e responsive desktop

### UX-PANEL-001 — Ridimensionamento

Sidebar e inspector sono ridimensionabili entro limiti che preservano usabilità e contenuto centrale.

### UX-PANEL-002 — Collasso

I pannelli possono essere collassati e riaperti senza perdere lo stato interno utile.

### UX-PANEL-003 — Priorità contenuto

Quando lo spazio diminuisce, il contenuto centrale ha priorità.

**DEFAULT PROPOSTO:**

- sotto ~1000 px si collassa automaticamente l'inspector;
- sotto ~760 px si collassa anche la sidebar;
- se lo spazio è insufficiente per due pannelli laterali, se ne mostra uno alla volta.

La scelta manuale recente dell'utente ha precedenza sull'automazione finché non rende il contenuto centrale inutilizzabile.

### UX-PANEL-004 — Persistenza

Dimensioni/collasso dei pannelli sono preferenze locali per campagna.

---

## 13. Keyboard, mouse e drag & drop

### UX-KEY-001 — Azioni primarie accessibili da tastiera

Ogni azione primaria deve avere un percorso da tastiera, anche se non tutte richiedono una shortcut globale.

### UX-KEY-002 — Shortcut minime

Vincolanti:

- `Ctrl/Cmd+K` → command palette;
- `Ctrl/Cmd+S` → salva subito;
- `Esc` → chiude overlay/menu/dialoghi secondo contesto e restituisce il focus.

Le altre shortcut vengono definite senza conflitti con editor e sistema operativo.

### UX-DND-001 — Drag & drop note/cartelle

Drag & drop di note/cartelle fornisce preview chiara del target, possibilità di annullamento e feedback dell'esito.

### UX-DND-002 — Alternativa al trascinamento

Ogni operazione di spostamento realizzabile via drag & drop deve avere un'alternativa tramite menu/comando accessibile da tastiera.

### UX-DND-003 — Riordino tab

Le tab possono essere riordinate via drag & drop e tramite alternativa da tastiera/menu se il riordino è significativo per il flusso.

### UX-DND-004 — Grafo

Il trascinamento nodo non modifica dati di dominio, come definito in `UX-GRAPH-004`.

---

## 14. Sistema visivo, motion e microinterazioni

La fonte primaria è `docs/DESIGN_DIRECTION.md`.

### UX-VIS-001 — Palette UI

- background: `#1E1333`;
- gradient companion: `#4D3B6B`;
- surface/highlight: `#3D1F48`;
- small controls/buttons: `#833D6F`;
- testo principale: `#FFFFFF`.

### UX-VIS-002 — Palette grafo

- `#9A85C0`;
- `#A8C6DE`;
- `#9CA98B`;
- `#EFDEBD`;
- `#8F5A5A`.

Sono colori del grafo/cartelle, non colori funzionali generici della UI.

### UX-VIS-003 — Eccezione pallino cartella

Il pallino colore nella sidebar è un'estensione semantica della codifica del grafo, non un accento decorativo.

### UX-MOTION-001 — Carattere

Motion leggero, liquido, liscio; occasionalmente bubbly e giocoso. Nessuna animazione deve ritardare un'azione frequente.

### UX-MOTION-002 — Default timing

**DEFAULT PROPOSTO:** 120–240 ms con easing simile a `cubic-bezier(.2,.8,.2,1)`.

### UX-MOTION-003 — Reduced motion

Con `prefers-reduced-motion` si eliminano overshoot e spostamenti decorativi non essenziali; feedback e stato restano comprensibili.

### UX-VIS-004 — Default tipografici

**DEFAULT PROPOSTO:**

- font UI di sistema;
- monospace per Markdown;
- testo UI ordinario ~13 px;
- secondario non inferiore a ~12 px;
- editor ~15 px;
- raggi iniziali 10/16/22 px.

Questi valori devono essere verificati nell'app reale.

---

## 15. Accessibilità

### UX-A11Y-001 — Obiettivo

La V0.1 deve essere verificata rispetto ai criteri **WCAG 2.2 AA applicabili** a un'app desktop web-tech, senza dichiarare conformità finché non misurata.

Riferimenti:

- https://www.w3.org/TR/WCAG22/
- https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- https://www.w3.org/WAI/ARIA/apg/patterns/combobox/

### UX-A11Y-002 — Focus

Focus visibile, prevedibile e non occultato. Overlay e dialoghi gestiscono entrata/uscita del focus in modo corretto.

### UX-A11Y-003 — Tastiera

Le funzioni principali sono utilizzabili senza drag & drop obbligatorio e senza mouse obbligatorio.

### UX-A11Y-004 — Colore

Errore, selezione, filtro e categoria non dipendono esclusivamente dal colore.

### UX-A11Y-005 — Grafo alternativo

Le informazioni essenziali espresse dal grafo devono restare accessibili tramite note, link/backlink, etichette o altra rappresentazione testuale.

### UX-A11Y-006 — Zoom

La UI deve essere verificata con zoom/testo al 200% senza perdita di funzionalità essenziale.

### UX-A11Y-007 — Annunci di stato

Salvataggio, errore e conflitto devono essere percepibili anche da tecnologie assistive con annunci non intrusivi appropriati.

---

## 16. Confini tra UI, dominio e persistenza

### UX-ARCH-001 — File operations

La UI non accede direttamente al filesystem. Creazione, scrittura, rinomina, spostamento e cestino passano da servizi/use case applicativi.

### UX-ARCH-002 — Preferenze locali

Tab, pannelli, recenti, preferiti, stato grafo e colori cartella sono metadati/preferenze locali appropriati e non devono contaminare il Markdown salvo decisione futura esplicita.

### UX-ARCH-003 — Bozze recovery

Le bozze di recovery sono separate dai file autorevoli e hanno ciclo di vita esplicito.

### UX-ARCH-004 — Dati derivati

Indice full-text, backlink cache e grafo sono ricostruibili a partire dai dati autorevoli.

### UX-ARCH-005 — Colori cartella

L'assegnazione colore è metadato locale della campagna/cartella; la UI del grafo consuma il valore senza dedurlo dal nome della cartella.

---

## 17. Anti-pattern e non-fare

### UX-NO-001

Non trasformare l'app in una dashboard decorativa di card quando l'utente deve lavorare direttamente sui contenuti.

### UX-NO-002

Non usare modali per azioni quotidiane se sidebar, inspector, menu contestuale o inline state sono sufficienti.

### UX-NO-003

Non usare i cinque colori del grafo come palette casuale per pulsanti, badge, alert o selezioni.

### UX-NO-004

Non mostrare `saved` sulla base di timer o ottimismo non confermato dalla persistenza.

### UX-NO-005

Non perdere tab, buffer, cursore o posizione solo perché si passa al grafo o si apre un'altra nota.

### UX-NO-006

Non imporre categorie predefinite nel grafo: filtri e legenda derivano dalle cartelle reali.

### UX-NO-007

Non fondere filesystem, rete futura, dominio, editor e preferenze UI in un unico store globale.

### UX-NO-008

Non fare fallback silenzioso da cestino a cancellazione permanente.

### UX-NO-009

Non sovrascrivere automaticamente modifiche locali in presenza di una modifica esterna concorrente.

### UX-NO-010

Non rendere il drag & drop l'unico modo di eseguire un'azione importante.

---

## 18. Scenari di accettazione e verifiche pendenti

### 18.1 Scenari funzionali

#### UX-ACC-001 — Cambio nota durante autosave

Dato un buffer `dirty`, quando l'utente apre un'altra nota prima del completamento del salvataggio, allora la nuova nota si apre senza perdita del buffer precedente e lo stato della nota precedente continua a riflettere l'esito reale della scrittura.

Verifica: `UX-NAV-001`, `UX-EDIT-006`, `UX-SAVE-005`.

#### UX-ACC-002 — Scrittura fallita

Dato un errore filesystem, quando un salvataggio fallisce, allora l'interfaccia mostra `error`, conserva il buffer, offre riprova e recovery e non mostra `saved`.

Verifica: `UX-SAVE-002`, `UX-SAVE-006`, `UX-SAVE-007`.

#### UX-ACC-003 — Recovery dopo crash

Dato un buffer non confermato, dopo riavvio l'utente deve poter recuperare la bozza senza sovrascrivere automaticamente una versione file più recente.

Verifica: `UX-SAVE-010`.

#### UX-ACC-004 — Modifica esterna pulita

Dato un file aperto ma non dirty, una modifica esterna viene recepita senza conflitto distruttivo.

Verifica: `UX-SAVE-008`.

#### UX-ACC-005 — Modifica esterna conflittuale

Dato un file dirty, una modifica esterna sospende autosave e richiede confronto/decisione esplicita.

Verifica: `UX-SAVE-009`.

#### UX-ACC-006 — Link mancante o ambiguo

Un wikilink non risolto non viene aperto arbitrariamente; lo stato è riconoscibile e permette il percorso previsto dalla UX per risolvere/creare la nota.

Verifica: `UX-EDIT-004`.

#### UX-ACC-007 — Rinomina

Rinominando una nota vengono aggiornati i wikilink risolti. Se alcuni aggiornamenti falliscono, l'utente vede l'esito parziale e nessun errore viene nascosto.

Verifica: `UX-VAULT-006`.

#### UX-ACC-008 — Cestino indisponibile

Se il sistema non può spostare un elemento nel cestino, la nota/cartella resta intatta finché l'utente non sceglie esplicitamente un'altra azione sicura prevista.

Verifica: `UX-VAULT-007`, `UX-NO-008`.

#### UX-ACC-009 — Grafo vuoto

Una campagna senza note mostra uno stato vuoto comprensibile, non un canvas rotto.

Verifica: `UX-GRAPH-014`.

#### UX-ACC-010 — Nota isolata

Una nota senza wikilink è comunque rappresentabile e apribile nel grafo.

Verifica: `UX-GRAPH-003`, `UX-GRAPH-014`.

#### UX-ACC-011 — Colore sottocartella

Una sottocartella senza colore esplicito usa il colore dell'antenato più vicino; assegnandole un colore proprio, solo quel ramo usa il nuovo valore.

Verifica: `UX-VAULT-009`, `UX-GRAPH-006`.

#### UX-ACC-012 — Selezione con filtro attivo

Con un filtro grafo attivo, selezionare un nodo evidenzia le relazioni senza azzerare il filtro; `Cancella selezione` non ripristina i filtri.

Verifica: `UX-GRAPH-008`, `UX-GRAPH-010`, `UX-GRAPH-013`.

#### UX-ACC-013 — Ritorno dal grafo

Aprendo una nota dal dettaglio grafo, l'utente torna all'editor e può successivamente tornare al grafo ritrovandone stato utile.

Verifica: `UX-NAV-005`, `UX-GRAPH-012`, `UX-GRAPH-015`.

### 18.2 Casi di carico UX da verificare

L'app futura deve essere provata almeno con:

- 200 note;
- 15 cartelle;
- nomi file/cartella lunghi;
- molte tab aperte;
- nota molto estesa;
- backlink numerosi;
- grafo con note isolate e sottocartelle profonde.

Dimensioni di verifica:

- 1440×900;
- 1024×768;
- 720×600;
- zoom/testo 200%.

### 18.3 Verifiche pendenti sull'implementazione

Sono da verificare sull'app reale, non da reinterpretare liberamente:

- corrispondenza visiva alla direzione dei mock;
- contrasto delle trasparenze;
- leggibilità dei testi secondari;
- validità dei default dimensionali;
- validità del debounce autosave da 600 ms;
- validità dei timing motion 120–240 ms;
- praticabilità di tutti i flussi da tastiera;
- fluidità del grafo con dataset realistici;
- comportamento al 200% zoom.

Se una verifica fallisce, si corregge il default documentando il motivo senza cambiare la direzione approvata.

### 18.4 Gate della specifica

Questa specifica è pronta per guidare l'implementazione quando:

- non esistono contraddizioni non spiegate tra scope V0.1, grafo e palette;
- ogni comportamento critico ha requisito stabile;
- i mock sono classificati come riferimenti e non come codice da copiare;
- il flusso completo apertura → modifica → wikilink → ricerca/grafo → salvataggio → chiusura → riapertura è coperto;
- errori filesystem, recovery, conflitti e cestino sono specificati;
- tutte le azioni primarie hanno un percorso accessibile da tastiera;
- nessun requisito critico resta formulato come “da decidere”.

---

## Regola finale

La V0.1 non è riuscita perché “assomiglia al mock”. È riuscita quando conserva la stessa chiarezza e leggerezza del mock **mentre** soddisfa tutti i requisiti di navigazione, persistenza, recovery, accessibilità e conservazione del contesto definiti qui.
