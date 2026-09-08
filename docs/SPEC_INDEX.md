# Campaign Manager v2 — Specification Index

## Scopo

Questo file è il punto di ingresso normativo per progettazione e implementazione.

Un agente deve partire da qui, individuare versione/area interessata e leggere le specifiche applicabili prima di modificare codice o prodotto.

---

# 1. Ordine di autorità

In caso di conflitto:

1. decisioni esplicite più recenti approvate dall'utente;
2. **`docs/V01_OPERATIONAL_SPEC.md` per qualunque comportamento V0.1**;
3. `docs/V01_PRODUCT_DECISIONS.md`;
4. specifica verticale più specifica (`UI_UX`, `DOMAIN`, `STORAGE`, `SEARCH`, `BOARD`, `LIVE`, `PROTOCOL`, `DISCORD`);
5. `PRODUCT.md`;
6. `architecture.md`;
7. `ROADMAP.md`;
8. `docs/FOUNDATION_GUARDRAILS.md`;
9. `docs/DESIGN_DIRECTION.md`;
10. mock/reference artifact.

Una contraddizione non si risolve inventando un terzo comportamento. Le specifiche più recenti possono anche **semplificare** una soluzione tecnica precedente quando conservano il comportamento di prodotto.

---

# 2. Costituzione del prodotto

## `PRODUCT.md`

Scopo, utenti, local-first, anti-lock-in e confini generali.

## `architecture.md`

Moduli, dipendenze e separazione tra dati persistenti, stato live e UI.

La struttura repository mostrata è una direzione, non un obbligo a creare package vuoti. V0.1 mantiene un application layer **logico**; la sua collocazione fisica viene scelta durante l'implementazione senza attraversare i confini architetturali.

## `ROADMAP.md`

Ordine di costruzione e gate delle versioni. Le specifiche normative prevalgono sui vecchi riassunti quando una fase è stata progettata più in dettaglio.

---

# 3. Contratto operativo V0.1

## `docs/V01_OPERATIONAL_SPEC.md`

È la fonte integrata della V0.1.

Definisce:

- ownership applicativa senza imporre package/layer cerimoniali;
- open/init/switch/close campagna e copie con `CampaignId` duplicato;
- draft note e titolo automatico 1–3 parole;
- tab, folder CRUD, Markdown e wikilink;
- frontmatter preservato ma **non interpretato come metadata applicativo V0.1**;
- safe save, recovery semplice e conflitti esterni;
- rename/move con **repair record minimale**, non transaction engine generale;
- trash tramite cestino;
- Recenti/Preferiti/sidebar filter;
- Search centrale e command palette;
- graph filtering e layout senza persistenza manuale obbligatoria;
- Settings minime;
- errori, keyboard, Windows gate;
- stress test grandi separati dai gate di release.

Prefisso: `OPS-*`.

Un goal V0.1 deve citare questa specifica oltre alle verticali applicabili.

---

# 4. Specifiche verticali V0.1

## `docs/V01_PRODUCT_DECISIONS.md`

Auto-init, copia/ID duplicato, draft note, titolo automatico, rename titolo, wikilink, ricerca centrale, supporto Windows.

## `docs/UI_UX_SPEC_V01.md`

Shell, layout, navigation model, editor/lettura, inspector, search, command palette, graph, save states, panels, keyboard e accessibilità.

## `docs/DOMAIN_MODEL.md`

`CampaignId`, `NoteId`, `FolderId`, `NoteRevision`, note/cartelle, wikilink/backlink, rename/move, trash, conflict e graph projection.

## `docs/STORAGE_SPEC.md`

`campaign.json`, filesystem, safe write, revision, watcher, recovery, preferences, repair metadata, trash, migration ed errori storage.

Quando la formulazione storica parla di operation journal generico, prevale la soluzione minimale definita da `OPS-MOVE-*`.

## `docs/SEARCH_SPEC.md`

Indice derivato, ranking, rebuild, aggiornamenti incrementali e command provider.

La V0.1 indicizza titolo/path/corpo; **alias e altri campi frontmatter non sono feature V0.1**.

## `docs/DESIGN_DIRECTION.md`

Palette, gerarchia, graph colors, forme e motion. I numeri visuali restano default verificabili quando non cambiano la semantica.

---

# 5. Board V0.2

## `docs/BOARD_SPEC.md`

Board locale e proiezione live futura: formato, strumenti, elementi, asset, card da estratti note, token, z-order/groups/lock, visibilità, salvataggio e casi limite.

Prefisso: `BRD-*`.

---

# 6. Live V0.3

## `docs/LIVE_SESSION_SPEC.md`

Lifecycle sessione web standalone, identity/join/resume, board switching, asset, token, reconnect, host disconnect e session end.

Prefisso: `LIVE-*`.

## `docs/PROTOCOL_SPEC.md`

Contratto realtime desktop/relay/player: transport, auth/ticket, versioning, snapshot/resync, comandi, errori e asset.

Prefisso: `PRO-*`.

---

# 7. Discord V0.4

## `docs/DISCORD_ACTIVITY_SPEC.md`

Activity come tavolo del giocatore, Activity instance join, pairing master-only e Discord come adapter del modello live generico.

Prefisso: `ACT-*`.

Quando un dettaglio è già definito da Live/Protocol, Discord lo eredita invece di crearne una variante.

---

# 8. Compendio e fondazione futura

## `docs/COMPENDIUM_SPEC.md`

Contratto del compendio sostituibile. L'esistenza della spec non promuove la feature in V0.1.

## `docs/FOUNDATION_GUARDRAILS.md`

Guardrail EcoGDR futuri senza introdurre account/auth/sync prematuramente.

---

# 9. Mappa area → fonti

| Area | Fonti normative |
|---|---|
| lifecycle campagna V0.1 | Operational + Storage + UI/UX |
| note/draft/titolo | Operational + Product Decisions + Domain + Storage |
| cartelle | Operational + Domain + Storage + UI/UX |
| Markdown/frontmatter | Operational + Domain |
| wikilink/backlink | Operational + Domain + UI/UX |
| save/recovery/conflict | Operational + Storage + UI/UX |
| rename/move/trash | Operational + Domain + Storage |
| recenti/preferiti | Operational + UI/UX + Storage |
| search/command palette | Operational + Search + UI/UX |
| graph | Operational + Domain + UI/UX + Design |
| architettura V0.1 | Operational + architecture |
| board | Board Spec |
| live session | Live Session + Board |
| protocollo realtime | Protocol + Live Session |
| Discord | Discord Activity + Live/Protocol |
| compendio | Compendium Spec |

---

# 10. Documenti ancora da produrre

Non serve una `WIKILINK_SPEC.md` per sbloccare V0.1.

Restano da produrre solo quando la roadmap li promuove:

1. `docs/AI_SPEC.md` prima della V0.5;
2. specifiche personaggi/EcoGDR/integrations quando diventano feature reali;
3. addendum tecnici solo se l'implementazione scopre un problema non coperto.

---

# 11. Regola anti-over-engineering per i goal

Un goal deve implementare il **minimo design che soddisfa i requisiti approvati**.

Non deve creare framework generici, package vuoti, astrazioni future o ottimizzazioni preventive solo perché la documentazione descrive un concetto separato.

Se una soluzione semplice soddisfa i contract test e conserva i confini di responsabilità, è preferibile a una soluzione più generalizzata.

---

## Regola finale

La documentazione è sufficiente quando l'agente deve decidere **come scrivere il codice**, ma non deve sentirsi obbligato a costruire infrastruttura che il prodotto non usa.