# Campaign Manager v2 — Specification Index

## Scopo

Questo file è il punto di ingresso per chi deve progettare o implementare il Campaign Manager v2.

Un agente o sviluppatore non dovrebbe iniziare una milestone leggendo documenti a caso: deve partire da questo indice, individuare le specifiche applicabili e rispettarne l'ordine di autorità.

---

# 1. Ordine di autorità

In caso di conflitto:

1. decisioni esplicite più recenti approvate dall'utente;
2. `docs/V01_PRODUCT_DECISIONS.md` per le decisioni V0.1 già consolidate;
3. specifica normativa più specifica per il comportamento interessato;
4. `PRODUCT.md`;
5. `architecture.md`;
6. `ROADMAP.md`;
7. `docs/FOUNDATION_GUARDRAILS.md`;
8. `docs/DESIGN_DIRECTION.md`;
9. mock/reference artifact.

Una contraddizione tra documenti non deve essere risolta inventando una terza soluzione: va riallineata la documentazione.

---

# 2. Costituzione del prodotto

## `PRODUCT.md`

Risponde a:

- cos'è il prodotto;
- chi serve;
- cosa deve fare;
- cosa non vuole diventare;
- quali sono i principi local-first e anti-lock-in.

Non contiene i dettagli implementativi di ogni feature.

## `architecture.md`

Risponde a:

- quali moduli esistono;
- quali dipendenze sono ammesse;
- dove vive una responsabilità;
- quali dati sono autorevoli, derivati, live o UI;
- quali confini non devono essere attraversati.

## `ROADMAP.md`

Risponde a:

- in quale ordine si costruisce;
- cosa appartiene alla V0.1;
- quali gate devono essere superati;
- cosa non va anticipato.

---

# 3. Decisioni e guardrail di fondazione

## `docs/V01_PRODUCT_DECISIONS.md`

Registro normativo delle decisioni V0.1 approvate dopo la prima stesura delle specifiche verticali.

Definisce in particolare:

- inizializzazione automatica e non distruttiva di una nuova cartella campagna;
- comportamento quando una campagna viene copiata e il `CampaignId` risulta duplicato;
- nuova nota come draft temporaneo;
- titolo automatico ricavato dalle prime 1–3 parole significative;
- collisioni del titolo automatico senza suffissi inventati;
- conferma della rinomina tramite Invio/blur e annullamento tramite Esc;
- comportamento dei wikilink univoci, ambigui e mancanti;
- ricerca full-text come vista centrale distinta dalla command palette;
- Windows come piattaforma ufficialmente supportata per la V0.1, mantenendo architettura portability-first.

Prefisso decisioni: `DEC-V01-*`.

Quando una formulazione più vecchia in una specifica verticale è incompatibile con questo registro, prevale la decisione registrata qui fino al riallineamento editoriale.

## `docs/FOUNDATION_GUARDRAILS.md`

Definisce il minimo necessario per non dover riscrivere il Campaign Manager quando arriverà EcoGDR.

Regola:

> preparare gli agganci, non costruire ancora il ponte.

Contiene anche i vincoli che rendono sostituibile il compendio temporaneo.

---

# 4. Specifiche normative V0.1

## `docs/UI_UX_SPEC_V01.md`

Autorità sui comportamenti osservabili dell'interfaccia:

- layout;
- navigazione;
- tab e cronologia;
- editor/lettura;
- salvataggio e recovery percepito;
- conflitti;
- vault explorer;
- search e command palette;
- graph view;
- focus, tastiera, drag & drop;
- responsive desktop;
- accessibilità;
- scenari di accettazione UX.

Prefisso requisiti: `UX-*`.

## `docs/DOMAIN_MODEL.md`

Autorità sul significato dei dati e sui use case core:

- `CampaignId`;
- `NoteId`;
- `FolderId`;
- `NoteRevision`;
- campagna;
- nota;
- cartella;
- wikilink;
- backlink;
- rinomina/spostamento;
- cestino;
- conflitti;
- graph projection;
- repository contracts.

Prefisso requisiti: `DOM-*`.

## `docs/STORAGE_SPEC.md`

Autorità sulla persistenza locale:

