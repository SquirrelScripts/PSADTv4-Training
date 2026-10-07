// Renders the narration to MP3 with ElevenLabs: one file per sentence (so captions stay in sync),
// plus assets/audio/manifest.json, which the player uses to play the recording instead of the browser voice.
//
// Environment:
//   ELEVENLABS_API_KEY    required (Text to Speech access; Voices read access for --list-voices)
//   ELEVENLABS_VOICE_ID   required to render; find it with --list-voices
//   ELEVENLABS_MODEL      optional, default eleven_multilingual_v2
//
// Usage:
//   npm run audio -- --list-voices   list the voices on your account
//   npm run audio -- --dry-run       count characters (credits) without calling the API
//   npm run audio                    render new or changed sentences only
//   npm run audio -- --force         re-render everything
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, parseSlides, loadSpeech } from './slides.mjs';

const API = process.env.ELEVENLABS_API_BASE || 'https://api.elevenlabs.io';   // override only for testing
const OUTPUT_FORMAT = 'mp3_44100_128';
const CONCURRENCY = 2;
// Steady, low-drama narration. Lower stability adds expression; higher is more even.
const VOICE_SETTINGS = { stability: 0.55, similarity_boost: 0.8, style: 0.1, use_speaker_boost: true };

const args = new Set(process.argv.slice(2));
const apiKey = process.env.ELEVENLABS_API_KEY;
const voiceId = process.env.ELEVENLABS_VOICE_ID;
const model = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const audioDir = join(root, 'assets', 'audio');
const clipsDir = join(audioDir, 'clips');   // clip names carry a content hash, so they can be cached forever
const manifestPath = join(audioDir, 'manifest.json');

const fail = (message) => { console.error(message); process.exit(1); };

async function api(path, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}${path}`, { ...init, headers: { 'xi-api-key': apiKey, ...init.headers } });
    if (res.ok) return res;
    const body = await res.text();
    if (res.status === 401 || res.status === 403) fail(`ElevenLabs refused the API key (${res.status}). Check the key and its permissions.\n${body}`);
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const wait = 2000 * 2 ** (attempt - 1);
      console.warn(`  ${res.status} from ElevenLabs, retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    const err = new Error(`ElevenLabs ${res.status}: ${body}`);
    err.status = res.status;
    throw err;
  }
}

if (args.has('--list-voices')) {
  if (!apiKey) fail('Set ELEVENLABS_API_KEY first.');
  const { voices } = await (await api('/v1/voices')).json();
  for (const v of voices.sort((a, b) => a.name.localeCompare(b.name))) {
    const labels = Object.values(v.labels || {}).filter(Boolean).join(', ');
    console.log(`${v.voice_id}  ${v.name}${labels ? `  (${labels})` : ''}`);
  }
  process.exit(0);
}

/* ---------------------------------------------------------------- plan */

const { toChunks, speakable } = loadSpeech();
const slides = parseSlides();
const items = [];   // every sentence to render, in playback order
const manifest = { version: 1, voice: { id: voiceId || null, name: null }, model, generatedAt: null, slides: {}, common: {} };

const hashOf = (speech) => createHash('sha1').update(JSON.stringify([model, voiceId, VOICE_SETTINGS, speech])).digest('hex').slice(0, 10);

const plan = (fileBase, chunks) => chunks.map((c, i) => {
  const speech = speakable(c.text);
  const hash = hashOf(speech);
  const item = {
    text: c.text,
    speech,
    hash,
    previous: chunks[i - 1] ? speakable(chunks[i - 1].text) : undefined,
    next: chunks[i + 1] ? speakable(chunks[i + 1].text) : undefined,
    file: `${fileBase}-${String(i + 1).padStart(2, '0')}-${hash}.mp3`,
  };
  items.push(item);
  return item;
});

for (const s of slides) {
  manifest.slides[s.id] = {
    chunks: plan(s.id, toChunks(s.narration)),
    expl: s.isPoll ? plan(`${s.id}-answer`, toChunks(s.explanation)) : [],
  };
}
manifest.common.correct = plan('common-correct', [{ text: 'Correct.' }])[0];
manifest.common.wrong = plan('common-wrong', [{ text: 'Not quite.' }])[0];

const chars = items.reduce((a, it) => a + it.speech.length, 0);
console.log(`${items.length} sentences across ${slides.length} slides, ${chars.toLocaleString('en-US')} characters to synthesise (model ${model}).`);

if (args.has('--dry-run')) process.exit(0);
if (!apiKey) fail('Set ELEVENLABS_API_KEY first (see README: Studio narration).');
if (!voiceId) fail('Set ELEVENLABS_VOICE_ID first. Run `npm run audio -- --list-voices` to find one.');

/* -------------------------------------------------------------- render */

mkdirSync(clipsDir, { recursive: true });
const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
const previousByFile = new Map();
if (previous) {
  for (const slide of Object.values(previous.slides || {})) for (const c of [...slide.chunks, ...slide.expl]) previousByFile.set(c.file, c);
  for (const c of Object.values(previous.common || {})) previousByFile.set(c.file, c);
}

function durationMs(file) {
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const seconds = Number.parseFloat(probe.stdout);
  if (probe.status === 0 && Number.isFinite(seconds)) return Math.round(seconds * 1000);
  return Math.round((statSync(file).size * 8) / 128);   // 128 kbps constant bit rate
}

async function synthesise(it, withContext = true) {
  const body = { text: it.speech, model_id: model, voice_settings: VOICE_SETTINGS };
  if (withContext) Object.assign(body, { previous_text: it.previous, next_text: it.next });
  try {
    const res = await api(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify(body),
    });
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    // Some models don't accept neighbouring-sentence context; retry once without it.
    if (withContext && (err.status === 400 || err.status === 422)) return synthesise(it, false);
    throw err;
  }
}

let rendered = 0;
let reused = 0;
const queue = [...items];
async function worker() {
  while (queue.length) {
    const it = queue.shift();
    const path = join(clipsDir, it.file);
    const old = previousByFile.get(it.file);
    if (!args.has('--force') && old && existsSync(path)) {
      it.ms = old.ms;
      reused++;
      continue;
    }
    writeFileSync(path, await synthesise(it));
    it.ms = durationMs(path);
    rendered++;
    console.log(`  ${it.file}  ${(it.ms / 1000).toFixed(1)}s  ${it.text.slice(0, 60)}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

try {
  const { name } = await (await api(`/v1/voices/${encodeURIComponent(voiceId)}`)).json();
  manifest.voice.name = name || null;
} catch { /* the name is cosmetic */ }

// Write the manifest without the render-only fields.
const strip = ({ text, file, ms }) => ({ text, file, ms });
for (const slide of Object.values(manifest.slides)) {
  slide.chunks = slide.chunks.map(strip);
  slide.expl = slide.expl.map(strip);
}
manifest.common.correct = strip(manifest.common.correct);
manifest.common.wrong = strip(manifest.common.wrong);
manifest.generatedAt = new Date().toISOString();
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

// Remove recordings for sentences that no longer exist.
const keep = new Set(items.map((it) => it.file));
let removed = 0;
for (const f of readdirSync(clipsDir)) {
  if (f.endsWith('.mp3') && !keep.has(f)) { rmSync(join(clipsDir, f)); removed++; }
}

const totalMs = items.reduce((a, it) => a + (it.ms || 0), 0);
console.log(`Done: ${rendered} rendered, ${reused} unchanged, ${removed} removed. ${Math.round(totalMs / 60000)} min of narration, voice "${manifest.voice.name || voiceId}".`);
