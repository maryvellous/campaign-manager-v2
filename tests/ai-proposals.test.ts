import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CampaignService } from '../apps/desktop/application/campaign-service';
import { AiService, type AiSecretCodec } from '../apps/desktop/application/ai-service';
import { LocalStore } from '../apps/desktop/infrastructure/local-store';
import type { AiProvider } from '../packages/ai/src/index';

const codec: AiSecretCodec = {
  available: () => true,
  encrypt: value => Buffer.from(value).toString('base64'),
  decrypt: value => Buffer.from(value, 'base64').toString('utf8'),
};

async function setup(t: { after: (fn: () => Promise<void>) => void }, responses: string[]) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cmv2-ai-proposal-'));
  const root = path.join(dir, 'vault');
  const local = path.join(dir, 'local');
  await fs.mkdir(path.join(root, 'NPC'), { recursive: true });
  await fs.writeFile(path.join(root, 'NPC', 'Maya.md'), '# Maya\nRegina di Meradyl.', 'utf8');
  const store = new LocalStore(local);
  const campaign = new CampaignService(store);
  await campaign.run(() => campaign.open(root));
  const provider: AiProvider = {
    async complete() {
      const value = responses.shift();
      if (value === undefined) throw new Error('No fake response queued');
      return value;
    },
  };
  const ai = new AiService(store, codec, provider);
  await ai.initialize();
  await ai.bindCampaign(campaign.state.campaign?.campaignId);
  await ai.configure('test-key', 'gpt-5.6-luna');
  await ai.acceptPrivacy();
  t.after(async () => { ai.dispose(); await campaign.dispose(); await fs.rm(dir, { recursive: true, force: true }); });
  return { dir, root, local, store, campaign, ai };
}

test('edit proposal is non-authoritative until explicit apply and persists outside vault', async t => {
  const { root, local, campaign, ai } = await setup(t, ['{"markdown":"# Maya\\nRegina prudente di Meradyl."}']);
  const note = await campaign.readNoteForAi('NPC/Maya.md', false);
  await ai.proposeEdit(
    { noteId: note.noteId, title: note.title, revision: note.revision, markdown: note.markdown },
    { label: 'Nota · Maya', text: note.markdown, sources: [{ noteId: note.noteId, title: note.title, relativePath: note.relativePath }] }
  );

  assert.equal(await fs.readFile(path.join(root, 'NPC', 'Maya.md'), 'utf8'), '# Maya\nRegina di Meradyl.');
  assert.equal(ai.state.proposal?.kind, 'edit');
  const threadFile = path.join(local, 'campaigns', campaign.state.campaign!.campaignId, 'ai', 'thread.json');
  const persisted = await fs.readFile(threadFile, 'utf8');
  assert.match(persisted, /Regina prudente/u);
  assert.equal(await fs.readFile(path.join(root, 'NPC', 'Maya.md'), 'utf8'), '# Maya\nRegina di Meradyl.');

  if (!ai.state.proposal || ai.state.proposal.kind !== 'edit') assert.fail('Expected edit proposal');
  await campaign.applyAiEditProposal(ai.state.proposal.noteId, ai.state.proposal.baseRevision, ai.state.proposal.proposedMarkdown);
  await ai.proposalApplied();
  assert.equal(await fs.readFile(path.join(root, 'NPC', 'Maya.md'), 'utf8'), '# Maya\nRegina prudente di Meradyl.');
  assert.equal(ai.state.proposal, undefined);
});

test('discarding an edit proposal leaves the filesystem unchanged', async t => {
  const { root, campaign, ai } = await setup(t, ['{"markdown":"# Maya\\nContenuto che non deve essere applicato."}']);
  const note = await campaign.readNoteForAi('NPC/Maya.md', false);
  await ai.proposeEdit(
    { noteId: note.noteId, title: note.title, revision: note.revision, markdown: note.markdown },
    { label: 'Nota · Maya', text: note.markdown, sources: [] }
  );
  await ai.discardProposal();
  assert.equal(await fs.readFile(path.join(root, 'NPC', 'Maya.md'), 'utf8'), '# Maya\nRegina di Meradyl.');
  assert.equal(ai.state.proposal, undefined);
});

test('stale edit proposal cannot overwrite a note changed after proposal creation', async t => {
  const { root, campaign, ai } = await setup(t, ['{"markdown":"# Maya\\nVersione proposta."}']);
  const note = await campaign.readNoteForAi('NPC/Maya.md', false);
  await ai.proposeEdit(
    { noteId: note.noteId, title: note.title, revision: note.revision, markdown: note.markdown },
    { label: 'Nota · Maya', text: note.markdown, sources: [] }
  );
  await fs.writeFile(path.join(root, 'NPC', 'Maya.md'), '# Maya\nModifica esterna più recente.', 'utf8');
  if (!ai.state.proposal || ai.state.proposal.kind !== 'edit') assert.fail('Expected edit proposal');
  await assert.rejects(
    campaign.applyAiEditProposal(ai.state.proposal.noteId, ai.state.proposal.baseRevision, ai.state.proposal.proposedMarkdown),
    (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'conflict'
  );
  assert.equal(await fs.readFile(path.join(root, 'NPC', 'Maya.md'), 'utf8'), '# Maya\nModifica esterna più recente.');
  assert.equal(ai.state.proposal.kind, 'edit');
});

test('new-note proposal can be edited before explicit collision-safe create', async t => {
  const { root, campaign, ai } = await setup(t, ['{"title":"Incontro con Maya","parentFolder":"NPC","markdown":"# Incontro\\nAppunti iniziali."}']);
  await ai.proposeNew({ label: 'Campagna intera', text: '', sources: [] }, campaign.aiFolderIds());
  assert.equal(ai.state.proposal?.kind, 'new');
  await ai.updateNewProposal('Udienza con Maya', 'NPC', '# Udienza\nVersione rivista dal DM.');
  if (!ai.state.proposal || ai.state.proposal.kind !== 'new') assert.fail('Expected new-note proposal');

  const saved = await campaign.createAiNote(ai.state.proposal.parentFolder, ai.state.proposal.title, ai.state.proposal.markdown);
  assert.equal(saved.noteId, 'NPC/Udienza con Maya.md');
  await ai.proposalApplied();
  assert.equal(await fs.readFile(path.join(root, saved.noteId), 'utf8'), '# Udienza\nVersione rivista dal DM.');

  await assert.rejects(
    campaign.createAiNote('NPC', 'Udienza con Maya', 'collision'),
    (error: unknown) => typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'collision'
  );
});

test('new conversation clears a pending proposal but never removes campaign notes', async t => {
  const { root, campaign, ai } = await setup(t, ['{"title":"Nuova voce","parentFolder":"","markdown":"Contenuto"}']);
  await ai.proposeNew({ label: 'Campagna intera', text: '', sources: [] }, campaign.aiFolderIds());
  assert.ok(ai.state.proposal);
  await ai.newConversation();
  assert.equal(ai.state.proposal, undefined);
  assert.equal(await fs.readFile(path.join(root, 'NPC', 'Maya.md'), 'utf8'), '# Maya\nRegina di Meradyl.');
});
