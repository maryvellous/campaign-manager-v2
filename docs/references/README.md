# UI mock references

Questa cartella registra i mock HTML approvati durante la progettazione della V0.1.

## Riferimenti canonici

### Vista note

- nome originale: `campaign_manager_v2_ui_mock.html`
- provenienza: mock HTML standalone generato e approvato nella sessione di progettazione del 2026-09-08
- dimensione originale: 23,873 byte
- SHA-256: `55c5de3de036e09b1f1f277c6bdb38acfd81e554cd272f0eac976479e8d3a520`
- ruolo: riferimento della vista note, shell desktop, sidebar, editor, inspector, tab e command palette

### Vista con grafo

- nome originale: `campaign_manager_v2_ui_mock_graph.html`
- provenienza: evoluzione del mock precedente, approvata nella sessione di progettazione del 2026-09-08
- dimensione originale: 38,427 byte
- SHA-256: `094cbbfcc4f157d547b48a086f87d134390ed2c539ae7b109989ad97b833aaaf`
- ruolo: riferimento visivo più recente; aggiunge graph view coerente con palette e motion

## Regola di precedenza

I mock sono riferimenti visuali/comportamentali, non codice applicativo e non specifiche complete.

In caso di conflitto prevalgono:

1. decisioni esplicite approvate;
2. `docs/UI_UX_SPEC_V01.md`;
3. `docs/DESIGN_DIRECTION.md`;
4. mock HTML.

I valori CSS dei mock non diventano automaticamente requisiti rigidi. Dimensioni, timing, tipografia e raggi ripresi dai mock sono default da verificare sull'implementazione reale.

## Conservazione delle copie

Le due impronte sopra identificano in modo univoco gli artifact originali. Quando le copie HTML vengono materializzate in questa cartella devono essere copiate **senza modifiche** e la loro SHA-256 deve coincidere con quella registrata qui.

Nomi previsti:

- `docs/references/campaign_manager_v2_ui_mock.html`
- `docs/references/campaign_manager_v2_ui_mock_graph.html`

Se l'impronta non coincide, il file non è la copia canonica approvata e non deve sostituire questo registro.
