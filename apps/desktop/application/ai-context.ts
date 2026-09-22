import type { AiContextSelection, AiPreparedContext, AiSource } from '../../../packages/ai/src/index';
import type { CampaignService, SearchResult } from './campaign-service';

const MAX_CONTEXT_CHARS = 60_000;
const MAX_CAMPAIGN_SOURCES = 6;
const STOP_WORDS = new Set([
  'che','chi','con','come','cosa','dove','della','delle','degli','del','dei','dal','dai','dagli','dalle',
  'nel','nei','negli','nelle','non','per','tra','fra','una','uno','gli','le','la','lo','il','un','di','da',
  'su','sul','sulla','sulle','sui','sono','sia','era','essere','ha','hanno','ho','hai','mi','ti','si','ci',
  'questo','questa','questi','queste','quello','quella','quali','qual','piu','più','anche','solo','gia','già',
  'the','and','for','with','from','that','this','what','where','who','how','are','was','were','have','has',
]);

export type AiContextErrorCode = 'context_too_large' | 'source_missing';

export class AiContextError extends Error {
  constructor(readonly code: AiContextErrorCode, message: string) {
    super(message);
    this.name = 'AiContextError';
  }
}

function sourceOf(note: { noteId: string; title: string; relativePath: string }): AiSource {
  return { noteId: note.noteId, title: note.title, relativePath: note.relativePath };
}

function block(source: AiSource, markdown: string): string {
  return `=== NOTA: ${source.relativePath} ===\n${markdown.trim()}\n=== FINE NOTA ===`;
}

function terms(prompt: string): string[] {
  const normalized = prompt.normalize('NFKD').replace(/[\p{Diacritic}]/gu, '').toLocaleLowerCase();
  return [...new Set(normalized.match(/[\p{L}\p{N}][\p{L}\p{N}'_-]*/gu) ?? [])]
    .filter(term => term.length >= 3 && !STOP_WORDS.has(term))
    .sort((left, right) => right.length - left.length)
    .slice(0, 12);
}

function addRank(scores: Map<string, number>, results: SearchResult[], multiplier: number): void {
  results.slice(0, 8).forEach((result, index) => {
    scores.set(result.noteId, (scores.get(result.noteId) ?? 0) + multiplier * Math.max(1, 8 - index) + result.score / 1000);
  });
}

async function campaignContext(service: CampaignService, prompt: string): Promise<AiPreparedContext> {
  const scores = new Map<string, number>();
  const exact = await service.searchNotes(prompt);
  addRank(scores, exact, 4);
  for (const term of terms(prompt)) addRank(scores, await service.searchNotes(term), 1);

  const ranked = [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, MAX_CAMPAIGN_SOURCES * 2);

  const sources: AiSource[] = [];
  const blocks: string[] = [];
  let used = 0;
  for (const [noteId] of ranked) {
    if (sources.length >= MAX_CAMPAIGN_SOURCES) break;
    try {
      // Campaign-wide retrieval intentionally uses the authoritative file on disk,
      // not dirty editor/recovery buffers that the user did not explicitly select.
      const note = await service.readNoteForAi(noteId, false);
      const source = sourceOf(note);
      const text = block(source, note.markdown);
      if (text.length > MAX_CONTEXT_CHARS) continue;
      if (used + text.length > MAX_CONTEXT_CHARS) continue;
      sources.push(source);
      blocks.push(text);
      used += text.length;
    } catch {
      // Search is derived data. A file can disappear between search and read.
      // Missing notes are simply not reported as sources.
    }
  }

  return { label: 'Campagna intera', text: blocks.join('\n\n'), sources };
}

export async function prepareAiContext(
  service: CampaignService,
  prompt: string,
  selection: AiContextSelection
): Promise<AiPreparedContext> {
  if (selection.kind === 'campaign') return campaignContext(service, prompt);

  if (selection.kind === 'selection') {
    const selected = selection.selection.trim();
    if (!selected) throw new AiContextError('source_missing', 'La selezione non è più disponibile.');
    if (selected.length > MAX_CONTEXT_CHARS) throw new AiContextError('context_too_large', 'La selezione è troppo grande per una singola richiesta.');
    let note;
    try { note = await service.readNoteForAi(selection.noteId, false); }
    catch { throw new AiContextError('source_missing', 'La nota della selezione non è più disponibile.'); }
    const source = sourceOf(note);
    return {
      label: `Selezione · ${source.title}`,
      text: `=== SELEZIONE DA: ${source.relativePath} ===\n${selected}\n=== FINE SELEZIONE ===`,
      sources: [source],
    };
  }

  let note;
  try { note = await service.readNoteForAi(selection.noteId, true); }
  catch { throw new AiContextError('source_missing', 'La nota scelta non è più disponibile.'); }
  const source = sourceOf(note);
  const text = block(source, note.markdown);
  if (text.length > MAX_CONTEXT_CHARS) throw new AiContextError('context_too_large', 'La nota scelta è troppo grande per una singola richiesta.');
  return { label: `Nota · ${source.title}`, text, sources: [source] };
}

export function aiInstructions(context: AiPreparedContext): string {
  const base = [
    'Sei l’assistente del Campaign Manager di un Dungeon Master.',
    'Rispondi alla richiesta usando il materiale della campagna quando è presente nel contesto.',
    'Non affermare di aver letto note diverse da quelle incluse qui.',
    'Se il contesto non contiene la risposta, distingui chiaramente ciò che deriva dalla campagna da eventuali suggerimenti o inferenze.',
    'Non inventare nomi di file o fonti. L’interfaccia mostrerà separatamente le fonti realmente lette.',
  ].join(' ');
  return context.text ? `${base}\n\nCONTESTO CAMPAGNA (${context.label}):\n${context.text}` : `${base}\n\nNessuna nota pertinente è stata recuperata per questa richiesta.`;
}
