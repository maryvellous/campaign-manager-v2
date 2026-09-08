# Campaign Manager v2 — Future EcoGDR Integration Specification

## 1. Scopo

Questo documento definisce il **comportamento di prodotto** previsto per un futuro collegamento EcoGDR, senza inventare oggi API, auth, sync o modelli dati che ancora non esistono.

Non assegna automaticamente una versione al lavoro: il milestone diventa implementabile soltanto quando esistono contratti reali EcoGDR.

Prefisso requisiti: `ECO-*`.

Principio:

> collegare due prodotti non significa fondere le loro fonti autorevoli.

---

# 2. Stato attuale

## ECO-NOW-001 — Nessuna feature finta

Nelle versioni correnti non serve mostrare un pulsante EcoGDR se non può completare un collegamento reale.

Il solo gancio tecnico ammesso è la compatibilità del metadata `externalBinding` già prevista dal dominio.

## ECO-NOW-002 — Nessuna dipendenza

Il Campaign Manager non richiede:

- account EcoGDR;
- SDK EcoGDR;
- API EcoGDR;
- sync;
- elenco campagne remoto;
- permessi remoti.

---

# 3. Attivazione futura

## ECO-FUT-001 — Quando compare la UI

La UI EcoGDR diventa visibile soltanto quando esiste almeno un flusso end-to-end reale e testabile.

La posizione naturale è:

```text
Impostazioni → Integrazioni → EcoGDR
```

Non occupa il rail principale.

## ECO-FUT-002 — Login solo se necessario

Se il servizio EcoGDR richiede autenticazione, il collegamento usa `AUTHENTICATION_SPEC.md`.

Il login non viene richiesto all'avvio dell'app e non rende il vault account-dependent.

---

# 4. Collegamento campagna

## ECO-LINK-001 — Flusso

Quando il servizio reale lo consente:

```text
Impostazioni → Integrazioni → EcoGDR
→ Collega campagna
→ autenticazione se necessaria
→ scegli una campagna remota compatibile
→ anteprima del collegamento
→ Conferma
```

## ECO-LINK-002 — Binding esplicito

Solo dopo conferma viene registrato un binding equivalente a:

```json
{
  "externalBinding": {
    "provider": "ecogdr",
    "campaignId": "<remote-id>"
  }
}
```

La forma definitiva può adattarsi al contratto reale, ma il significato resta: questa cartella locale è associata a quella campagna remota.

## ECO-LINK-003 — Collegare non sincronizza

Dopo il collegamento non avvengono automaticamente:

- upload dell'intero vault;
- download dell'intera campagna remota;
- merge dei contenuti;
- pubblicazione ai giocatori;
- sostituzione dei file locali;
- background sync continuo.

Il binding da solo non modifica note, board o asset.

---

# 5. Operazioni future sopra il binding

## ECO-OPS-001 — Ogni direzione è una feature distinta

Azioni come:

- `Importa da EcoGDR`;
- `Pubblica su EcoGDR`;
- `Aggiorna da EcoGDR`;
- `Invia personaggio`;

non vengono dedotte dal solo binding.

Ognuna richiede un caso d'uso reale, una preview del cambiamento e una specifica dedicata quando il vero contratto dati esiste.

## ECO-OPS-002 — Nessun sync bidirezionale generico

Non si introduce una macchina di sync bidirezionale universale come prerequisito dell'integrazione.

La prima operazione reale deve preferire una direzione chiara e un gesto esplicito.

## ECO-OPS-003 — Dati locali protetti

Qualunque import/update futuro che tocchi file locali passa dai normali servizi applicativi e rispetta revisioni, conflitti e recovery.

Un servizio remoto non sovrascrive direttamente il filesystem.

---

# 6. Scollegamento

## ECO-UNLINK-001 — Scollega

`Scollega EcoGDR` rimuove il binding remoto dopo conferma.

Non elimina:

- campagna locale;
- note;
- board;
- asset;
- copie locali già importate;
- cronologia locale.

## ECO-UNLINK-002 — Servizio non raggiungibile

Se EcoGDR è offline o il binding remoto non è più valido:

- la campagna locale continua a funzionare;
- la UI mostra `EcoGDR non disponibile` / `Collegamento da verificare`;
- il binding non viene cancellato automaticamente per un errore di rete temporaneo.

---

# 7. Cambio account

Se un futuro account Campaign Manager/EcoGDR cambia mentre una campagna è collegata:

- non si riassocia automaticamente la campagna a un'altra remota;
- le operazioni cloud possono essere sospese finché il binding non è nuovamente autorizzato;
- la campagna locale resta aperta e utilizzabile.

---

# 8. Errori futuri

Il bordo di integrazione dovrà distinguere almeno semanticamente:

```text
provider_unavailable
auth_required
auth_expired
binding_not_found
binding_forbidden
remote_campaign_not_found
operation_conflict
network_error
```

Le stringhe/API reali vengono mappate dall'adapter; la UI non dipende dal testo grezzo del provider.

---

# 9. Gate futuro

Il primo milestone EcoGDR è corretto se:

1. la campagna si collega e scollega senza modificare i contenuti locali;
2. auth failure/offline non blocca il vault;
3. il binding non avvia sync implicita;
4. cambiare account non ricollega automaticamente dati;
5. nessun SDK EcoGDR entra nel core note/board;
6. le future operazioni dati restano separate e vengono progettate contro API reali.

---

## Regola finale

Il collegamento EcoGDR è riuscito quando possiamo dire:

> “questa campagna locale corrisponde a quella campagna remota”

senza che questa frase significhi automaticamente:

> “ora il cloud controlla i miei file”.