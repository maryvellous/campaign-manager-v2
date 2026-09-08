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

## `docs/FOUNDATION_GUARDRAILS.md`

Definisce il minimo necessario per non dover riscrivere il Campaign Manager quando arriverà EcoGDR.

Regola:

> preparare gli agganci, non costruire ancora il ponte.

---

# 4. Specifiche normative V0.1

## `docs/UI_UX_SPEC_V01.md`

Autorità sui comportamenti osservabili dell'interfaccia: layout, navigazione, editor, salvataggio, recovery, vault explorer, search, command palette, graph view, focus, tastiera, drag & drop e accessibilità.

Prefisso requisiti: `UX-*`.

## `docs/DOMAIN_MODEL.md`

Autorità su significato dei dati e use case core: campagna, note, cartelle, identità, wikilink, backlink, rename/move, cestino, conflitti e graph projection.

Prefisso requisiti: `DOM-*`.

## `docs/STORAGE_SPEC.md`

Autorità sulla persistenza locale: `campaign.json`, path, filesystem, revisioni, scrittura sicura, watcher, recovery, preferenze, indici derivati, journal, trash, migrazioni ed errori.

Prefisso requisiti: `STO-*`.

## `docs/SEARCH_SPEC.md`

Autorità sulla ricerca locale: full-text, indice derivato, ranking, rebuild, aggiornamenti incrementali, command palette e contract test.

Prefisso requisiti: `SEA-*`.

---

# 5. Board

## `docs/BOARD_SPEC.md`

Specifica normativa completa della board V0.2 e dei comportamenti della sua proiezione live usati in V0.3.

Definisce:

- formato persistente `*.board.json`, `boardId` stabile e creazione/rinomina;
- autosave, recovery e conflitti;
- sei strumenti master: Seleziona, Mano, Nota/Testo, Immagine, Token, Collegamento;
- selezione singola/multipla, resize, nudge e undo/redo;
- z-order, lock e gruppi semplici;
- testo board;
- immagini e import automatico in `Assets/Board/`;
- nessun path persistente verso file esterni;
- card collegate a note e card da estratti selezionati;
- comando `Porta sulla board…`;
- estratti come snapshot sicuri, modificabili sulla board ma mai sincronizzati automaticamente col Markdown privato;
- comportamento su rename/move/delete della nota sorgente;
- token, immagini opzionali e assegnazione runtime ai giocatori;
- collegamenti visuali e privacy degli endpoint;
- board freeform senza griglia/snap nella V0.2;
- visibilità privata di default e distinzione tra default preparato e reveal/hide live;
- pan/zoom indipendenti, ping e comando one-shot `Porta tutti qui`;
- sincronizzazione tramite snapshot + eventi, non video streaming;
- asset pubblicati separatamente dai messaggi realtime;
- reconnect tramite snapshot;
- fine sessione con scelta esplicita se applicare le posizioni finali dei token alla board preparata;
- casi limite e scenari di accettazione.

Prefisso requisiti: `BRD-*`.

Le decisioni di prodotto principali della board non risultano più aperte. I dettagli futuri di rete, autorizzazione, scadenze e nomi degli eventi appartengono a `LIVE_SESSION_SPEC.md` e `PROTOCOL_SPEC.md`.

---

# 6. Compendio

## `docs/COMPENDIUM_SPEC.md`

Autorità sul contratto del compendio, indipendentemente dal momento in cui la feature verrà inserita nella roadmap.

Definisce identità, ruleset, sorgenti, lingue, `CompendiumRepository`, fixture temporanee, licensing e futuro adapter EcoGDR.

Prefisso requisiti: `CMP-*`.

---

# 7. Live e Discord

## `docs/DISCORD_ACTIVITY_SPEC.md`

Prima specifica normativa della Discord Activity futura (V0.4).

Definisce già:

- Activity come tavolo del giocatore;
- waiting state e board come superficie principale;
- solo contenuti pubblicati dal DM;
- token autorizzati;
- join tramite Activity instance/`instanceId`;
- pairing code master-only;
- binding runtime `instanceId ↔ liveSessionId`;
- web client standalone precedente a Discord;
- session join code separato;
- Discord SDK come adapter.

Prefisso requisiti: `ACT-*`.

---

# 8. Design e riferimenti

## `docs/DESIGN_DIRECTION.md`

Autorità sulla direzione visiva: palette, gerarchia colori, graph colors, forme, motion e reduced motion.

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
| autosave/recovery | UI/UX + Storage | application + storage |
| rename/move | V01 Decisions + Domain + Storage + UI/UX | application orchestration |
| wikilink/backlink | V01 Decisions + Domain | core + derived projection |
| ricerca vault | V01 Decisions + Search + UI/UX | derived index + application |
| graph view | UI/UX + Domain | UI + derived projection |
| board locale | Board Spec | board domain + desktop UI + storage |
| asset board | Board Spec | desktop/application + storage |
| note/estratti sulla board | Board Spec + Domain | board application + note references |
| token board | Board Spec | board domain + live runtime later |
| proiezione board live | Board Spec + future Live/Protocol Specs | desktop + relay + player client |
| compendio | Compendium Spec | repository adapter + application |
| Discord Activity | Discord Activity Spec | activity client + Discord adapter |
| pairing Discord | Discord Activity Spec + future Live/Protocol Specs | relay + activity + desktop |
| EcoGDR futuro | Foundation Guardrails | future adapter boundary |

---

# 10. Documenti ancora da produrre

Per arrivare al modello "pochi goal, poca interpretazione" mancano soprattutto le specifiche verticali delle versioni successive:

1. `docs/WIKILINK_SPEC.md` — solo se il livello di dettaglio in `DOMAIN_MODEL.md` e nel registro decisionale si dimostra insufficiente;
2. `docs/LIVE_SESSION_SPEC.md` e `docs/PROTOCOL_SPEC.md` — prima della V0.3;
3. approfondire `docs/DISCORD_ACTIVITY_SPEC.md` contro i contratti live/protocol definitivi prima della V0.4;
4. `docs/AI_SPEC.md` — prima della V0.5;
5. eventuali spec personaggi/integrations solo quando la roadmap le promuove.

Non creare specifiche dettagliate di versioni lontane soltanto per accumulare documentazione.

---

# 11. Regola per i goal di implementazione

Un goal futuro deve indicare esplicitamente quali famiglie di requisiti implementa e non può modificare i contratti approvati soltanto per semplificare il codice.

Se trova una contraddizione, segnala il requisito coinvolto invece di inventare un comportamento.

---

## Regola finale

La documentazione è sufficiente quando l'agente deve principalmente decidere **come scrivere il codice**, non **che prodotto stiamo costruendo**.
