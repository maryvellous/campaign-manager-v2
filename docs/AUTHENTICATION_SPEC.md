# Campaign Manager v2 — Authentication Hook Specification

## 1. Direzione approvata

Campaign Manager deve poter funzionare **senza account**.

L'autenticazione applicativa è una capability futura per servizi cloud che la richiederanno davvero; non è il fondamento del prodotto locale.

Oggi si costruiscono soltanto:

- il posto corretto nell'interfaccia;
- il confine applicativo dove in futuro verrà collegato il vero servizio;
- le regole che impediscono all'account di contaminare vault, live session e altre feature indipendenti.

Prefisso requisiti: `AUTH-*`.

Principio:

> nessun login per usare ciò che può funzionare senza login.

---

# 2. Stato attuale — placeholder

## AUTH-NOW-001 — Nessun login all'avvio

V0.1 non mostra login, onboarding account o scelta provider all'avvio.

Il flusso resta:

```text
apri app
→ apri campagna locale
→ lavora
```

Un utente nuovo deve poter arrivare alla propria campagna senza creare identità online.

## AUTH-NOW-002 — Posizione UI

La superficie riservata all'account vive in **Impostazioni → Account**, non nella navigazione primaria e non come popup iniziale.

Finché il servizio non esiste, la sezione mostra uno stato neutro equivalente a:

```text
Account

Non serve un account per usare Campaign Manager.
Le funzioni online collegate a un account arriveranno più avanti.

In arrivo
```

Non deve esserci un pulsante `Accedi` che non può completare davvero un login.

## AUTH-NOW-003 — Nessun avatar/login finto

Prima dell'attivazione reale dell'autenticazione non si aggiungono:

- avatar vuoti nella top bar;
- menu profilo senza funzioni;
- session indicator fake;
- token locali inventati;
- chiamate di rete per verificare un account inesistente.

## AUTH-NOW-004 — Nessuna dipendenza runtime

Il placeholder non richiede backend, rete o storage credenziali.

L'assenza del servizio auth non genera errori e non degrada la campagna locale.

---

# 3. Gancio architetturale minimo

## AUTH-HOOK-001 — Confine futuro

Quando esisterà il servizio reale, la UI parlerà con un piccolo servizio applicativo e non direttamente con SDK/provider HTTP.

Forma puramente illustrativa:

```ts
interface AuthService {
  getSession(): Promise<AuthSession | null>
  signIn(): Promise<AuthSession>
  signOut(): Promise<void>
}
```

La firma definitiva nasce contro il vero backend/provider.

V0.1 non deve implementare un `FakeAuthService` complesso solo per soddisfare questa interfaccia.

## AUTH-HOOK-002 — Composition root

Il collegamento al provider auth futuro appartiene al bordo dell'applicazione/composition root.

Core, note, board e filesystem non importano SDK di autenticazione.

## AUTH-HOOK-003 — Stato account fuori dal vault

Sessioni, token e informazioni tecniche dell'account non vengono scritti in:

- Markdown;
- `campaign.json`;
- `*.board.json`;
- asset della campagna.

Il vault non deve diventare inutilizzabile cambiando o perdendo account.

---

# 4. Cosa NON dipende dall'account applicativo

## AUTH-BOUND-001 — Campaign Manager locale

Apertura, modifica e salvataggio della campagna restano disponibili da signed-out/offline.

## AUTH-BOUND-002 — Live V0.3

Il join/resume tecnico della live web usa le credenziali runtime della sessione definite da `LIVE_SESSION_SPEC.md`.

Non richiede account Campaign Manager.

## AUTH-BOUND-003 — Discord V0.4

L'identità Discord usata per entrare in una Activity è identity della live session, non login dell'app desktop.

Non si fondono account Campaign Manager e account Discord solo perché entrambi identificano una persona.

## AUTH-BOUND-004 — IA V0.5

L'eventuale credenziale/API key di un provider IA è configurazione locale del provider e non equivale all'account Campaign Manager.

L'IA non deve essere bloccata dall'assenza dell'autenticazione applicativa se il provider configurato può funzionare autonomamente.

## AUTH-BOUND-005 — Compendio

Il Compendio userà l'account soltanto **se il vero servizio cloud lo richiederà**.

Se il servizio reale è consultabile anonimamente, il Campaign Manager non aggiungerà login artificiale.

---

# 5. Flusso futuro quando l'auth diventa reale

## AUTH-FUT-001 — Attivazione contestuale

