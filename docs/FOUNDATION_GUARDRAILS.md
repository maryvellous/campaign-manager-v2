# Campaign Manager v2 — Foundation Guardrails

## Scopo

Questo documento fissa **solo i vincoli minimi da rispettare oggi** per evitare di dover riprogettare il Campaign Manager quando, in futuro, verrà collegato all'ecosistema EcoGDR.

Non descrive EcoGDR e non introduce feature EcoGDR nella V0.1.

Regola generale:

> preparare gli agganci, non costruire ancora il ponte.

---

## 1. Campaign Manager resta local-first

Nelle versioni attuali il Campaign Manager deve funzionare come applicazione locale autonoma.

Non si introducono adesso:

- account EcoGDR;
- login o autenticazione EcoGDR;
- token o sessioni account;
- sincronizzazione cloud della campagna;
- elenco campagne remoto;
- permessi EcoGDR;
- pubblicazione verso EcoGDR;
- dipendenze runtime da servizi EcoGDR.

Queste funzioni verranno progettate quando EcoGDR avrà contratti reali e stabili.

La cartella locale della campagna resta la fonte autorevole per note, preparazione, bozze, asset locali e altri contenuti privati del DM.

---

## 2. Una campagna deve poter essere collegata in futuro senza migrazione

Il modello dei metadati della campagna deve lasciare spazio a un'associazione remota opzionale, per esempio:

```json
{
  "name": "Aephoredya",
  "ecoGdrCampaignId": "cmp_..."
}
```

Il nome preciso e la struttura definitiva possono cambiare quando esisterà il contratto EcoGDR reale. Il requisito importante è che una normale cartella già usata dal Campaign Manager possa essere associata in seguito a una campagna remota **senza essere ricreata, spostata o convertita in un formato cloud proprietario**.

La presenza di un identificatore remoto non deve avere effetti impliciti sui file locali.

In particolare:

- collegare non significa sincronizzare;
- collegare non significa pubblicare;
- collegare non cambia la fonte autorevole delle note private;
- rimuovere o perdere il collegamento remoto non deve rendere inutilizzabile la campagna locale.

---

## 3. EcoGDR deve restare fuori dal core

Il dominio del Campaign Manager non deve dipendere da SDK, API client, modelli HTTP o dettagli interni di EcoGDR.

Quando l'integrazione arriverà, dovrà essere introdotta dietro interfacce o adapter applicativi dedicati.

Forma concettuale:

```text
Campaign Manager core
        ↑
   contratto locale
        ↑
EcoGDR adapter futuro
        ↑
 EcoGDR API / SDK
```

Il core può conoscere l'esistenza di un identificatore esterno opzionale nei metadati, ma non deve conoscere come autenticarsi, interrogare o sincronizzare EcoGDR.

Se EcoGDR cambia tecnologia, il dominio locale del Campaign Manager non deve essere riscritto.

---

# Compendio

## 4. Il compendio è una funzione locale reale

Il Campaign Manager deve poter offrire un compendio di regolamenti base anche prima che esista il database condiviso di EcoGDR.

Per la prima implementazione è accettabile usare:

- fixture versionate;
- file JSON locali;
- SQLite locale;
- altro database temporaneo semplice.

La scelta fisica iniziale non deve diventare parte del dominio o della UI.

---

## 5. Il compendio deve avere una sorgente sostituibile

Il Campaign Manager accede al compendio attraverso un contratto equivalente a un `CompendiumRepository`.

Esempio concettuale:

```ts
interface CompendiumRepository {
  getEntry(id: CompendiumEntryId, language: LanguageCode): Promise<CompendiumEntry | null>
  search(query: string, context: CompendiumContext): Promise<CompendiumEntry[]>
}
```

La UI e i use case devono dipendere da questo contratto, non dal formato fisico del database temporaneo.

Il percorso previsto è quindi:

```text
oggi
UI / use case
    ↓
CompendiumRepository
    ↓
fixture / database locale temporaneo

futuro
UI / use case
    ↓
CompendiumRepository
    ↓
adapter database condiviso EcoGDR
```

Sostituire la sorgente dati non deve richiedere di riscrivere la UI o la logica di dominio.

---

## 6. Identità delle regole

Le voci del compendio non devono essere identificate tramite il nome visualizzato, il nome italiano o altre stringhe localizzate.

Ogni voce deve avere un ID stabile indipendente dalla lingua.

Il modello deve distinguere almeno:

- `gameSystem` — sistema di gioco;
- `ruleset` / `edition` — ruleset o edizione;
- `source` / `manual` — manuale o pacchetto sorgente;
- `entryId` — identità stabile della voce;
- `language` — lingua del contenuto visualizzato.

Esempio concettuale:

```text
entryId: spell.fireball
ruleset: dnd5e.2014
source: srd.2014
language: it
name: Palla di Fuoco
```

La stessa regola in inglese mantiene la stessa identità:

```text
entryId: spell.fireball
ruleset: dnd5e.2014
source: srd.2014
language: en
name: Fireball
```

La lingua modifica la rappresentazione, non l'identità della regola.

Ruleset differenti devono poter avere identità o versioni distinte anche quando il nome visualizzato è simile.

---

## 7. Vincoli di implementazione da rispettare fin dalla V0.1

Quando vengono costruiti core, storage e compendio:

1. nessun codice EcoGDR concreto entra nel core;
2. nessun account o networking EcoGDR viene implementato solo per anticipazione;
3. `CampaignMetadata` deve poter accogliere in futuro un binding remoto opzionale senza migrazione distruttiva del vault;
4. il compendio viene letto tramite repository/adapter;
5. gli ID del compendio sono stabili e non localizzati;
6. ruleset/edizione, sorgente e lingua sono dimensioni esplicite;
7. fixture o database temporanei sono considerati implementazioni sostituibili;
8. la UI non deve conoscere né interrogare direttamente il formato fisico del compendio.

---

## 8. Cose da non progettare ancora

Finché EcoGDR non fornisce contratti reali, non si decide in anticipo:

- provider di autenticazione;
- schema dei token;
- API di account;
- API di campagne;
- formato di sincronizzazione;
- modello definitivo dei permessi;
- protocollo di pubblicazione;
- struttura fisica del database condiviso del compendio.

Quando queste parti esisteranno, verranno implementate adattando i bordi già predisposti, non riscrivendo il Campaign Manager.

---

## Regola finale

La compatibilità futura è riuscita se possiamo fare entrambe queste cose senza cambiare il dominio principale:

```text
campagna locale esistente
→ associazione futura a EcoGDR
```

```text
compendio locale temporaneo
→ compendio condiviso EcoGDR
```

Se per ottenere uno dei due risultati sarà necessario riscrivere editor, vault, core o UI del compendio, questi guardrail non sono stati rispettati.
