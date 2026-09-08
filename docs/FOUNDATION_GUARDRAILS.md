# Campaign Manager v2 — Foundation Guardrails

## Scopo

Questo documento fissa soltanto i vincoli minimi che evitano di chiudere porte future senza costruire oggi feature speculative.

Regola generale:

> preparare gli agganci, non costruire ancora il ponte.

---

# 1. Local-first resta il fondamento

Nelle versioni attuali il Campaign Manager funziona come applicazione locale autonoma.

Non si introducono per anticipazione:

- account EcoGDR;
- login/auth EcoGDR;
- token/sessioni account;
- sync cloud della campagna;
- campagne remote;
- permessi remoti;
- pubblicazione verso EcoGDR;
- dipendenze runtime da servizi EcoGDR.

La cartella locale resta autorevole per i contenuti privati del DM.

---

# 2. Binding remoto futuro opzionale

Una campagna locale deve poter essere collegata in futuro a un sistema esterno senza essere convertita in un formato cloud proprietario.

Il metadata canonico previsto è genericamente:

```json
{
  "externalBinding": {
    "provider": "ecogdr",
    "campaignId": "cmp_..."
  }
}
```

La struttura può evolvere quando esisterà il contratto reale.

Vincoli:

- collegare non significa sincronizzare;
- collegare non significa pubblicare;
- il binding non cambia l'autorità dei file locali;
- perdere/rimuovere il binding non rende inutilizzabile la campagna.

---

# 3. Integrazioni fuori dal core

SDK, HTTP client e modelli EcoGDR non entrano nel dominio locale.

Quando serviranno, vivranno dietro piccoli adapter/service applicativi.

Se il servizio esterno cambia tecnologia, editor, vault e dominio locale non devono essere riscritti.

---

# 4. Compendio futuro

La direzione aggiornata del Compendio è definita in `docs/COMPENDIUM_SPEC.md`.

Il Compendio sarà una **enciclopedia cloud consultabile**. Oggi non costruiamo una sorgente locale temporanea.

Guardrail minimi:

- la shell può già avere la vista/route `Compendio` come placeholder WIP;
- nessun database o networking è richiesto finché il vero servizio non esiste;
- quando arriverà il servizio, la UI parlerà a un piccolo client/service invece di conoscere direttamente il database;
- le voci reali avranno ID stabili non basati sul titolo;
- `Copia nelle note` produrrà normale Markdown locale indipendente dalla fonte cloud;
- indisponibilità del Compendio non compromette la campagna locale;
- fonti/licenze verranno definite contro il dataset reale, non inventate oggi.

Non vengono anticipati ora modelli universali di ruleset, lingue, localizzazioni, search schema o API.

---

# 5. Cose da non progettare ancora

Finché non esistono contratti reali non si decidono in anticipo:

- provider auth;
- schema token/account;
- API campagne;
- sync;
- permessi remoti;
- protocollo di pubblicazione;
- struttura database EcoGDR;
- API/schema definitivi del Compendio;
- caching/offline del Compendio;
- localizzazioni e tassonomie universali.

---

## Regola finale

La compatibilità futura è riuscita quando possiamo aggiungere servizi reali ai bordi senza cambiare il modo in cui una campagna locale viene letta, scritta e usata offline.