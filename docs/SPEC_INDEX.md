# Campaign Manager v2 — Specification Index

## Scopo

Punto di ingresso normativo per progettazione e implementazione.

Un agente deve leggere prima la specifica della versione/area che sta implementando e non anticipare infrastruttura di versioni future.

---

# 1. Ordine di autorità

In caso di conflitto:

1. decisioni esplicite più recenti approvate dall'utente;
2. specifica operativa della versione/area interessata;
3. specifica verticale più specifica;
4. `PRODUCT.md`;
5. `architecture.md`;
6. `ROADMAP.md`;
7. `FOUNDATION_GUARDRAILS.md`;
8. design direction e mock.

Per la V0.1, `docs/V01_OPERATIONAL_SPEC.md` prevale sulle formulazioni storiche più complesse o vaghe.

---

# 2. Costituzione

## `PRODUCT.md`

Scopo, local-first, prodotto DM/player e confini generali.

## `architecture.md`

Confini tra UI, filesystem, board, live, relay, Discord, IA e Compendio.

Le tecnologie cloud elencate sono implementazioni previste, non dogmi di dominio.

## `ROADMAP.md`

Ordine di costruzione in pochi goal verticali. Le sotto-attività sono checklist, non obbligo di creare micro-progetti o micro-layer.

---

# 3. V0.1 — Campaign Manager locale

## `docs/V01_OPERATIONAL_SPEC.md`

Fonte normativa integrata V0.1 per lifecycle, note/cartelle, Markdown/wikilink, save/recovery/conflict, rename/move/trash, search, graph, errori e Windows gate.

Contiene anche la regola anti-over-engineering: niente transaction framework generico, package vuoti, frontmatter applicativo o optimization gate non misurati.

## Verticali

- `docs/V01_PRODUCT_DECISIONS.md`
- `docs/UI_UX_SPEC_V01.md`
- `docs/DOMAIN_MODEL.md`
- `docs/STORAGE_SPEC.md`
- `docs/SEARCH_SPEC.md`
- `docs/DESIGN_DIRECTION.md`

Il **Compendio funzionale non appartiene alla V0.1**; la shell può però mostrare la sua schermata WIP neutra secondo `COMPENDIUM_SPEC.md`. Il placeholder non introduce networking o dataset.

---

# 4. V0.2 — Board

## `docs/BOARD_SPEC.md`

Definisce board locale, sei strumenti, asset, card da estratti, token, visibilità, prepared/live separation e casi limite.

Decisione corrente token:

- un giocatore può controllare più token;
- un token ha al massimo un controller giocatore alla volta;
- il DM controlla sempre tutti i token.

---

# 5. V0.3 — Live web standalone

## `docs/LIVE_SESSION_SPEC.md`

Lifecycle, join code web, participants, board switching, asset, token, reconnect, host timeout e fine sessione.

**Non contiene Discord pairing.**

## `docs/PROTOCOL_SPEC.md`

HTTPS/WSS, runtime validation, `stateSeq`, snapshot/resync, comandi stretti, autorizzazione e privacy.

Sono intenzionalmente non normativi finché non misurati:

- frequenza preview;
- batching in millisecondi;
- rate-limit numerici;
- durata precisa dei ticket/URL asset;
- cache generica di idempotenza.

V0.3 non richiede event sourcing o replay cloud.

---

# 6. V0.4 — Discord Activity

## `docs/DISCORD_ACTIVITY_SPEC.md`

Discord è un adapter della live V0.3.

V0.4 possiede:

- Activity instance;
- pairing master-only;
- identity Discord verificata;
- ingresso giocatori senza codice.

Il browser standalone resta indipendente dall'Embedded App SDK.

---

# 7. Compendio

## `docs/COMPENDIUM_SPEC.md`

Direzione approvata:

```text
oggi
Compendio → schermata WIP, nessun backend

futuro
Compendio → enciclopedia cloud → Copia nelle note
```

La copia futura crea normale Markdown locale indipendente dalla fonte cloud.

Non sono più normative le vecchie progettazioni premature su fixture locali, SQLite, tassonomie universali, localizzazioni, manifest o schema multi-ruleset. Queste decisioni verranno prese contro il servizio/dataset reale.

---

# 8. Futuro EcoGDR e integrazioni

## `docs/FOUNDATION_GUARDRAILS.md`

Mantiene soltanto agganci minimi:

- local-first;
- `externalBinding` opzionale futuro;
- adapter ai bordi;
- niente auth/sync/API premature;
- Compendio cloud indipendente dalla campagna locale.

---

# 9. Mappa area → fonti

| Area | Fonti |
|---|---|
| lifecycle/note/cartelle V0.1 | Operational + Domain + Storage + UI/UX |
| Markdown/wikilink | Operational + Domain + UI/UX |
| save/recovery/conflict | Operational + Storage |
| search | Operational + Search + UI/UX |
| graph | Operational + Domain + UI/UX + Design |
| board | Board Spec |
| live web | Live Session + Protocol + Board |
| Discord | Discord Activity + Live + Protocol |
| Compendio | Compendium Spec |
| EcoGDR futuro | Foundation Guardrails |

---

# 10. Documenti futuri

Produrre soltanto quando la roadmap li promuove:

- `docs/AI_SPEC.md` prima della V0.5;
- specifiche personaggi/EcoGDR quando diventano feature reali;
- specifica dati/API del Compendio quando esiste il vero servizio cloud.

Non creare spec tecniche per sistemi ipotetici solo per “future-proofing”.

---

# 11. Regola per i goal

Un goal deve citare solo le specifiche della versione corrente e le dipendenze realmente necessarie.

Se una specifica futura sembra necessaria per implementare una feature corrente, verificare prima se si sta introducendo over-engineering.

---

## Regola finale

La documentazione è sufficiente quando chi implementa deve decidere **come scrivere il codice**, non inventare il prodotto — ma non deve nemmeno costruire oggi infrastruttura per un prodotto futuro ancora indefinito.