- `campaign.json`;
- path e filesystem;
- encoding;
- revisioni;
- scrittura atomica;
- file watcher;
- recovery draft;
- preferenze locali;
- indici derivati;
- operation journal;
- trash adapter;
- migrazioni;
- error taxonomy;
- test storage.

Prefisso requisiti: `STO-*`.

## `docs/SEARCH_SPEC.md`

Autorità sulla ricerca locale e sull'indice derivato:

- distinzione tra filtro sidebar, full-text e command palette;
- documento indicizzato;
- normalizzazione query;
- ranking lessicale;
- boost titolo/percorso/corpo;
- snippet e risultati;
- rebuild completo;
- aggiornamenti incrementali;
- revisioni indicizzate;
- separazione da backlink e graph projection;
- command action provider;
- schema/versione dell'indice;
- errori e recovery;
- contract test search.

Prefisso requisiti: `SEA-*`.

---

# 5. Board

## `docs/BOARD_SPEC.md`

Prima specifica normativa della board V0.2 e della sua proiezione live futura.

Definisce già come decisioni approvate:

- board semplice, non VTT universale;
- sei strumenti master: Seleziona, Mano, Nota/Testo, Immagine, Token, Collegamento;
- azioni come duplica, blocca, z-order e raggruppa come controlli contestuali;
- note del vault aggiunte via drag & drop/comando equivalente;
- tipi di elemento immagine, testo board, nota collegata, token e collegamento;
- nessun path persistente verso file esterni alla campagna;
- drag di file esterno = import automatico nella campagna;
- rimozione dalla board distinta dalla cancellazione fisica dell'asset;
- board preparata distinta dalla proiezione live;
- elementi privati mai inviati al client giocatore;
- pan/zoom indipendenti, ping e comando master `Porta tutti qui`;
- token dei giocatori controllabili soltanto con autorizzazione validata;
- sincronizzazione live tramite snapshot + eventi incrementali, non video streaming;
- asset pesanti pubblicati separatamente dagli eventi realtime;
- reconnect tramite snapshot corrente.

Prefisso requisiti: `BRD-*`.

La UX del contenuto pubblico delle card di note collegate resta intenzionalmente aperta finché non viene approvata.

---

# 6. Compendio

## `docs/COMPENDIUM_SPEC.md`

Autorità sul contratto del compendio, indipendentemente dal momento in cui la feature verrà inserita nella roadmap.

Definisce:

- `GameSystemId`;
- `RulesetId`;
- `SourceId`;
- `EntryId`;
- identità indipendente dalla lingua;
- localizzazioni;
- `CompendiumRepository`;
- fixture JSON temporanea;
- versionamento dataset;
- licensing metadata;
- contract tests;
- futuro adapter EcoGDR.

Prefisso requisiti: `CMP-*`.

L'esistenza della specifica non significa che networking o database EcoGDR siano parte della V0.1.

---

# 7. Live e Discord

## `docs/DISCORD_ACTIVITY_SPEC.md`

Prima specifica normativa della Discord Activity futura (V0.4).

Definisce già come decisioni approvate:

- Activity come "tavolo del giocatore", non mini Campaign Manager;
- waiting state e board condivisa come superficie principale;
- visibilità soltanto di contenuti pubblicati dal DM;
- controllo limitato ai token autorizzati;
- ingresso Discord tramite la stessa Activity instance/`instanceId`;
- nessun codice richiesto ai giocatori nel flusso Discord normale;
- pairing code breve, temporaneo e monouso usato soltanto dal master per associare desktop e Activity instance;
- binding runtime `instanceId ↔ liveSessionId` nel relay;
- web client standalone precedente a Discord;
- session join code separato per il fallback/browser standalone;
- Discord SDK come adapter, non dipendenza del dominio live;
- validazione server-side dell'istanza e dei permessi.

Prefisso requisiti: `ACT-*`.

---

# 8. Design e riferimenti

## `docs/DESIGN_DIRECTION.md`

Autorità sulla direzione visiva:

- palette;
- gerarchia colori;
- graph colors;
- eccezione pallino cartella;
- forme;
- motion;
- microinterazioni;
- reduced motion.

I numeri dei mock restano default da validare quando la specifica UI/UX lo dichiara.

## `docs/palette.svg`

Reference palette originale.

