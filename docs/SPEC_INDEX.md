# Campaign Manager v2 — Specification Index

## Scopo

Punto di ingresso normativo per progettazione e implementazione.

Un agente deve leggere prima la specifica della versione/area che sta implementando e non anticipare infrastruttura delle fasi successive.

---

# 1. Ordine di autorità

In caso di conflitto:

1. decisioni esplicite più recenti approvate dall'utente;
2. specifica operativa della versione/area interessata;
3. specifica verticale più specifica;
4. `PRODUCT.md`;
5. `architecture.md`;
6. `ROADMAP.md`;
7. `docs/FOUNDATION_GUARDRAILS.md`;
8. design direction e mock.

Per V0.1, `docs/V01_OPERATIONAL_SPEC.md` prevale sulle formulazioni storiche più complesse o vaghe.

---

# 2. Costituzione

## `PRODUCT.md`

Scopo, local-first, modularità, account opzionale, cloud soltanto quando serve e ordine generale delle versioni.

## `architecture.md`

Confini tra UI, filesystem, board, live, relay, Discord, auth, Compendio, IA e future integrazioni.

Le tecnologie cloud elencate sono implementazioni previste, non dogmi del dominio.

## `ROADMAP.md`

Sequenza operativa completa V0.1→V0.6 più milestone cloud/EcoGDR futuri, con flussi, stati, errori e gate.

Le sotto-attività sono checklist dentro goal verticali, non obbligo di micro-progetti.

---

# 3. V0.1 — Campaign Manager locale

## `docs/V01_OPERATIONAL_SPEC.md`

Fonte normativa integrata per:

- lifecycle campagna;
- note/cartelle;
- Markdown/wikilink;
- save/recovery/conflict;
- rename/move/trash;
- search;
- graph;
- errori;
- Windows gate.

Contiene la regola anti-over-engineering V0.1.

## Verticali

- `docs/V01_PRODUCT_DECISIONS.md`
- `docs/UI_UX_SPEC_V01.md`
- `docs/DOMAIN_MODEL.md`
- `docs/STORAGE_SPEC.md`
- `docs/SEARCH_SPEC.md`
- `docs/DESIGN_DIRECTION.md`

## Placeholder presenti già nella shell

### `docs/COMPENDIUM_SPEC.md`

La vista Compendio può esistere già come pagina WIP neutra, senza backend/dataset.

### `docs/AUTHENTICATION_SPEC.md`

`Impostazioni → Account` può esistere già come placeholder che chiarisce che l'account **non serve** per usare il prodotto.

Nessun provider auth viene implementato in V0.1.

---

# 4. V0.2 — Board

## `docs/BOARD_SPEC.md`

Definisce:

- board locale;
- sei strumenti;
- asset importati/portabili;
- card da note/estratti;
- token;
- z-order/lock/groups;
- prepared/live separation;
- visibilità;
- save/recovery;
- casi limite.

Decisione token corrente:

- un giocatore può controllare più token;
- un token ha al massimo un controller giocatore;
- il DM controlla sempre tutti.

---

# 5. V0.3 — Live web standalone

## `docs/LIVE_SESSION_SPEC.md`

Lifecycle, join web, partecipanti, board switching, asset, token, reconnect, host timeout e fine sessione.

V0.3 non contiene Discord pairing e non richiede account Campaign Manager.

## `docs/PROTOCOL_SPEC.md`

HTTPS/WSS, runtime validation, `stateSeq`, snapshot/resync, comandi stretti, autorizzazione e privacy.

Intenzionalmente non rigidi finché non misurati:

- frequenza preview;
- batching;
- rate limit numerici;
- durata precisa ticket/URL asset;
- cache generica idempotenza.

Niente event sourcing/replay cloud obbligatorio.

---

# 6. V0.4 — Discord Activity

## `docs/DISCORD_ACTIVITY_SPEC.md`

Discord è adapter della live V0.3.

Aggiunge:

- Activity instance;
- pairing master-only;
- identity Discord verificata;
- ingresso player senza codice.

Standalone resta indipendente dall'Embedded App SDK.

---

# 7. V0.5 — Assistente IA

## `docs/AI_SPEC.md`

Definisce:

- accesso all'Assistente;
- configurazione provider opzionale;
- retrieval con search locale;
- fonti note visibili;
- Q&A campagna/nota/selezione;
- proposta modifica singola nota;
- proposta nuova nota;
- diff/approvazione;
- proposal revision/stale;
- privacy/errori;
- limiti anti-agent/anti-vector-prematuro.

