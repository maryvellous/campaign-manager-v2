# Campaign Manager v2 — V0.6 Characters & Integrations Specification

## 1. Scopo

Questo documento definisce la **V0.6 — Personaggi e ganci di integrazione**.

L'obiettivo non è costruire un character builder universale, ma rendere i personaggi riutilizzabili dentro il Campaign Manager e preparare un punto pulito per future sorgenti esterne reali.

Prefisso requisiti: `V06-*`.

Principio:

> usare prima i dati che abbiamo già; integrare servizi esterni solo quando esistono davvero.

---

# 2. Modello personaggio minimo

## V06-CHAR-001 — Una nota può rappresentare un personaggio

V0.6 non introduce un nuovo formato di scheda proprietario.

Una normale nota Markdown della campagna può essere collegata a un token come **nota personaggio**.

Esempio:

```text
Characters/Nyx.md
```

La nota continua a essere una nota normale:

- editabile nell'editor;
- ricercabile;
- collegabile con wikilink;
- spostabile/rinominabile;
- privata al DM finché non viene condiviso altro esplicitamente.

## V06-CHAR-002 — Nessuna classificazione globale obbligatoria

V0.6 non richiede tag/frontmatter `type: character` o un catalogo separato di tutte le note personaggio.

La relazione esiste quando un token o un'integrazione collega esplicitamente una `NoteId`.

## V06-CHAR-003 — Token collegato

Un token della board può avere opzionalmente:

```ts
characterNoteId?: NoteId
```

Questo collegamento appartiene alla board preparata e serve al DM per ritrovare rapidamente la nota del personaggio.

Se la nota viene rinominata/spostata tramite Campaign Manager, il riferimento viene aggiornato come le altre referenze coordinate.

Se la nota scompare, il token resta utilizzabile ma mostra `Nota personaggio mancante` al DM.

## V06-CHAR-004 — Nessuna esposizione automatica

Collegare un token a una nota **non pubblica quella nota ai giocatori**.

Activity e browser ricevono soltanto i dati pubblici del token e le future informazioni personaggio esplicitamente autorizzate.

---

# 3. Flussi desktop

## V06-FLOW-001 — Collega una nota a un token

Dal token selezionato:

```text
Inspector token
→ Collega nota personaggio…
→ cerca/seleziona una nota
→ collegamento salvato nella board
```

Non serve spostare la nota in una cartella speciale.

## V06-FLOW-002 — Apri nota personaggio

Token collegato → azione `Apri nota personaggio` → normale navigation model delle note.

La board resta aperta/ripristinabile e non perde lo stato di lavoro.

## V06-FLOW-003 — Crea token da nota

Da una nota può esistere un'azione:

```text
Crea token da questa nota…
```

Flusso:

1. scegli board di destinazione se non è già ovvia;
2. viene creato un token con nome iniziale derivato dal titolo della nota;
3. il token viene collegato alla `NoteId`;
4. il master può scegliere/sostituire il ritratto normalmente;
5. click sulla board conferma posizione, `Esc` annulla.

La nota non viene modificata.

## V06-FLOW-004 — Token generici restano validi

Mostri, PNG minori, marker e altri token possono continuare a esistere senza alcuna nota personaggio.

Il collegamento è opzionale, non una nuova procedura obbligatoria per usare la board.

---

# 4. Riutilizzo tra board

## V06-REUSE-001 — Nota come identità umana, non entità tecnica globale

La stessa nota può essere collegata a token presenti in board diverse.

Questo permette a `Nyx.md` di essere il riferimento del personaggio in più scene senza creare un database duplicato.

Le proprietà di scena restano per-token:

- posizione;
- dimensione;
- visibilità;
- z-order;
- controller live.

## V06-REUSE-002 — Nome/avatar non sincronizzati magicamente

Il collegamento alla nota non crea sincronizzazione automatica di qualunque proprietà.

Il titolo della nota può essere usato come nome iniziale quando si crea il token, ma rinominare la nota non deve cambiare silenziosamente un nome token personalizzato.

Il ritratto resta un asset del token finché non viene introdotta una sorgente personaggio reale che definisca un comportamento diverso.

---

# 5. Esperienza giocatore V0.6

## V06-PLAYER-001 — Nessuna scheda universale

V0.6 non inventa una scheda generica con campi statistiche arbitrari.

Il player continua a vedere:

- board pubblica;
- token;
- nome/avatar del token;
- controlli già autorizzati.

## V06-PLAYER-002 — Identità del proprio token

Quando un partecipante controlla un token, il client può evidenziarlo come proprio (`Il tuo token` o equivalente) senza esporre la `NoteId` privata.

## V06-PLAYER-003 — Futuro pannello personaggio

Un pannello/scheda giocatore entra solo quando esiste una vera sorgente di dati personaggio con contratto noto.

Non si costruisce oggi un pannello vuoto con campi finti.

---

# 6. Gancio integrazioni

## V06-INT-001 — Nessun framework plugin universale

V0.6 non costruisce un marketplace/plugin framework per integrazioni.

Si definisce soltanto un confine applicativo per il primo provider reale quando servirà.

Forma illustrativa futura:

```ts
interface CharacterProvider {
  listCharacters(...): Promise<CharacterSummary[]>
  getCharacter(id: string): Promise<CharacterSnapshot>
}
```

