# Campaign Manager v2 — Architecture

## 1. Obiettivo

Campaign Manager v2 è una ricostruzione completa del progetto originale.

La vecchia repository resta riferimento funzionale/storico, non base da refactorare.

Principio:

> costruire prima un campaign manager locale solido, poi aggiungere board, live, Discord e IA come strati separati.

---

# 2. Principi architetturali

## Local-first

La cartella della campagna sul computer del DM è la fonte autorevole dei dati persistenti.

Note, board e asset devono restare utilizzabili senza Internet.

## Stato separato per natura

Non si mescolano:

1. dati persistenti della campagna;
2. stato temporaneo della sessione live;
3. stato UI/preferenze locali;
4. dati derivati ricostruibili come search/backlink/graph.

## Confini utili, non layer per principio

UI, filesystem, rete, Discord e IA hanno responsabilità diverse e non vanno mescolati.

Questo **non** significa creare package/layer vuoti in anticipo.

Un confine diventa package separato quando dimensione o riuso lo giustificano.

## Compatibilità futura senza anticipazione

EcoGDR e Compendio seguono `FOUNDATION_GUARDRAILS.md` e `COMPENDIUM_SPEC.md`.

Non si costruiscono API, auth, sync o modelli universali prima di avere servizi reali.

---

# 3. Repository

Forma prevista, da creare progressivamente:

```text
campaign-manager-v2/
  apps/
    desktop/
    activity/

  services/
    relay/

  packages/
    core/
    protocol/
    ai/
    ui/
```

`storage`, `application`, `search` o altri package separati sono ammessi **solo se servono davvero**; nella V0.1 possono vivere come moduli interni al desktop mantenendo i confini logici definiti da `V01_OPERATIONAL_SPEC.md`.

---

# 4. Desktop

Stack previsto:

- Electron;
- React;
- TypeScript.

Responsabilità:

- campagne locali;
- note/editor/lettura;
- wikilink/backlink;
- ricerca/graph;
- board;
- live controls;
- pubblicazione asset;
- IA futura;
- Compendio come vista placeholder oggi e client cloud futuro.

Il renderer React non accede direttamente al filesystem.

Forma desiderata:

```text
UI
→ servizio/use case applicativo
→ repository/adapter
→ filesystem / OS / network
```

Non:

```text
React component
→ window.fs
→ reindex
→ preferences
→ networking
```

---

# 5. Player client / Activity

`apps/activity` è il lato del tavolo visto dal giocatore.

### V0.3

Funziona come web client standalone con join code.

### V0.4

Lo stesso client viene adattato a Discord tramite Embedded App SDK.

Conosce solo:

- join/resume;
- waiting state;
- board pubblica;
- snapshot/eventi realtime;
- pan/zoom/ping;
- token assegnati;
- asset pubblici.

Non conosce filesystem, vault, note private, IA o configurazione DM.

Discord è un adapter di ingresso/identity, non il fondamento del player client.

---

# 6. Board

La board è un contenuto persistente locale distinto dal suo stato live.

```text
board preparata (*.board.json)
          ↓ pubblicazione
stato live temporaneo
```

La board resta utilizzabile senza Internet.

Gli asset persistenti referenziati devono essere interni alla campagna; asset esterni trascinati vengono importati.

Specifica: `docs/BOARD_SPEC.md`.

---

# 7. Relay realtime

Il relay coordina Desktop e player senza esporre server/porte sul PC del DM.

Forma:

```text
Desktop DM
   │ HTTPS/WSS outbound
   ▼
Relay / coordinatore sessione
   ▲
   │ HTTPS/WSS
Web Player / Discord Activity
```

Il relay è autorevole soltanto per stato runtime accettato della sessione, non per la campagna.

Tecnologie attualmente previste:

- Cloudflare Worker;
- Durable Object come coordinatore per sessione;
- R2 per copie temporanee degli asset pubblicati.

Queste sono **scelte d'implementazione previste**, non principi di dominio. Se al momento della V0.3 una tecnologia equivalente è più semplice o quella prevista è cambiata, può essere sostituita mantenendo i contratti Live/Protocol.

Non sono ammessi:

- tunnel verso il PC del DM;
- database cloud completo del vault;
- upload di contenuti privati non pubblicati.

---

# 8. Protocollo

Il protocollo V0.3 usa:

```text
HTTPS → create/join/resume/assets/auth connessione
WSS   → snapshot + eventi realtime
```

Concetti essenziali:

- runtime schema validation;
- `stateSeq` per mutazioni durevoli;
- snapshot come recupero da reconnect/gap;
- comandi specifici e autorizzati;
- client non trusted.

Non richiede event sourcing o un framework generale di idempotenza.

Specifica: `docs/PROTOCOL_SPEC.md`.

---

# 9. Compendio

Direzione:

```text
oggi
UI Compendio
→ schermata WIP

futuro
UI Compendio
→ piccolo service/client
→ enciclopedia cloud
```

Il Campaign Manager non contiene oggi un dataset finto locale.

Una futura azione `Copia nelle note` crea normale Markdown locale indipendente dalla fonte cloud.

Specifica: `docs/COMPENDIUM_SPEC.md`.

---

# 10. IA

L'IA resta un modulo separato.

```text
Campaign data / search
→ AI
→ proposta
→ approvazione utente
→ normali servizi applicativi
→ filesystem
```

L'IA non scrive arbitrariamente sul filesystem.

Embeddings/vector DB entrano solo se l'uso reale li giustifica.

---

# 11. UI condivisa

`packages/ui` contiene componenti realmente condivisi solo quando utile.

Meglio duplicare un piccolo componente desktop/player che creare un'astrazione fragile prematuramente.

---

# 12. Regola anti-over-engineering

Quando due soluzioni rispettano lo stesso comportamento approvato, preferire quella con:

- meno stato;
- meno livelli;
- meno servizi da mantenere;
- meno sincronizzazione;
- recupero più semplice;
- possibilità di sostituzione futura.

Non generalizzare una soluzione locale finché non esiste un secondo caso reale che richiede l'astrazione.

---

## Regola finale

L'architettura è riuscita se ogni versione può essere costruita senza obbligare la precedente a conoscere in anticipo dettagli della successiva.