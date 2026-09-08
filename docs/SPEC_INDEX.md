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

Una contraddizione non si risolve inventando un terzo comportamento. Per V0.1, `V01_OPERATIONAL_SPEC.md` chiude esplicitamente le formulazioni storiche vaghe come `se supportato`, `può`, `default proposto` o `da decidere` quando incidono sul prodotto.

---

# 2. Costituzione del prodotto

## `PRODUCT.md`

Definisce scopo, utenti, local-first, anti-lock-in e confini generali del prodotto.

## `architecture.md`

Definisce moduli, dipendenze e separazione tra dati persistenti, stato live e UI.

Per la struttura V0.1, `V01_OPERATIONAL_SPEC.md` rende espliciti `packages/application` e `packages/search` e prevale sulla struttura storica più compatta mostrata in architecture/roadmap.

## `ROADMAP.md`

Definisce ordine di costruzione e gate delle versioni. Le specifiche normative prevalgono sui riassunti di roadmap quando una feature è stata progettata più in dettaglio dopo la stesura della roadmap.

---

# 3. Contratto operativo V0.1

## `docs/V01_OPERATIONAL_SPEC.md`

È la **fonte normativa integrata della V0.1**.

Chiude in modo operativo:

- application layer e ownership dei buffer/use case;
- startup, recent campaigns, open/init/switch/close;
- assenza di modalità read-only V0.1;
- duplicazione `CampaignId` e campagne spostate;
- path policy e case collision;
- nuova nota come draft, titolo automatico 1–3 parole e materializzazione;
- tab/history/close behavior;
- CRUD completo delle cartelle;
- Markdown CommonMark + GFM;
- frontmatter YAML e `aliases` canonici;
- local images e sicurezza dei link;
- wikilink canonici, code contexts, missing/ambiguous UX e create target;
- autosave/recovery cadence e recovery per draft non ancora materializzati;
- external changes, missing file e conflict resolution;
- rename/move multi-file, ordering, journal e crash recovery forward-only;
- trash senza permanent-delete fallback;
- Recenti/Preferiti/sidebar filter;
- vista Search, diacritics, index states e command palette minima;
- graph directed edges, multi-filter folder, descendant semantics e layout persistence;
- Settings V0.1 minime;
- error taxonomy e mapping UX;
- Windows gate e target di robustezza fino a 2.000 note / 100 cartelle;
- scenari end-to-end `OPS-ACC-*`.

Prefisso requisiti: `OPS-*`.

Un goal di implementazione V0.1 deve sempre citare questa specifica oltre alle specifiche verticali applicabili.

---

# 4. Specifiche verticali V0.1

## `docs/V01_PRODUCT_DECISIONS.md`

Registro delle decisioni approvate: auto-init campagna, copia/ID duplicato, draft note, titolo automatico, rename titolo, wikilink, ricerca centrale, supporto Windows.

Prefisso: `DEC-V01-*`.

## `docs/UI_UX_SPEC_V01.md`

Autorità verticale su shell, layout, navigation model, editor/lettura, inspector, search, command palette, graph, save states, panels, keyboard, accessibility e visual behavior.

Le ambiguità storiche sono risolte da `V01_OPERATIONAL_SPEC.md`.

Prefisso: `UX-*`.

## `docs/DOMAIN_MODEL.md`

Autorità verticale su `CampaignId`, `NoteId`, `FolderId`, `NoteRevision`, note/cartelle, wikilink/backlink, rename/move, trash, conflict e graph projection.

Prefisso: `DOM-*`.

## `docs/STORAGE_SPEC.md`

Autorità verticale su `campaign.json`, filesystem, safe write, revision, watcher, recovery, preferences, journal, trash, migration ed errori storage.

Il formato recovery per draft non materializzati è esteso da `OPS-SAVE-003`.

Prefisso: `STO-*`.

## `docs/SEARCH_SPEC.md`