L'IA non richiede account Campaign Manager se il provider configurato può funzionare autonomamente.

---

# 8. V0.6 — Personaggi e ganci integrazione

## `docs/V06_CHARACTERS_INTEGRATIONS_SPEC.md`

Definisce un modello leggero:

```text
Token → characterNoteId? → normale NoteId
```

Nessun character database/sheet builder universale.

Flussi:

- collega una nota a un token;
- apri nota dal token;
- crea token da nota;
- riusa la stessa nota in più board;
- future provider boundaries senza framework plugin.

---

# 9. Autenticazione — hook oggi, servizio futuro

## `docs/AUTHENTICATION_SPEC.md`

Oggi:

```text
Impostazioni → Account
→ account non necessario / in arrivo
```

Futuro:

- login contestuale;
- browser/system flow quando appropriato;
- token fuori dal vault;
- logout/session expiry degradano solo cloud;
- nessuna fusione con Discord identity, live credential o API key IA.

La vera implementazione auth entra soltanto quando esiste una feature cloud reale che la richiede.

---

# 10. Compendio — hook oggi, enciclopedia cloud futura

## `docs/COMPENDIUM_SPEC.md`

Oggi:

```text
Compendio → WIP, niente backend
```

Futuro:

```text
enciclopedia cloud
→ consulta
→ Copia nelle note
→ Markdown locale indipendente
```

Schema/API/licenze/lingue/filtri/auth vengono definiti contro il vero servizio, non anticipati.

---

# 11. EcoGDR futuro

## `docs/ECOGDR_INTEGRATION_SPEC.md`

Definisce il comportamento di prodotto senza inventare API:

```text
Impostazioni → Integrazioni → EcoGDR
→ Collega campagna
→ auth se necessaria
→ scegli remota
→ Conferma binding
```

Binding ≠ sync ≠ pubblicazione.

Scollegare non elimina dati locali.

Ogni futura operazione dati (`Importa`, `Pubblica`, `Aggiorna`) richiede una specifica propria contro contratti reali.

## `docs/FOUNDATION_GUARDRAILS.md`

Raccoglie i vincoli trasversali che impediscono alle future feature cloud di contaminare il core locale.

---

# 12. Mappa area → fonti

| Area | Fonti normative |
|---|---|
| lifecycle/note/cartelle V0.1 | Operational + Domain + Storage + UI/UX |
| Markdown/wikilink | Operational + Domain + UI/UX |
| save/recovery/conflict | Operational + Storage |
| search | Operational + Search + UI/UX |
| graph | Operational + Domain + UI/UX + Design |
| placeholder Account | Authentication Spec + Roadmap |
| placeholder Compendio | Compendium Spec + Roadmap |
| board | Board Spec |
| live web | Live Session + Protocol + Board |
| Discord | Discord Activity + Live + Protocol |
| IA | AI Spec + Operational/Search per i dati locali |
| personaggi/token-note | V06 Spec + Board + Operational |
| auth reale futuro | Authentication Spec + contratto provider futuro |
| Compendio reale futuro | Compendium Spec + contratto API/dataset futuro |
| EcoGDR | EcoGDR Integration + Foundation Guardrails |

---

# 13. Cosa è già progettato e cosa no

## Progettato a livello di prodotto/comportamento

- V0.1;
- V0.2;
- V0.3;
- V0.4;
- V0.5;
- V0.6;
- placeholder Account;
- placeholder Compendio;
- comportamento futuro di auth/Compendio/EcoGDR.

## Intenzionalmente NON progettato finché non esiste la realtà a cui agganciarsi

- provider auth definitivo;
- schema/token auth;
- API/schema del Compendio;
- dataset/licenze/lingue del Compendio;
- API EcoGDR;
- algoritmo generico di sync;
- schema universale personaggi;
- plugin marketplace;
- importatori universali.

Queste non sono “ambiguità dimenticate”: sono decisioni sospese deliberatamente per evitare over-engineering.

---

# 14. Regola per i goal di implementazione

Un goal deve citare solo:

- versione corrente;
- specifiche realmente applicabili;
- risultato utente;
- acceptance/gate;
- non-obiettivi che prevengono scope creep.

Se una spec futura sembra necessaria per completare la versione corrente, verificare prima se si sta introducendo infrastruttura prematura.

---

## Regola finale

La documentazione è sufficiente quando chi implementa deve decidere **come scrivere il codice**, non inventare il prodotto — e non deve neppure costruire oggi servizi che esisteranno solo domani.