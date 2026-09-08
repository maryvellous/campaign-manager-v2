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
- cosa appartiene a ciascuna versione;
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

# 5. Board — V0.2

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
- fine sessione con scelta esplicita se applicare le posizioni finali dei token alla board preparata;
- casi limite e scenari di accettazione.

Prefisso requisiti: `BRD-*`.

---

# 6. Live session e protocollo — V0.3

## `docs/LIVE_SESSION_SPEC.md`

Autorità sul comportamento della sessione live.

Definisce:

- autorità distinte filesystem / desktop DM / relay;
- un solo host DM e una sola live session attiva per desktop;
- `liveSessionId`, host resume credential e participant identity;
- session join code standalone `ABCD-EFGH`;
- pairing code Discord `ABC-DEF`, monouso, 10 minuti;
- start senza wizard, join lock e rotazione join code;
- ingresso standalone senza account obbligatorio;
- participant presence, removal e token assignments runtime;
- una board visibile alla volta ma più board preservate nella stessa sessione;
- switch atomico, waiting state e reset live esplicito;
- pubblicazione asset on-demand e cleanup;
- token preview/commit e ping;
- participant reconnect tramite resume;
- host disconnect con freeze + 10 minuti di grace;
- chiusura volontaria, chiusura app e salvataggio finale delle posizioni token;
- pannello live DM compatto;
- limiti intenzionali e scenari end-to-end.

Prefisso requisiti: `LIVE-*`.

## `docs/PROTOCOL_SPEC.md`

Autorità sul contratto realtime condiviso.

Definisce:

- HTTPS per create/join/ticket/assets + WSS per realtime;
- Durable Object per sessione e WebSocket Hibernation;
- ticket WebSocket monouso da 60 secondi;
- protocol versioning e runtime schema validation;
- envelope, `requestId`, `stateSeq` e distinzione durable/effimero;
- snapshot al connect/reconnect e resync senza event replay obbligatorio;
- comandi host e player stretti;
- token preview a frequenza limitata + commit autorevole;
- server events, accepted/rejected e idempotenza;
- error taxonomy;
- `publishedAssetId`, upload/download temporanei e fingerprint;
- stato consentito/vietato nel relay;
- batching/backpressure e rate limiting;
- Discord adapter senza fork del protocollo;
- logging/privacy e quality gates.

Prefisso requisiti: `PRO-*`.

---

# 7. Discord Activity — V0.4

## `docs/DISCORD_ACTIVITY_SPEC.md`

Autorità sulla UX e sull'adapter Discord.

Definisce:

- Activity come tavolo del giocatore;
- waiting state e board come superficie principale;
- layout player utilizzabile anche su viewport piccoli;
- join tramite Activity instance/`instanceId`;
- pairing code master-only;
- binding runtime `instanceId ↔ liveSessionId`;
- identity Discord verificata → `participantId`;
- Activity del master distinta dall'host desktop;
- comportamento quando tutti lasciano l'istanza;
- stessi permessi, board switching e host reconnect della live session;
- nessun protocollo Discord-specifico;
- browser standalone sempre supportato.

Prefisso requisiti: `ACT-*`.

---

# 8. Compendio

## `docs/COMPENDIUM_SPEC.md`

Autorità sul contratto del compendio, indipendentemente dal momento in cui la feature verrà inserita nella roadmap.

Definisce identità, ruleset, sorgenti, lingue, `CompendiumRepository`, fixture temporanee, licensing e futuro adapter EcoGDR.

Prefisso requisiti: `CMP-*`.

---

# 9. Design e riferimenti

## `docs/DESIGN_DIRECTION.md`

Autorità sulla direzione visiva: palette, gerarchia colori, graph colors, forme, motion e reduced motion.

## `docs/palette.svg`

Reference palette originale.

## `docs/references/README.md`

Registro dei mock canonici approvati e delle rispettive impronte.

---

# 10. Mappa requisito → livello responsabile

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
| lifecycle live | Live Session Spec | desktop session service + relay |
| ingresso standalone | Live Session + Protocol | web client + relay |
| participant/token permissions | Live Session + Protocol | relay authority + desktop UI |
| board live/switch | Board + Live Session + Protocol | desktop + relay + player client |
| asset live | Board + Live Session + Protocol | desktop + R2/relay + player client |
| realtime transport | Protocol Spec | protocol package + relay adapters |
| reconnect/resync | Live Session + Protocol | relay + all clients |
| Discord Activity | Discord Activity + Live Session + Protocol | activity client + Discord adapter |
| pairing Discord | Discord Activity + Live Session + Protocol | relay + activity + desktop |
| compendio | Compendium Spec | repository adapter + application |
| EcoGDR futuro | Foundation Guardrails | future adapter boundary |

---

# 11. Documenti ancora da produrre

Le specifiche Board V0.2, Live V0.3, Protocol V0.3 e Discord V0.4 ora hanno contratti di prodotto sostanziali.

Restano soprattutto:

1. `docs/WIKILINK_SPEC.md` — solo se `DOMAIN_MODEL.md` e le decisioni V0.1 si dimostrano insufficienti durante l'implementazione;
2. `docs/AI_SPEC.md` — prima della V0.5;
3. eventuali spec personaggi/EcoGDR/integrations solo quando la roadmap le promuove;
4. eventuali approfondimenti di performance/limiti soltanto dopo misure sull'implementazione reale.

Non creare specifiche dettagliate di versioni lontane soltanto per accumulare documentazione.

---

# 12. Regola per i goal di implementazione

Un goal futuro deve indicare esplicitamente quali famiglie di requisiti implementa e non può modificare i contratti approvati soltanto per semplificare il codice.

Esempio V0.3:

```text
Implementa sessione live standalone secondo:
- BOARD_SPEC.md per la proiezione pubblica della board;
- LIVE_SESSION_SPEC.md per lifecycle, join, participant e UX;
- PROTOCOL_SPEC.md per transport, schema, stateSeq, snapshot e permessi;
- architecture.md per i confini desktop/relay/client.

Non aggiungere dipendenze Discord alla V0.3.
Non trasferire dati privati della campagna al relay per filtrarli lato client.
Completa i quality gate LIVE-QA-* e PRO-QA-* applicabili.
```

Se trova una contraddizione, segnala il requisito coinvolto invece di inventare un comportamento.

---

## Regola finale

La documentazione è sufficiente quando l'agente deve principalmente decidere **come scrivere il codice**, non **che prodotto stiamo costruendo**.