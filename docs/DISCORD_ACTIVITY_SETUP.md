# Discord Activity — setup operativo

Questa configurazione serve alla V0.4. Nessuna credenziale Discord va salvata nella campagna o committata nel repository.

## Variabili relay

Il Worker legge:

- `DISCORD_CLIENT_ID`: Application ID / Client ID dell'app Discord;
- `DISCORD_CLIENT_SECRET`: secret OAuth usato **solo server-side** per scambiare il code ricevuto dall'Embedded App SDK;
- `DISCORD_BOT_TOKEN`: token server-side usato **solo** per `GET /applications/{application.id}/activity-instances/{instance_id}`.

Il Bot Token non viene inviato al browser, non viene usato per Gateway, messaggi, slash command o presenza, e non rende la Discord Activity l'host della sessione.

Per sviluppo locale usare un file `.dev.vars` non versionato. Per Cloudflare usare secret/vars del deployment. Il repository ignora `.dev.vars*`.

Esempio locale:

```dotenv
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_BOT_TOKEN=...
```

## Discord Developer Portal

L'applicazione deve avere Activities abilitate e una URL Mapping che punti al deployment pubblico del Worker/Activity.

Il client usa l'Embedded App SDK ufficiale e richiede soltanto lo scope OAuth `identify` per V0.4.

## Flusso verificato dal backend

```text
Activity SDK
→ authorize(identify)
→ code OAuth
→ relay scambia code con Client Secret
→ relay GET /users/@me con Bearer access token
→ relay GET Activity Instance con Bot Token
→ user id deve essere presente nella stessa instanceId
→ mapping a participantId runtime
→ normale ticket player / protocollo live V0.3
```

Il client non invia un `discordUserId` da considerare autorevole.

## Pairing

Il pairing resta master-only:

```text
Desktop host
→ genera ABC-DEF
→ Activity master inserisce il codice
→ instanceId ↔ liveSessionId
```

Un'istanza non associata riceve zero stato campagna. Una nuova istanza richiede un nuovo pairing e revoca credenziali/socket della precedente senza trasformare l'Activity in host.

## Deployment production

Il deployment production corrente usa:

- Worker Cloudflare: `campaign-manager-live`;
- URL pubblico Activity/relay: `https://campaign-manager-live.mary-dembech.workers.dev/`;
- R2: `campaign-manager-live-assets` tramite binding `LIVE_ASSETS`;
- `DISCORD_CLIENT_ID=1551919866074628228` nel manifest;
- `DISCORD_CLIENT_SECRET` e `DISCORD_BOT_TOKEN` come secret Cloudflare Production.

`GET /api/activity/config` e `GET /.proxy/api/activity/config` devono restituire lo stesso `clientId` e `identityReady: true` prima del test Discord.

## Gate operativo ancora necessario

CI copre dominio, protocollo, OAuth/instance verification con risposte Discord simulate, Worker/Durable Objects, browser standalone e network smoke. Il deployment production è configurato e risponde con `identityReady: true`.

Resta un solo gate esterno: il collaudo end-to-end dentro un vero client Discord, inclusi Root Mapping, apertura Activity, pairing master e join di almeno due player nella stessa instance. Questo test richiede interazione con il client/Developer Portal e non deve bloccare lo sviluppo delle aree successive che non dipendono da Discord.
