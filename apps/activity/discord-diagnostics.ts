export type DiscordAuthStage = 'authorize' | 'join' | 'authenticate';

const stageLabel: Record<DiscordAuthStage, string> = {
  authorize: 'Autorizzazione Discord fallita',
  join: 'Ingresso Activity fallito',
  authenticate: 'Autenticazione Discord fallita'
};

function safeDiagnosticText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/giu, 'Bearer [redacted]')
    .replace(/\b(access[_ -]?token|authorization|oauth[_ -]?code)\b\s*[:=]\s*["']?[^"',\s}]+/giu, '$1=[redacted]')
    .slice(0, max);
}

export function discordAuthFailure(stage: DiscordAuthStage, failure: unknown): string {
  const prefix = stageLabel[stage];
  let code: string | undefined;
  let message: string | undefined;

  if (failure instanceof Error) {
    message = safeDiagnosticText(failure.message, 240);
  } else if (failure && typeof failure === 'object' && !Array.isArray(failure)) {
    const record = failure as Record<string, unknown>;
    code = safeDiagnosticText(record.code, 80);
    message = safeDiagnosticText(record.message, 240);
  }

  if (message && code) return `${prefix}: ${message} [${code}]`;
  if (message) return `${prefix}: ${message}`;
  if (code) return `${prefix}: codice ${code}`;
  return `${prefix}: Discord non ha fornito dettagli utilizzabili.`;
}
