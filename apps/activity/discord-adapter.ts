import { DiscordSDK } from '@discord/embedded-app-sdk';

export interface DiscordActivityContext {
  frameId: string;
  instanceId: string;
  platform: string;
}

export interface ReadyDiscordActivity extends DiscordActivityContext {
  sdk: DiscordSDK;
}

function clean(value: string | null, max = 512): string | undefined {
  if (!value || value.length > max || value.trim() !== value) return undefined;
  return value;
}

export function discordActivityContext(search = globalThis.location?.search ?? ''): DiscordActivityContext | undefined {
  const params = new URLSearchParams(search);
  const frameId = clean(params.get('frame_id'));
  const instanceId = clean(params.get('instance_id'));
  const platform = clean(params.get('platform'), 64);
  if (!frameId || !instanceId || !platform) return undefined;
  return { frameId, instanceId, platform };
}

export function activityApiPath(path: string, inDiscordActivity: boolean): string {
  if (!path.startsWith('/api/')) throw new Error('Activity API path non valido.');
  return inDiscordActivity ? `/.proxy${path}` : path;
}

export async function readyDiscordActivity(clientId: string, context = discordActivityContext()): Promise<ReadyDiscordActivity> {
  if (!context) throw new Error('Contesto Discord Activity mancante.');
  if (!clientId.trim()) throw new Error('Discord Client ID non configurato.');
  const sdk = new DiscordSDK(clientId);
  await sdk.ready();
  const instanceId = sdk.instanceId;
  if (!instanceId || instanceId !== context.instanceId) throw new Error('Discord Activity instance non coerente.');
  return { ...context, instanceId, sdk };
}
