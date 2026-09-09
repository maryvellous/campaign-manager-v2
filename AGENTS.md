# AGENTS.md — Campaign Manager v2

Questo file spiega **come lavorare nel progetto**, non riscrive la progettazione.

Principio generale:

> parti dal goal, leggi la documentazione pertinente, costruisci il risultato più semplice che la rispetta, verifica che funzioni davvero.

## 1. Lavora per goal, non per micro-task

Tratta il goal assegnato come un risultato end-to-end da portare a termine.

In **Goal mode** puoi suddividerlo in più task e completarli nello stesso lavoro: non fermarti dopo ogni piccolo passaggio se il comportamento è già definito.

Puoi usare **subagent** quando aiutano davvero, soprattutto per attività indipendenti o parallelizzabili come:

- esplorare aree diverse del repository;
- verificare una specifica o un contratto;
- scrivere o eseguire test separati;
- fare una review mirata di quanto implementato.

Il main agent resta responsabile delle decisioni, dell'integrazione dei risultati e della verifica finale. Non creare subagent o task aggiuntivi solo per rituale.

## 2. Leggi solo la documentazione necessaria

Prima di implementare un goal:

1. leggi `docs/SPEC_INDEX.md` per sapere quali fonti sono normative;
2. individua il goal in `docs/IMPLEMENTATION_GOALS.md` e/o `ROADMAP.md`;
3. leggi le specifiche indicate per quella versione o area;
4. consulta mock e reference solo quando servono davvero al lavoro corrente.

Non è necessario rileggere tutta la documentazione a ogni task.

L'ordine di autorità è quello definito in `docs/SPEC_INDEX.md`. I mock sono riferimenti visivi, non specifiche esaustive.

## 3. Segui il prodotto; scegli tu la tecnica

Le specifiche definiscono **cosa deve succedere**, quali stati/errori esistono e cosa è fuori scope.

Quando una scelta tecnica è lasciata aperta, scegli una soluzione semplice e ragionevole e procedi.

Preferisci:

- meno stato;
- meno layer e dipendenze;
- pattern già presenti nel progetto;
- una soluzione locale prima di un framework generale.

Non costruire infrastruttura di versioni future. Se una feature è documentata come placeholder, deve restare un placeholder finché la roadmap non la attiva.

## 4. Non inventare un terzo comportamento

Se due documenti sembrano contraddirsi, usa l'ordine di autorità di `SPEC_INDEX.md` e la specifica più pertinente al goal.

Se un dettaglio non è specificato e **non cambia il prodotto**, scegli il comportamento più semplice coerente con le specifiche.

Fermati e segnala il problema solo quando una decisione non risolvibile cambierebbe in modo sostanziale:

- comportamento utente;
- sicurezza o privacy;
- integrità dei dati;
- scope della versione.

Non bloccare il goal per dettagli implementativi ordinari.

## 5. Mantieni il cambiamento focalizzato

Implementa ciò che serve al goal e i piccoli adattamenti necessari a farlo funzionare bene.

Evita:

- refactor opportunistici non collegati;
- nuove astrazioni senza un bisogno reale;
- duplicare sistemi già presenti;
- modificare parti indipendenti solo per renderle "più pulite".

Non sovrascrivere lavoro esistente non correlato. Aggiorna la documentazione di progettazione solo se il lavoro scopre una contraddizione reale o cambia deliberatamente un comportamento approvato.

## 6. Un goal finisce con una verifica reale

Durante il lavoro esegui i test/check pertinenti invece di accumulare tutto alla fine.

Prima di dichiarare il goal concluso:

- verifica i flussi e gli stati previsti dalle specifiche;
- esegui i test rilevanti e i gate del goal;
- controlla che non siano state introdotte regressioni evidenti nell'area toccata;
- confronta il risultato finale con gli acceptance criteria, non solo con il fatto che il codice compili.

Se qualcosa resta incompleto, dichiaralo chiaramente invece di descrivere il goal come concluso.

---

## Ciclo di lavoro consigliato

```text
goal
→ SPEC_INDEX + goal/spec pertinenti
→ piano breve dei task
→ task paralleli/subagent se utili
→ implementazione
→ integrazione
→ test + acceptance criteria
→ riepilogo di cosa è cambiato e cosa è stato verificato
```

La documentazione deve evitare che l'agente inventi il prodotto; queste regole devono evitare che il processo diventi più complicato del prodotto stesso.
