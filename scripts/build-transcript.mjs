// Builds transcript.md (the narration script) from the slides in index.html.
// Usage: node scripts/build-transcript.mjs [--check]
//   --check  exit 1 if transcript.md is out of date instead of writing it.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'index.html');
const outPath = join(root, 'transcript.md');

// Keep in step with assets/player.js.
const WPM = 165;
const SLIDE_GAP_MS = 900;
const POLL_ALLOWANCE_MS = 10000;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTITIES[e]);
const text = (html) => decode(html.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const paragraphs = (html) => (html ? [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => text(m[1])) : []);
const words = (list) => list.reduce((a, p) => a + (p.match(/\S+/g) || []).length, 0);
const msFor = (n) => (n / WPM) * 60000;
const fmt = (ms) => {
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const html = readFileSync(htmlPath, 'utf8');
const slides = [...html.matchAll(/<section class="slide([^"]*)" id="([^"]+)" data-module="([^"]+)" data-title="([^"]+)"(?: data-answer="(\d)")?>([\s\S]*?)<\/section>/g)]
  .map(([, classes, id, module, title, answer, body]) => {
    const isPoll = /\bpoll\b/.test(classes);
    const narration = paragraphs(body.match(/<aside class="narration">([\s\S]*?)<\/aside>/)?.[1]);
    const explanation = paragraphs(body.match(/<aside class="explanation">([\s\S]*?)<\/aside>/)?.[1]);
    const question = isPoll ? text(body.match(/<h2 class="poll-q">([\s\S]*?)<\/h2>/)?.[1] || '') : '';
    const options = isPoll
      ? [...(body.match(/<ol class="options">([\s\S]*?)<\/ol>/)?.[1] || '').matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]))
      : [];
    if (!narration.length) throw new Error(`Slide "${id}" has no narration.`);
    if (isPoll && (!explanation.length || options.length < 2 || answer === undefined)) throw new Error(`Knowledge check "${id}" is incomplete.`);
    return { id, module: decode(module), title: decode(title), isPoll, answer: Number(answer), narration, explanation, question, options };
  });

const slideMs = (s) => msFor(words(s.narration)) + SLIDE_GAP_MS + (s.isPoll ? msFor(words(s.explanation) + 2) + POLL_ALLOWANCE_MS : 0);
const totalMs = slides.reduce((a, s) => a + slideMs(s), 0);
const totalWords = slides.reduce((a, s) => a + words(s.narration) + words(s.explanation), 0);

const lines = [
  '# PSAppDeployToolkit v4: Technician Training',
  '',
  '## Narration script',
  '',
  `Estimated runtime **${fmt(totalMs)}** at ${WPM} words per minute, including pauses and time to answer the knowledge checks. ${slides.length} slides, ${totalWords.toLocaleString('en-US')} narrated words. Timecodes are estimates.`,
  '',
  '> PSAppDeployToolkit is free, open-source software built and maintained by the PSAppDeployToolkit Team (Sean Lillis, Dan Cunningham, Muhammad Mashwani, Mitch Richters and Dan Gough) and its community contributors, licensed under the LGPL-3.0. This is independent training material, not an official PSAppDeployToolkit Team product. Facts were verified against the PSAppDeployToolkit 4.1.8 source.',
  '',
  '**Recording notes:** say “PSADT” as letters (P-S-A-D-T). In function names, spell out ADT, so `Show-ADTInstallationWelcome` is “Show A-D-T Installation Welcome”. Read 3010 as “thirty-ten” and 1602 as “sixteen-oh-two”. At each knowledge check, pause for the audience, then read the answer.',
  '',
  '_Generated from `index.html` by `npm run transcript`. Edit the narration there, not here._',
];

let module = '';
let clock = 0;
slides.forEach((s, i) => {
  if (s.module !== module) {
    module = s.module;
    lines.push('', '---', '', `## ${module}`);
  }
  lines.push('', `### ${i + 1}. ${s.title} · \`${fmt(clock)}\``, '');
  if (s.isPoll) {
    lines.push(`**Question:** ${s.question}`, '');
    s.options.forEach((o, k) => lines.push(`- ${'ABCDEF'[k]}. ${o}${k === s.answer ? ' **(correct)**' : ''}`));
    lines.push('', '**Narration:**', '');
  }
  lines.push(s.narration.join('\n\n'));
  if (s.isPoll) lines.push('', '**Answer:**', '', s.explanation.join('\n\n'));
  clock += slideMs(s);
});
lines.push('');

const output = lines.join('\n');
if (process.argv.includes('--check')) {
  const current = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
  if (current !== output) {
    console.error('transcript.md is out of date. Run: npm run transcript');
    process.exit(1);
  }
  console.log(`transcript.md is up to date (${slides.length} slides, ${fmt(totalMs)}).`);
} else {
  writeFileSync(outPath, output);
  console.log(`Wrote transcript.md: ${slides.length} slides, ${totalWords} words, about ${fmt(totalMs)}.`);
}