Autorità verticale su indice derivato, ranking, rebuild, aggiornamenti incrementali, command provider e contract test.

V0.1 rende obbligatori alias canonici e diacritic-insensitive matching tramite l'Operational Spec.

Prefisso: `SEA-*`.

## `docs/DESIGN_DIRECTION.md`

Palette, hierarchy, graph colors, shapes e motion. I numeri visuali restano default verificabili quando non modificano la semantica operativa.

---

# 5. Board V0.2

## `docs/BOARD_SPEC.md`

Specifica normativa completa della board locale e della sua proiezione live futura.

Definisce formato `*.board.json`, strumenti, elementi, asset, card da estratti note, token, z-order/groups/lock, visibilità, snapshot/eventi, reconnect e fine sessione.

Prefisso: `BRD-*`.

---

# 6. Live V0.3

## `docs/LIVE_SESSION_SPEC.md`

Contratto di prodotto della sessione web standalone: lifecycle, host/player identity, join/resume, codes, board switching, asset, token, reconnect, host timeout e session end.

Prefisso: `LIVE-*`.

## `docs/PROTOCOL_SPEC.md`

Contratto realtime tra desktop, relay e player: HTTPS/WSS, ticket, protocol version, `requestId`, `stateSeq`, snapshot/resync, commands, accepted/rejected, rate limits e error taxonomy.

Prefisso: `PRO-*`.

---

# 7. Discord V0.4

## `docs/DISCORD_ACTIVITY_SPEC.md`

Discord Activity come tavolo del giocatore, Activity instance join, pairing master-only, binding `instanceId ↔ liveSessionId`, sicurezza e Discord come adapter del modello live generico.

Prefisso: `ACT-*`.

Quando un dettaglio live/protocollo è già definito da V0.3, la Activity lo eredita invece di inventarne una variante Discord-specific.

---

# 8. Compendio e fondazione futura

## `docs/COMPENDIUM_SPEC.md`

Contratto del compendio sostituibile: identità, ruleset, localizzazioni, source/licensing, repository e futuro adapter EcoGDR.

Prefisso: `CMP-*`.

## `docs/FOUNDATION_GUARDRAILS.md`

Guardrail per compatibilità futura EcoGDR senza introdurre account/auth/sync prematuramente.

---

# 9. Mappa area → fonti

| Area | Fonti normative |
|---|---|
| lifecycle campagna V0.1 | Operational + Storage + UI/UX |
| note/draft/titolo | Operational + Product Decisions + Domain + Storage |
| cartelle | Operational + Domain + Storage + UI/UX |
| Markdown/frontmatter | Operational + Domain + Search |
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

Non serve più una `WIKILINK_SPEC.md` per sbloccare la V0.1: la semantica operativa è chiusa in `V01_OPERATIONAL_SPEC.md`.

Restano da produrre soltanto quando la roadmap li promuove:

1. `docs/AI_SPEC.md` prima della V0.5;
2. specifiche personaggi/EcoGDR/integrations quando diventano feature concrete;
3. eventuali addendum tecnici se l'implementazione scopre un problema non coperto dai contract attuali.

Un addendum non può cambiare un comportamento approvato senza decisione di prodotto esplicita.

---

# 11. Regola per i goal di implementazione

Un goal V0.1 deve avere forma equivalente a:

```text
Implementa <area> V0.1 secondo:
- V01_OPERATIONAL_SPEC.md: OPS-...
- specifiche verticali applicabili: DOM-/STO-/SEA-/UX-...

Non modificare i comportamenti approvati per semplificare l'implementazione.
Se trovi una contraddizione reale non già risolta dall'Operational Spec, fermati sul requisito coinvolto invece di inventare un comportamento.
Completa contract test e scenari OPS-ACC applicabili prima di dichiarare il goal concluso.
```

---

## Regola finale

La documentazione è sufficiente quando l'agente deve principalmente decidere **come scrivere il codice**, non **che prodotto stiamo costruendo**.