## `docs/references/README.md`

Registro dei mock canonici approvati e delle rispettive impronte.

---

# 9. Mappa requisito → livello responsabile

| Area | Specifica primaria | Livello principale |
|---|---|---|
| apertura campagna | V01 Decisions + UI/UX + Storage | desktop/application + storage |
| copia/duplicazione campagna | V01 Decisions + Storage | application + storage |
| nuova nota e titolo automatico | V01 Decisions + UI/UX + Domain + Storage | application orchestration |
| note e identità | Domain + Storage | core + storage |
| autosave | UI/UX + Storage | application + storage |
| recovery | UI/UX + Storage | application + storage |
| modifica esterna | Domain + Storage + UI/UX | tutti e tre |
| rename/move | V01 Decisions + Domain + Storage + UI/UX | application orchestration |
| wikilink | V01 Decisions + Domain | core + UI |
| backlink | Domain | derived projection |
| ricerca vault | V01 Decisions + Search + UI/UX | derived index + application |
| command palette | Search + UI/UX | application + action registry |
| graph view | UI/UX + Domain | UI + derived projection |
| folder colors | UI/UX + Domain + Design | preferences + UI |
| cestino | UI/UX + Domain + Storage | application + OS adapter |
| piattaforma V0.1 | V01 Decisions + Architecture/Storage | Windows adapter + quality gate |
| board locale | Board Spec | board domain + desktop UI + storage |
| asset board | Board Spec + future board storage detail | desktop/application + storage |
| proiezione board live | Board Spec + future Live/Protocol Specs | desktop + relay + player client |
| compendio | Compendium Spec | repository adapter + application |
| Discord Activity | Discord Activity Spec | activity client + Discord adapter |
| pairing Discord | Discord Activity Spec + future Live/Protocol Specs | relay + activity + desktop |
| EcoGDR futuro | Foundation Guardrails | future adapter boundary |

---

# 10. Documenti ancora da produrre

Per arrivare al modello "pochi goal, poca interpretazione" mancano soprattutto specifiche verticali delle feature successive o documenti più profondi solo dove l'implementazione dimostrerà che servono.

Ordine consigliato:

1. `docs/WIKILINK_SPEC.md` — solo se il livello di dettaglio in `DOMAIN_MODEL.md` e nel registro decisionale non basta durante l'implementazione;
2. completare `docs/BOARD_SPEC.md` prima della V0.2 con formato persistente e UX ancora aperte;
3. `docs/LIVE_SESSION_SPEC.md` e `docs/PROTOCOL_SPEC.md` — prima della V0.3;
4. approfondire `docs/DISCORD_ACTIVITY_SPEC.md` contro i contratti live/protocol definitivi prima della V0.4;
5. `docs/AI_SPEC.md` — prima della V0.5;
6. eventuali spec personaggi/integrations solo quando la roadmap le promuove.

Non creare specifiche dettagliate di versioni lontane soltanto per accumulare documentazione: vanno scritte quando le decisioni di prodotto sono abbastanza reali da essere utili.

---

# 11. Regola per i goal di implementazione

Un goal futuro dovrebbe indicare esplicitamente quali famiglie di requisiti implementa.

Esempio:

```text
Implementa ricerca e accesso rapido V0.1 secondo:
- V01_PRODUCT_DECISIONS.md per le decisioni approvate che incidono sul flusso;
- SEARCH_SPEC.md: SEA-CORE-*, SEA-DOC-*, SEA-RANK-*, SEA-IDX-*, SEA-INC-*, SEA-CMD-*
- DOMAIN_MODEL.md per NoteId, NoteRevision e wikilink canonici
- STORAGE_SPEC.md per persistenza, revisioni e cache derivate
- UI_UX_SPEC_V01.md per comportamento osservabile, focus e navigazione.

Non modificare i contratti approvati per semplificare l'implementazione.
Se trovi una contraddizione tra specifiche, segnala il requisito coinvolto invece di inventare un comportamento.
Completa i contract test e i criteri di accettazione applicabili prima di dichiarare il goal concluso.
```

---

## Regola finale

La documentazione è sufficiente quando l'agente deve principalmente decidere **come scrivere il codice**, non **che prodotto stiamo costruendo**.
