# Campaign Manager v2 — Foundation Guardrails

## Scopo

Questo documento fissa soltanto i vincoli minimi che evitano di chiudere porte future senza costruire oggi feature speculative.

Regola generale:

> preparare gli agganci, non costruire ancora il ponte.

---

# 1. Local-first resta il fondamento

Nelle versioni attuali il Campaign Manager funziona come applicazione locale autonoma.

Non si introducono per anticipazione:

- account obbligatori;
- login EcoGDR;
- cloud sync del vault;
- campagne remote come fonte autorevole;
- permessi remoti sul filesystem;
- pubblicazione automatica;
- dipendenze runtime da servizi futuri.

La cartella locale resta autorevole per i contenuti del DM.

---

# 2. Auth come capability, non fondamento

La direzione completa è in `docs/AUTHENTICATION_SPEC.md`.

Guardrail:

- nessun login all'avvio finché non esiste una feature reale che lo richiede;
- `Impostazioni → Account` può esistere come placeholder onesto;
- auth provider/SDK non entra nel core;
- token/secret restano fuori dal vault;
- logout/session expiry non bloccano note/board/live indipendenti;
- Discord identity, live credentials e provider IA restano separati dall'account applicativo;
- se un servizio cloud è anonimo, non si impone login artificiale.

---

# 3. Binding remoto futuro opzionale

Una campagna locale deve poter essere collegata a un sistema esterno senza essere convertita in un formato cloud proprietario.

Metadata previsto genericamente:

```json
{
  "externalBinding": {
    "provider": "ecogdr",
    "campaignId": "cmp_..."
  }
}
```

Vincoli:

- collegare non significa sincronizzare;
- collegare non significa pubblicare;
- il binding non cambia l'autorità dei file locali;
- perdere/rimuovere il binding non rende inutilizzabile la campagna;
- cambiare account non ricollega automaticamente la campagna.

Flussi futuri: `docs/ECOGDR_INTEGRATION_SPEC.md`.

---

# 4. Integrazioni fuori dal core

SDK, HTTP client e modelli di provider esterni non entrano nel dominio note/board.

Quando serviranno, vivranno dietro piccoli adapter/service applicativi.

Non serve un framework plugin universale per supportare il primo provider reale.

---

# 5. Compendio futuro

Direzione: `docs/COMPENDIUM_SPEC.md`.

Il Compendio sarà una **enciclopedia cloud consultabile**.

Oggi:

- vista/route WIP;
- nessun database temporaneo;
- nessun networking;
- nessun login finto.

Futuro:

- UI → piccolo service/client → vero database;
- read-only rispetto alla fonte;
- `Copia nelle note` → normale Markdown locale indipendente;
- indisponibilità cloud non blocca la campagna;
- auth soltanto se il vero servizio la richiede.

Schema, lingue, tassonomie, filtri e licenze vengono decisi contro il dataset reale.

---

# 6. Personaggi e provider futuri

V0.6 riusa le note come riferimento personaggio e le collega ai token.

Non si crea un character DB universale solo per anticipare EcoGDR/BeFolder.

Quando esiste un provider reale:

- collegamento esplicito;
- auth se necessaria;
- refresh/copia espliciti prima di sync continua;
- indisponibilità provider non rende inutili note/token locali;
- scollegare non elimina dati locali.

Dettagli: `docs/V06_CHARACTERS_INTEGRATIONS_SPEC.md`.

---

# 7. IA indipendente dai servizi account

V0.5 può funzionare con un provider IA configurato localmente senza richiedere account Campaign Manager.

API key/provider secret:

- fuori dal vault;
- fuori dai player;
- separati dall'auth applicativa.

Non si usa il futuro account come pretesto per centralizzare IA o campagna nel cloud.

---

# 8. Cose da non progettare senza contratti reali

Finché non esistono servizi reali non si decidono in anticipo:

- provider auth definitivo;
- protocollo token/account;
- API campagne EcoGDR;
- sync bidirezionale;
- permessi remoti;
- protocollo di pubblicazione;
- struttura database EcoGDR;
- API/schema definitivi del Compendio;
- caching/offline completo del Compendio;
- schema universale personaggi;
- plugin marketplace;
- importer universale.

---

## Regola finale

La compatibilità futura è riuscita quando possiamo aggiungere servizi reali ai bordi senza cambiare il modo in cui una campagna locale viene letta, scritta e usata offline.