Il login diventa visibile soltanto quando esiste almeno una feature reale che lo usa.

Le due vie normali saranno:

```text
Impostazioni → Account → Accedi
```

oppure, da una feature che richiede account:

```text
funzione cloud
→ "Per usare questa funzione devi accedere"
→ Accedi
→ ritorno alla funzione richiesta
```

Niente redirect obbligatorio al login durante l'apertura dell'app.

## AUTH-FUT-002 — Browser/system flow preferito

Quando possibile il login reale usa il browser di sistema o il flusso sicuro raccomandato dal provider scelto in quel momento.

Il Campaign Manager non raccoglie password del servizio dentro un form proprietario se non è strettamente necessario.

OAuth/OIDC/provider concreto, callback e protocollo di token non vengono scelti prima di avere il servizio reale.

## AUTH-FUT-003 — Stati UX

La superficie Account deve poter rappresentare almeno:

- `signed_out`;
- `signing_in`;
- `signed_in`;
- `offline`;
- `session_expired`;
- `error`.

Questi sono stati di interfaccia futuri; V0.1 mostra soltanto il placeholder.

## AUTH-FUT-004 — Login annullato/fallito

Se il login viene annullato o fallisce:

- l'utente torna allo stato precedente;
- la campagna resta aperta;
- nessun dato locale viene modificato;
- la feature cloud richiesta mostra un errore/azione `Riprova` comprensibile.

## AUTH-FUT-005 — Sessione scaduta

Una sessione account scaduta interrompe soltanto le operazioni cloud che la richiedono.

Non:

- chiude la campagna;
- blocca editor/board;
- termina la live V0.3/V0.4;
- nasconde note già locali.

La UI offre `Accedi di nuovo` quando serve.

## AUTH-FUT-006 — Logout

`Esci dall'account`:

- revoca/rimuove le credenziali locali secondo il provider reale;
- disconnette le sole feature account-dependent;
- non elimina campagne, note, board o copie locali provenienti dal Compendio;
- non termina una live session indipendente dall'account.

## AUTH-FUT-007 — Cambio account

Cambiare account non cambia automaticamente la campagna locale aperta e non riassocia implicitamente `externalBinding`.

Qualunque associazione cloud futura che dipenda dall'account deve essere mostrata e gestita esplicitamente.

---

# 6. Credenziali e sicurezza future

## AUTH-SEC-001 — Secret fuori dai file campagna

Token/refresh token/session secret futuri vivono nello storage sicuro appropriato all'app/OS, non nel vault.

La tecnologia precisa viene scelta con il provider reale.

## AUTH-SEC-002 — Nessun secret ai player

Credenziali account del desktop non raggiungono web player, Discord Activity o payload live.

## AUTH-SEC-003 — Log

Token e secret non vengono loggati in chiaro.

## AUTH-SEC-004 — Least privilege

Quando arriverà il provider reale, richiedere soltanto scope/permessi necessari alle feature effettivamente abilitate.

---

# 7. Errori futuri

Il confine auth dovrà poter distinguere semanticamente almeno:

```text
auth_unavailable
auth_cancelled
auth_failed
auth_expired
network_unavailable
permission_denied
```

I codici concreti possono essere adattati al provider reale; la UI non deve dipendere dalle stringhe grezze dell'SDK.

---

# 8. Gate del placeholder

La fase attuale è corretta se:

1. l'app si usa completamente senza account;
2. `Impostazioni → Account` comunica chiaramente che il login non serve oggi;
3. non esistono pulsanti o flussi auth finti;
4. non vengono create sessioni/token placeholder;
5. nessuna feature corrente importa un provider auth;
6. il punto UI e il confine architetturale permettono di aggiungere il servizio reale in seguito senza riprogettare il vault.

---

# 9. Gate dell'attivazione futura

Quando l'autenticazione verrà davvero implementata, deve essere verificato almeno:

1. signed-out → login → ritorno alla feature richiesta;
2. cancel/failure non tocca la campagna;
3. session expiry degrada solo feature cloud;
4. logout lascia intatti tutti i dati locali;
5. offline lascia utilizzabile il prodotto locale;
6. nessun secret finisce nel vault o nei player client;
7. Discord identity/live credential e account Campaign Manager restano sistemi distinti.

---

## Regola finale

L'account è riuscito quando aggiunge capacità cloud senza cambiare la risposta alla domanda fondamentale:

> "Posso aprire e usare la mia campagna senza autenticarmi?"

La risposta deve restare **sì**.