La firma non è normativa finché non esiste il provider reale.

## V06-INT-002 — Provider ai bordi

SDK/API di EcoGDR, BeFolder o altri sistemi futuri non entrano nel core note/board.

La UI parla con un piccolo service/adapter applicativo.

## V06-INT-003 — Auth solo se serve

Se un provider futuro richiede account, usa il flusso definito da `AUTHENTICATION_SPEC.md` o il proprio meccanismo autorizzato.

Non si rende l'intera app account-dependent per collegare un provider.

## V06-INT-004 — Nessuna sync implicita

Collegare una sorgente esterna non significa automaticamente:

- importare tutto;
- sincronizzare continuamente;
- pubblicare dati ai player;
- sovrascrivere la nota locale;
- caricare il vault nel servizio remoto.

Ogni direzione di copia/sync futura deve essere esplicita e progettata contro il vero contratto.

---

# 7. Flusso futuro di collegamento provider

Questa sezione definisce il comportamento di prodotto, non l'API.

## V06-FUT-001 — Collega personaggio esterno

Quando esisterà almeno un provider reale:

```text
Token / nota personaggio
→ Collega fonte esterna…
→ autenticazione se necessaria
→ scegli personaggio reale
→ anteprima del collegamento
→ Conferma
```

Se esiste un solo provider configurato, non serve un picker provider aggiuntivo.

## V06-FUT-002 — Collegamento non distruttivo

Confermare un binding esterno:

- non sostituisce la nota Markdown;
- non cancella dati locali;
- non cambia automaticamente il token oltre alle proprietà che l'utente approva;
- conserva un riferimento tecnico fuori dal corpo Markdown.

La forma persistente concreta del binding verrà decisa quando esisterà il provider reale.

## V06-FUT-003 — Refresh esplicito

La prima integrazione reale preferisce `Aggiorna dalla fonte` esplicito invece di sync continuo in background.

Prima di applicare dati che cambierebbero contenuto locale, mostra anteprima/diff quando applicabile.

## V06-FUT-004 — Provider irraggiungibile

Se il servizio esterno è offline:

- token e note locali continuano a funzionare;
- il collegamento mostra `Fonte non disponibile`;
- nessun dato locale viene cancellato o invalidato.

## V06-FUT-005 — Binding rimosso

`Scollega fonte esterna` rimuove soltanto il collegamento.

Non elimina nota, token, ritratto o contenuto locale già copiato.

---

# 8. Import/export

## V06-IO-001 — La cartella è già il formato di export principale

Campaign Manager non ha bisogno di inventare un formato proprietario “Esporta campagna” per rendere i dati portabili.

La normale cartella con Markdown/JSON/asset resta il formato principale.

## V06-IO-002 — Import specifici soltanto con un caso reale

Non si costruisce un importatore universale per VTT/character builder diversi.

Un import entra quando esiste:

- una sorgente concreta;
- un utente/caso d'uso reale;
- un formato verificabile.

L'import deve mostrare cosa verrà creato/modificato prima di scrivere nel vault quando l'operazione è sostanziale.

---

# 9. Discord bot

## V06-BOT-001 — Non necessario per il prodotto base

La Discord Activity copre già il tavolo live.

V0.6 non aggiunge automaticamente un bot Discord.

Un bot entra soltanto se emerge un caso d'uso che l'Activity non può coprire bene, per esempio comandi fuori dall'Activity.

Non si mantiene un bot solo per continuità con la v1.

---

# 10. Stati ed errori

Per il collegamento nota↔token devono essere rappresentabili almeno:

```text
unlinked
linked
linked_note_missing
```

Per un futuro provider:

```text
provider_unavailable
auth_required
binding_missing
binding_valid
refreshing
refresh_failed
```

Gli stati provider non devono degradare il token locale in un oggetto inutilizzabile.

---

# 11. Acceptance V0.6 locale

## V06-ACC-001 — Collega nota

Token → collega `Characters/Nyx.md` → salva/reopen board → collegamento ancora valido.

## V06-ACC-002 — Rename nota

Rename/move della nota tramite Campaign Manager → token continua a trovare la nota.

## V06-ACC-003 — Nota mancante

Nota eliminata → token resta sulla board e mostra warning solo al DM.

## V06-ACC-004 — Privacy

Player con token collegato non riceve Markdown/NoteId della nota personaggio.

## V06-ACC-005 — Crea da nota

Nota → `Crea token da questa nota` → token creato con link senza modificare il Markdown.

## V06-ACC-006 — Token generico

Token senza nota continua a funzionare esattamente come nelle versioni precedenti.

---

# 12. Gate V0.6

La V0.6 è completa quando:

1. note esistenti possono essere collegate ai token senza nuovo character DB;
2. una nota può generare rapidamente un token collegato;
3. rename/move/missing sono gestiti senza perdita;
4. nessun contenuto privato viene pubblicato per effetto del link;
5. token generici restano semplici;
6. non è stato costruito un character builder universale;
7. non è stato costruito un framework plugin/import universale;
8. il confine futuro per provider esterni è documentato ma non simulato.

---

## Regola finale

V0.6 deve rendere più facile dire:

> “questo token è Nyx e questa è la mia nota su Nyx”

senza costringere il Campaign Manager a decidere oggi come deve essere fatta una scheda personaggio per ogni gioco esistente.