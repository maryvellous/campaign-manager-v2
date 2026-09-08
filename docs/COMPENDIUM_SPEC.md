# Campaign Manager v2 — Compendium Specification

## 1. Direzione approvata

Il Compendio sarà in futuro una **enciclopedia cloud consultabile dal Campaign Manager**.

L'utente potrà cercare/aprire una voce e, quando utile, **copiarla nella propria campagna come normale nota Markdown**.

Oggi non esiste ancora il database reale e non deve essere simulato con fixture, JSON locali o un database temporaneo destinato a essere sostituito.

Prefisso requisiti: `CMP-*`.

Principio:

> oggi costruiamo soltanto il posto dove il Compendio vivrà e il punto di aggancio; il vero contratto dati nasce quando esiste il vero servizio.

---

# 2. UI attuale: placeholder reale, non finta feature

## CMP-NOW-001 — Voce Compendio nel rail

`Compendio` è una destinazione stabile del rail principale.

Ordine previsto del gruppo di navigazione contenuti:

```text
Note
Ricerca
Grafo
Compendio
Recenti
Preferiti
...
Impostazioni
```

`Compendio` viene quindi dopo `Grafo` e prima di `Recenti`.

Questa è un'estensione successiva della shell V0.1 e prevale sul vecchio elenco del rail che non includeva ancora il Compendio.

Aprirla mostra una schermata neutra equivalente a:

```text
Compendio

In arrivo.
Qui potrai consultare l'enciclopedia e copiare le voci che ti servono nelle note della campagna.
```

## CMP-NOW-002 — Nessuna falsa interazione

Finché il servizio non esiste, la schermata non mostra:

- search box non funzionanti;
- filtri finti;
- dataset demo spacciato per compendio;
- loading perpetuo;
- login/account non necessari;
- errori di rete per una feature non ancora attiva.

È un placeholder esplicito e finito.

## CMP-NOW-003 — Nessuna dipendenza runtime

Il placeholder non richiede rete, backend, database, account o EcoGDR.

Un problema futuro del Compendio non deve impedire di aprire e usare una campagna locale.

---

# 3. Gancio architetturale minimo

## CMP-HOOK-001 — Vista stabile

La route/view `Compendio` viene mantenuta quando arriverà il servizio reale, così l'utente non cambia modello mentale.

## CMP-HOOK-002 — Confine applicativo futuro

Quando il servizio verrà implementato, la UI non interrogherà direttamente HTTP/database.

Esisterà un piccolo client/service applicativo dietro la vista, per esempio concettualmente:

```ts
interface CompendiumService {
  search(query: string): Promise<CompendiumSummary[]>
  getEntry(id: string): Promise<CompendiumEntry | null>
}
```

Questa firma è **illustrativa, non normativa oggi**.

Non si definiscono in anticipo schema completo, filtri, localizzazioni, caching, auth o database fisico.

## CMP-HOOK-003 — ID opaco futuro

Una voce del vero servizio dovrà avere un identificatore stabile che non dipende dal titolo visualizzato.

Non serve decidere oggi la forma dell'ID.

---

# 4. Esperienza futura del Compendio

## CMP-FUT-001 — Consultazione cloud

Il Compendio reale sarà una superficie di consultazione remota.

Il minimo prodotto previsto è:

```text
Compendio
→ cerca/esplora
→ apri voce
→ leggi
→ opzionalmente Copia nelle note
```

La ricerca, i filtri e la navigazione verranno progettati quando saranno noti il database reale e i suoi contenuti.

## CMP-FUT-002 — Read-only rispetto alla fonte

Il Campaign Manager non modifica direttamente la voce canonica dell'enciclopedia cloud.

Il Compendio è consultazione; eventuale editing del database sorgente appartiene a un altro sistema/processo futuro.

## CMP-FUT-003 — Offline/local-first preservato

Se il Compendio cloud è offline o irraggiungibile:

- la campagna locale continua a funzionare;
- note e board non dipendono dal servizio;
- viene mostrato soltanto lo stato di indisponibilità del Compendio.

Non è richiesta una copia offline completa del Compendio nella prima implementazione reale.

---

# 5. Copia di una voce nelle note

## CMP-COPY-001 — Copia esplicita

Una voce entra nel vault soltanto dopo un'azione esplicita tipo:

```text
Copia nelle note
```

Consultare una voce non crea file.

## CMP-COPY-002 — Diventa normale Markdown

La copia usa i normali servizi di creazione note del Campaign Manager e produce una normale nota Markdown nella cartella della campagna scelta dall'utente.

Una volta copiata:

- è contenuto locale dell'utente;
- può essere modificata, rinominata, spostata e collegata normalmente;
- funziona offline;
- non richiede il Compendio per essere letta.

## CMP-COPY-003 — Nessuna sincronizzazione implicita

La nota copiata è **indipendente dalla voce cloud**.

Se in futuro la voce del Compendio cambia, la nota locale non viene aggiornata automaticamente e le modifiche locali non vengono inviate indietro.

Un eventuale sistema di aggiornamento/sync richiederebbe una feature futura esplicita.

## CMP-COPY-004 — Provenienza

Quando esisterà il dataset reale, la copia dovrà poter conservare una provenienza/attribuzione minima quando richiesta dalla licenza o utile all'utente.

La forma precisa dipenderà dal vero servizio e non viene inventata oggi.

---

# 6. Dati e licenze future

Il progetto non incorpora né redistribuisce contenuti senza diritti chiari.

Quando verrà scelto il database reale, dovranno essere decisi allora:

- quali sistemi/ruleset contiene;
- quali lingue;
- quali fonti/licenze;
- schema delle entry;
- ricerca e filtri;
- autenticazione, se realmente necessaria;
- API e hosting;
- eventuale caching.

Nessuna di queste decisioni è requisito per il placeholder attuale.

---

# 7. Cose deliberatamente non costruite adesso

- fixture compendio locale;
- SQLite/JSON temporaneo;
- `GameSystemId`/`RulesetId`/`SourceId` definitivi;
- modello universale multi-TTRPG;
- sistema di localizzazioni/fallback;
- search index compendio;
- homebrew repository;
- sync EcoGDR;
- cache offline completa;
- character builder/rules engine.

---

# 8. Gate attuale

Per la fase placeholder basta verificare che:

1. `Compendio` sia raggiungibile dal rail nella posizione approvata;
2. apra una schermata WIP chiara;
3. nessuna chiamata di rete venga fatta;
4. la presenza del placeholder non interferisca con la campagna locale;
5. la vista possa in futuro ricevere un service/client senza riscrivere la shell;
6. non esista un dataset finto da mantenere.

---

## Regola finale

Il Compendio di oggi è **una porta chiusa ma già nel posto giusto**.

Quando esisterà l'enciclopedia cloud reale, apriremo quella porta e progetteremo contro dati e API reali, invece di indovinarli in anticipo.