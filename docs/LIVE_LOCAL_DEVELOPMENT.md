# Live web — sviluppo locale

Queste istruzioni servono a verificare la V0.3 senza deploy pubblico.

## 1. Build

```powershell
npm ci
npm run build
```

## 2. Avvia relay + client web

In un terminale:

```powershell
npx --yes wrangler@4.136.1 dev
```

Wrangler usa `wrangler.jsonc`, avvia il Worker locale, i Durable Objects e serve il player web da `dist/activity`.

## 3. Avvia Campaign Manager Desktop

In un secondo terminale:

```powershell
$env:CAMPAIGN_MANAGER_RELAY_URL="http://127.0.0.1:8787"
npm start
```

Apri una campagna e vai in **Live → Avvia sessione**.

## 4. Verifica V03-1

1. Il desktop mostra un join code.
2. Apri la pagina giocatore indicata dal desktop.
3. Inserisci codice e nome.
4. Il player entra nello stato di attesa.
5. Il desktop mostra il partecipante come connesso.
6. Disattiva **Nuovi giocatori** e verifica che un nuovo browser venga rifiutato.
7. Ricarica il browser già autenticato: deve recuperare lo stesso partecipante tramite resume.
8. Rimuovi il partecipante dal desktop: il browser deve perdere l'accesso.

Per simulare più giocatori usa profili/browser differenti, perché la credenziale di resume è conservata in `localStorage` del client.

## Relay pubblico

Il codice è deployabile tramite Wrangler, ma il deploy reale richiede un account Cloudflare e viene configurato separatamente dall'app desktop. Il vault della campagna non viene caricato nel relay dal Goal V03-1.
