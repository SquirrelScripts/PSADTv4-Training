// Shared helpers for the build scripts: read the slides out of index.html and load the
// browser's speech helpers (assets/speech.js) so Node splits sentences the same way the player does.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ENTITIES[e]);
export const text = (html) => decode(html.replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const paragraphs = (html) => (html ? [...html.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => text(m[1])) : []);

export function parseSlides(html = readFileSync(join(root, 'index.html'), 'utf8')) {
  return [...html.matchAll(/<section class="slide([^"]*)" id="([^"]+)" data-module="([^"]+)" data-title="([^"]+)"(?: data-answer="(\d)")?>([\s\S]*?)<\/section>/g)]
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
}

export function loadSpeech() {
  const context = {};
  vm.runInNewContext(readFileSync(join(root, 'assets', 'speech.js'), 'utf8'), context);
  return context.PSADT_SPEECH;
}
