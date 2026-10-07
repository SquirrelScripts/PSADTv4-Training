/* PSADT v4 Technician Training: session player.
   Slides and narration live in index.html; this file turns them into a narrated,
   self-paced session using the browser's built-in speech synthesis. */
(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  const WPM = 165;                  // estimated narration speed at 1x
  const POLL_ALLOWANCE_MS = 10000;  // time budgeted for answering a knowledge check
  const STORE_PREFIX = 'psadt4-training:';
  const CREDIT = 'PSAppDeployToolkit © PSAppDeployToolkit Team · LGPL-3.0';

  // Narrator styles: pitch, pacing and pauses. Documentary reads lower and slower, with room between sentences.
  const STYLES = {
    documentary: { pitch: 0.8, rate: 0.95, sentenceGapMs: 250, slideGapMs: 1300 },
    standard: { pitch: 1, rate: 1, sentenceGapMs: 0, slideGapMs: 900 },
    // Recorded narration from scripts/render-audio.mjs; pitch and rate only apply to sentences without a recording.
    studio: { pitch: 0.8, rate: 0.95, sentenceGapMs: 150, slideGapMs: 1100, studio: true },
  };

  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

  // Storage can be unavailable (private windows, blocked site data); everything works without it.
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(STORE_PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value)); } catch { /* ignore */ }
    },
  };

  /* ------------------------------------------------------------------ text */

  const { wordCount, toChunks, speakable } = window.PSADT_SPEECH;
  const sumWords = (chunks, n = chunks.length) => chunks.slice(0, n).reduce((a, c) => a + c.words, 0);
  const msFor = (words, rate) => (words / (WPM * rate)) * 60000;

  const fmt = (ms) => {
    const s = Math.max(0, Math.round(ms / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };
  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------------------------------------------------- slide model */

  const slides = $$('#deck > .slide').map((el, i) => {
    const paras = (sel) => $$(`${sel} p`, el).map((p) => p.textContent.replace(/\s+/g, ' ').trim());
    return {
      el, i,
      id: el.id,
      title: el.dataset.title,
      module: el.dataset.module,
      isPoll: el.classList.contains('poll'),
      answer: el.dataset.answer === undefined ? -1 : Number(el.dataset.answer),
      chunks: toChunks(paras('.narration')),
      expl: toChunks(paras('.explanation')),
    };
  });

  const modules = [];
  for (const s of slides) {
    let m = modules.find((x) => x.name === s.module);
    if (!m) {
      m = { name: s.module, num: s.module === 'Welcome' ? 0 : modules.filter((x) => x.name !== 'Welcome').length + 1, slides: [] };
      modules.push(m);
    }
    m.slides.push(s);
    s.mod = m;
  }

  /* ---------------------------------------------------------------- state */

  const savedStyle = store.get('style', null);
  // Studio needs recordings, which load asynchronously; start on documentary and switch once they arrive.
  const wantStudio = savedStyle === null || savedStyle === 'studio';

  const state = {
    index: 0,
    playing: false,
    phase: 'narration',          // narration | awaiting | explanation | done
    chunk: 0,
    chunkStart: 0,
    chunkMs: 0,
    gapTimer: 0,
    rate: Number(store.get('rate', 1)) || 1,
    style: STYLES[savedStyle] && savedStyle !== 'studio' ? savedStyle : 'documentary',
    answers: store.get('answers', {}) || {},
    visited: new Set(store.get('visited', []) || []),
  };

  const CORRECT = { text: 'Correct.', para: -1, words: 1 };
  const WRONG = { text: 'Not quite.', para: -1, words: 2 };
  const explSeq = (s) => [state.answers[s.id] === s.answer ? CORRECT : WRONG, ...s.expl];
  let studioInfo = null;         // set once recorded narration has loaded
  const currentSeq = () => {
    const s = slides[state.index];
    return state.phase === 'explanation' ? explSeq(s) : s.chunks;
  };

  const style = () => STYLES[state.style];
  const speakRate = () => state.rate * style().rate;
  const voiceOpts = () => ({ rate: speakRate(), pitch: style().pitch, gapMs: style().sentenceGapMs, studio: !!style().studio, speed: state.rate });

  // A sentence's length: the recording's duration in studio style, otherwise a words-per-minute estimate.
  // `rate` is the viewer's speed setting; each style applies its own pacing on top.
  const chunkMs = (c, rate = state.rate) => (style().studio && c.audio ? c.audio.ms / rate : msFor(c.words, rate * style().rate));
  const seqMs = (chunks, n = chunks.length, rate = state.rate) =>
    chunks.slice(0, n).reduce((a, c) => a + chunkMs(c, rate), 0) + n * style().sentenceGapMs;

  function slideMs(s, rate = state.rate) {
    let ms = seqMs(s.chunks, s.chunks.length, rate) + style().slideGapMs;
    if (s.isPoll) ms += seqMs([WRONG, ...s.expl], undefined, rate) + POLL_ALLOWANCE_MS;
    return ms;
  }
  const totalMs = () => slides.reduce((a, s) => a + slideMs(s), 0);
  const startMs = (k) => slides.slice(0, k).reduce((a, s) => a + slideMs(s), 0);

  function withinSlideMs() {
    const s = slides[state.index];
    let t;
    if (state.phase === 'explanation') {
      t = seqMs(s.chunks) + POLL_ALLOWANCE_MS + seqMs(explSeq(s), state.chunk);
    } else if (state.phase === 'awaiting') {
      t = seqMs(s.chunks);
    } else if (state.phase === 'done') {
      return slideMs(s);
    } else {
      t = seqMs(s.chunks, state.chunk);
    }
    if (state.playing && state.chunk < currentSeq().length && state.phase !== 'awaiting') {
      t += Math.min(performance.now() - state.chunkStart, state.chunkMs);
    }
    return Math.min(t, slideMs(s));
  }

  /* ------------------------------------------------------------- narrator */

  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  const NOVELTY = /bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|albert|fred|junior|ralph|kathy|grandma|grandpa|rocko|sandy|shelley|reed|eddy|flo\b/i;

  function rankStandard(v) {
    let r = 0;
    if (/natural|neural/i.test(v.name)) r += 50;
    if (/google/i.test(v.name)) r += 20;
    if (/samantha|ava|allison|susan|zoe|serena|daniel/i.test(v.name)) r += 15;
    if (/online/i.test(v.name)) r += 10;
    if (/^en[-_]US/i.test(v.lang)) r += 8;
    else if (/^en[-_](GB|AU|IE|CA|NZ)/i.test(v.lang)) r += 5;
    if (NOVELTY.test(v.name)) r -= 100;
    return r;
  }

  // Documentary style favours deep male narration voices: Edge's natural voices first, then classic system voices.
  const DEEP_NATURAL = /\b(christopher|guy|davis|roger|eric|steffan|brian|andrew|tony|jason|ryan|thomas|william|liam)\b/i;
  const DEEP_CLASSIC = /\b(uk english male|daniel|david|mark|george|james|alex|aaron|arthur|oliver|male)\b/i;
  const FEMALE = /\b(aria|jenny|ava|emma|michelle|sonia|libby|maisie|natasha|clara|samantha|zira|susan|karen|moira|tessa|serena|allison|zoe|victoria|catherine|hazel|female|google us english)\b/i;

  function rankDocumentary(v) {
    let r = 0;
    if (/natural|neural/i.test(v.name)) r += 40;
    if (DEEP_NATURAL.test(v.name)) r += 35;
    else if (DEEP_CLASSIC.test(v.name)) r += 25;
    if (FEMALE.test(v.name)) r -= 30;
    if (/^en[-_]US/i.test(v.lang)) r += 6;
    else if (/^en[-_](GB|AU|IE|CA|NZ)/i.test(v.lang)) r += 5;
    if (NOVELTY.test(v.name)) r -= 100;
    return r;
  }

  const rankVoice = (v) => (state.style === 'standard' ? rankStandard(v) : rankDocumentary(v));

  const narrator = {
    voices: [],
    voice: null,
    enabled: store.get('voice-on', true) !== false,
    broken: false,              // set when speech reports success far too quickly, over and over
    suspicious: 0,
    token: 0,
    timer: 0,
    watchdog: 0,
    utterance: null,
    audio: null,                // reused for every recorded sentence, so mobile browsers keep it unlocked
    preloader: null,

    get canSpeak() { return !!synth && this.enabled && !this.broken && this.voices.length > 0 && !!this.voice; },

    say(chunk, { rate = 1, pitch = 1, gapMs = 0, studio = false, speed = 1 }, done) {
      this.stop();
      const token = ++this.token;
      const { text } = chunk;
      const recorded = studio && chunk.audio;
      const est = recorded ? chunk.audio.ms / speed : msFor(wordCount(text), rate);
      const finish = () => {
        if (token !== this.token) return;
        clearTimeout(this.watchdog);
        clearTimeout(this.timer);
        this.utterance = null;
        if (gapMs > 0) this.timer = setTimeout(() => { if (token === this.token) done(); }, gapMs);
        else done();
      };

      const timed = () => { if (token === this.token) this.timer = setTimeout(finish, est + 300); };

      if (recorded && this.enabled) {
        const a = this.audio || (this.audio = new Audio());
        a.onended = finish;
        a.onerror = timed;
        a.src = chunk.audio.src;
        a.defaultPlaybackRate = speed;
        a.playbackRate = speed;
        a.play().catch(timed);   // autoplay blocked or file missing: keep going on captions
        this.watchdog = setTimeout(finish, est * 1.5 + 4000);
        return;
      }

      if (!this.canSpeak) {
        timed();
        return;
      }

      const u = new SpeechSynthesisUtterance(speakable(text));
      u.voice = this.voice;
      u.lang = this.voice.lang;
      u.rate = rate;
      u.pitch = pitch;
      let started = 0;
      u.onstart = () => { started = performance.now(); };
      u.onend = () => {
        const took = performance.now() - (started || performance.now());
        // Some browsers "finish" instantly without speaking. Fall back to timed captions if that keeps happening.
        if (wordCount(text) > 5 && took < est * 0.25) {
          if (++this.suspicious >= 3) { this.broken = true; ui.voiceUnavailable('Speech isn’t working in this browser, so the session is running with timed captions.'); }
        } else {
          this.suspicious = 0;
        }
        finish();
      };
      u.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') return;
        finish();
      };
      this.utterance = u;   // keep a reference: Chrome can drop events for garbage-collected utterances
      const speak = () => { if (token === this.token) { synth.resume(); synth.speak(u); } };
      if (synth.speaking || synth.pending) setTimeout(speak, 80); else speak();
      this.watchdog = setTimeout(finish, est * 2.2 + 4000);
    },

    preload(src) {
      const p = this.preloader || (this.preloader = new Audio());
      p.preload = 'auto';
      if (!p.src.endsWith(src)) p.src = src;
    },

    stop() {
      this.token++;
      clearTimeout(this.timer);
      clearTimeout(this.watchdog);
      if (synth && (synth.speaking || synth.pending)) synth.cancel();
      if (this.audio) {
        this.audio.onended = null;
        this.audio.onerror = null;
        this.audio.pause();
      }
      this.utterance = null;
    },
  };

  const audible = () => narrator.enabled && ((style().studio && !!studioInfo) || narrator.canSpeak);

  function loadVoices() {
    if (!synth) return;
    const all = synth.getVoices();
    if (!all.length) return;
    narrator.voices = all;
    const saved = store.get(`voice-uri:${state.style}`, null);
    const english = all.filter((v) => /^en([-_]|$)/i.test(v.lang));
    narrator.voice = all.find((v) => v.voiceURI === saved)
      || english.slice().sort((a, b) => rankVoice(b) - rankVoice(a))[0]
      || all.find((v) => v.default) || all[0];
    ui.renderVoices();
  }

  /* ------------------------------------------------------------------- UI */

  const el = {
    app: $('#app'), stage: $('#stage'), deck: $('#deck'),
    chip: $('#moduleChip'), count: $('#slideCount'), status: $('#status'), statusText: $('#statusText'),
    caption: $('#captionText'), time: $('#time'), timeline: $('#timeline'), segs: $('#timelineSegs'),
    play: $('#btnPlay'), prev: $('#btnPrev'), next: $('#btnNext'),
    cc: $('#btnCC'), voice: $('#btnVoice'), panelBtn: $('#btnPanel'), full: $('#btnFull'),
    panel: $('#panel'), agenda: $('#agendaPanel'), transcript: $('#transcript'), transcriptTitle: $('#transcriptTitle'),
    styleSelect: $('#styleSelect'), voiceSelect: $('#voiceSelect'), rateSelect: $('#rateSelect'), testVoice: $('#btnTestVoice'), voiceHint: $('#voiceHint'),
    lobby: $('#lobby'), start: $('#btnStart'), resume: $('#btnResume'), lobbyAgenda: $('#lobbyAgenda'),
  };

  const ui = {
    status() {
      let st = 'idle', label = 'Ready';
      if (state.phase === 'done') { st = 'paused'; label = 'Session complete'; }
      else if (state.phase === 'awaiting') { st = 'waiting'; label = 'Waiting for your answer'; }
      else if (state.playing) { st = 'playing'; label = audible() ? 'Narrating' : 'Captions only'; }
      else if (el.lobby.hidden) { st = 'paused'; label = 'Paused'; }
      el.status.dataset.state = st;
      el.statusText.textContent = label;
      el.app.classList.toggle('is-playing', state.playing);
      el.play.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
    },

    caption(text) { el.caption.textContent = text || ''; },

    renderVoices() {
      const sel = el.voiceSelect;
      sel.innerHTML = '';
      if (!narrator.voices.length) {
        sel.append(new Option('No voices available', ''));
        sel.disabled = true;
        return;
      }
      sel.disabled = false;
      const english = narrator.voices.filter((v) => /^en([-_]|$)/i.test(v.lang)).sort((a, b) => rankVoice(b) - rankVoice(a));
      const others = narrator.voices.filter((v) => !english.includes(v));
      const add = (label, list) => {
        if (!list.length) return;
        const group = document.createElement('optgroup');
        group.label = label;
        for (const v of list) {
          const o = new Option(`${v.name} (${v.lang})`, v.voiceURI);
          o.selected = v === narrator.voice;
          group.append(o);
        }
        sel.append(group);
      };
      add('English', english);
      add('Other languages', others);
    },

    voiceUnavailable(message) {
      el.voiceHint.textContent = message;
      ui.status();
    },

    footers() {
      for (const s of slides) {
        const foot = document.createElement('div');
        foot.className = 'slide-foot';
        foot.innerHTML = `<span>PSADT v4 · Technician Training</span><span class="foot-credit">${CREDIT}</span><span>${s.i + 1} / ${slides.length}</span>`;
        s.el.append(foot);
      }
    },

    polls() {
      for (const s of slides.filter((x) => x.isPoll)) {
        $$('.options > li', s.el).forEach((li, oi) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'option';
          b.innerHTML = `<span class="letter">${'ABCDEF'[oi]}</span><span class="otext">${li.innerHTML}</span>`;
          b.addEventListener('click', () => answerPoll(s, oi));
          li.replaceChildren(b);
        });
        const result = document.createElement('div');
        result.className = 'poll-result';
        result.hidden = true;
        $('.options', s.el).after(result);
        ui.pollState(s);
      }
    },

    pollState(s) {
      const chosen = state.answers[s.id];
      const answered = chosen !== undefined;
      s.el.classList.toggle('has-result', answered);
      $$('.option', s.el).forEach((b, oi) => {
        b.disabled = answered;
        b.classList.toggle('is-correct', answered && oi === s.answer);
        b.classList.toggle('is-wrong', answered && oi === chosen && oi !== s.answer);
        b.classList.toggle('is-dim', answered && oi !== s.answer && oi !== chosen);
      });
      const result = $('.poll-result', s.el);
      if (!result) return;
      result.hidden = !answered;
      if (answered) {
        const correct = chosen === s.answer;
        result.classList.toggle('wrong', !correct);
        result.innerHTML = `<b>${correct ? 'Correct.' : 'Not quite.'}</b>${escapeHtml(s.expl.map((c) => c.text).join(' '))}`;
      }
    },

    agendas() {
      const counted = modules.filter((m) => m.num > 0);
      const modMs = (m) => m.slides.reduce((a, s) => a + slideMs(s), 0);
      const mins = (ms) => `${Math.max(1, Math.round(ms / 60000))} min`;

      const onSlide = $('[data-agenda]');
      if (onSlide) {
        onSlide.innerHTML = counted.map((m) => {
          const checks = m.slides.filter((s) => s.isPoll).length;
          return `<li><span class="n">${String(m.num).padStart(2, '0')}</span><span class="t">${escapeHtml(m.name)}${checks ? '<span class="q">+ knowledge check</span>' : ''}</span><span class="d">${mins(modMs(m))}</span></li>`;
        }).join('');
      }

      el.lobbyAgenda.innerHTML = counted.map((m) =>
        `<li><span class="n">${m.num}</span><span>${escapeHtml(m.name)}</span><span class="d">${mins(modMs(m))}</span></li>`).join('');

      el.agenda.innerHTML = modules.map((m) => `
        <li>
          <div class="ag-mod"><b>${m.num ? `${m.num}. ` : ''}${escapeHtml(m.name)}</b><span>${mins(modMs(m))}</span></div>
          <ol>${m.slides.map((s) => `
            <li><button type="button" class="ag-row${s.isPoll ? ' poll' : ''}" data-go="${s.i}">
              <span class="ag-mark"></span><span>${escapeHtml(s.title)}</span><span class="ag-t">${fmt(startMs(s.i))}</span>
            </button></li>`).join('')}
          </ol>
        </li>`).join('');

      const total = `${Math.round(totalMs() / 60000)} min`;
      $$('[data-total-time]').forEach((n) => { n.textContent = total; });
    },

    timeline() {
      el.segs.innerHTML = slides.map((s, k) => {
        const modStart = k > 0 && slides[k - 1].module !== s.module;
        return `<div class="seg${s.isPoll ? ' poll' : ''}${modStart ? ' mod-start' : ''}" style="flex-grow:${slideMs(s, 1).toFixed(0)}" title="${escapeHtml(`${s.i + 1}. ${s.title}`)}"><i></i></div>`;
      }).join('');
    },

    tick() {
      const total = totalMs();
      const elapsed = Math.min(startMs(state.index) + withinSlideMs(), total);
      el.time.textContent = `${fmt(elapsed)} / ${fmt(total)}`;
      const s = slides[state.index];
      const frac = Math.min(1, withinSlideMs() / slideMs(s));
      const fills = el.segs.children;
      for (let k = 0; k < fills.length; k++) {
        const w = k < state.index ? 100 : k > state.index ? 0 : frac * 100;
        fills[k].firstChild.style.width = `${w}%`;
      }
      el.timeline.setAttribute('aria-valuenow', String(Math.round((elapsed / total) * 100)));
      el.timeline.setAttribute('aria-valuetext', `${fmt(elapsed)} of ${fmt(total)}, slide ${state.index + 1}: ${s.title}`);
    },

    slideChrome() {
      const s = slides[state.index];
      el.chip.textContent = s.mod.num ? `Module ${s.mod.num} · ${s.module}` : s.module;
      el.count.textContent = `${s.i + 1} / ${slides.length}`;
      el.prev.disabled = s.i === 0;
      el.next.disabled = s.i === slides.length - 1;
      $$('.ag-row', el.agenda).forEach((row) => {
        const k = Number(row.dataset.go);
        row.classList.toggle('current', k === s.i);
        row.classList.toggle('visited', state.visited.has(slides[k].id));
        if (k === s.i) row.setAttribute('aria-current', 'step'); else row.removeAttribute('aria-current');
      });
      const current = $('.ag-row.current', el.agenda);
      if (current && !el.panel.hidden) current.scrollIntoView({ block: 'nearest' });
    },

    transcript() {
      const s = slides[state.index];
      el.transcriptTitle.textContent = `${s.i + 1}. ${s.title}`;
      const block = (chunks, active) => {
        const paras = [];
        chunks.forEach((c, k) => {
          const p = c.para < 0 ? 0 : c.para;
          (paras[p] ||= []).push(`<span class="sent${active && k === state.chunk ? ' now' : ''}">${escapeHtml(c.text)}</span>`);
        });
        return paras.map((p) => `<p>${p.join(' ')}</p>`).join('');
      };
      const narrating = state.phase === 'narration';
      let html = block(s.chunks, narrating && state.playing);
      if (s.isPoll && state.answers[s.id] !== undefined) {
        html += `<span class="expl-label">Answer</span>${block(explSeq(s), state.phase === 'explanation' && state.playing)}`;
      }
      el.transcript.innerHTML = html;
    },
  };

  /* -------------------------------------------------------------- playback */

  function go(i, { autoplay = state.playing } = {}) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    narrator.stop();
    clearTimeout(state.gapTimer);
    $$('.slide.is-active', el.deck).forEach((n) => n.classList.remove('is-active'));
    state.index = i;
    state.chunk = 0;
    state.phase = 'narration';
    const s = slides[i];
    s.el.classList.add('is-active');
    state.visited.add(s.id);
    store.set('visited', Array.from(state.visited));
    store.set('slide', s.id);
    try { history.replaceState(null, '', `#${s.id}`); } catch { /* sandboxed */ }
    ui.caption('');
    ui.slideChrome();
    state.playing = autoplay;
    if (autoplay) speakNext();
    else { ui.transcript(); ui.status(); }
    ui.tick();
  }

  function speakNext() {
    if (!state.playing) return;
    const seq = currentSeq();
    if (state.chunk >= seq.length) { endOfSequence(); return; }
    const c = seq[state.chunk];
    state.chunkStart = performance.now();
    state.chunkMs = chunkMs(c) + style().sentenceGapMs;
    ui.caption(c.text);
    ui.transcript();
    ui.status();
    if (style().studio) {
      const next = seq[state.chunk + 1] || slides[state.index + 1]?.chunks[0];
      if (next?.audio) narrator.preload(next.audio.src);
    }
    narrator.say(c, voiceOpts(), () => {
      state.chunk += 1;
      speakNext();
    });
  }

  function endOfSequence() {
    const s = slides[state.index];
    if (s.isPoll && state.phase === 'narration') {
      if (state.answers[s.id] !== undefined) {
        state.phase = 'explanation';
        state.chunk = 0;
        speakNext();
        return;
      }
      state.phase = 'awaiting';
      ui.caption('Pick an answer to continue.');
      ui.transcript();
      ui.status();
      return;
    }
    if (state.index >= slides.length - 1) {
      state.playing = false;
      state.phase = 'done';
      ui.transcript();
      ui.status();
      ui.tick();
      return;
    }
    state.gapTimer = setTimeout(() => go(state.index + 1, { autoplay: true }), style().slideGapMs);
  }

  function answerPoll(s, oi) {
    if (state.answers[s.id] !== undefined) return;
    state.answers[s.id] = oi;
    store.set('answers', state.answers);
    ui.pollState(s);
    if (state.index !== s.i) return;
    narrator.stop();
    state.phase = 'explanation';
    state.chunk = 0;
    if (state.playing) speakNext();
    else { ui.transcript(); ui.status(); }
  }

  function play() {
    if (state.playing) return;
    if (state.phase === 'done') { go(0, { autoplay: true }); return; }
    if (state.phase === 'awaiting') { state.phase = 'narration'; state.chunk = 0; }
    state.playing = true;
    speakNext();
    ui.status();
  }

  function pause() {
    state.playing = false;
    narrator.stop();
    clearTimeout(state.gapTimer);
    ui.transcript();
    ui.status();
    ui.tick();
  }

  const toggle = () => (state.playing ? pause() : play());

  // Restart the current sentence, e.g. after the voice or speed changes.
  function restartChunk() {
    if (!state.playing || state.phase === 'awaiting') return;
    narrator.stop();
    speakNext();
  }

  /* ------------------------------------------------------------- controls */

  function setCaptions(on) {
    el.app.classList.toggle('cc-off', !on);
    el.cc.setAttribute('aria-pressed', String(on));
    store.set('cc', on);
  }
  function setVoice(on) {
    narrator.enabled = on;
    el.voice.setAttribute('aria-pressed', String(on));
    store.set('voice-on', on);
    restartChunk();
    ui.status();
  }
  function setPanel(on) {
    el.app.classList.toggle('panel-off', !on);
    el.panelBtn.setAttribute('aria-pressed', String(on));
    store.set('panel', on);
  }
  function showTab(name) {
    $$('.tab', el.panel).forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    $$('.tab-body', el.panel).forEach((b) => { b.hidden = b.dataset.body !== name; });
  }
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.app.requestFullscreen?.().catch(() => {});
  }

  el.play.addEventListener('click', toggle);
  el.prev.addEventListener('click', () => go(state.index - 1));
  el.next.addEventListener('click', () => go(state.index + 1));
  el.cc.addEventListener('click', () => setCaptions(el.app.classList.contains('cc-off')));
  el.voice.addEventListener('click', () => setVoice(!narrator.enabled));
  el.panelBtn.addEventListener('click', () => setPanel(el.app.classList.contains('panel-off')));
  el.full.addEventListener('click', toggleFull);
  if (!document.fullscreenEnabled) el.full.hidden = true;

  el.timeline.addEventListener('click', (e) => {
    const rect = el.timeline.getBoundingClientRect();
    const target = ((e.clientX - rect.left) / rect.width) * totalMs();
    let acc = 0;
    for (const s of slides) {
      acc += slideMs(s);
      if (target < acc) { go(s.i); return; }
    }
    go(slides.length - 1);
  });

  el.agenda.addEventListener('click', (e) => {
    const row = e.target.closest('[data-go]');
    if (row) go(Number(row.dataset.go));
  });
  $$('.tab', el.panel).forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  el.voiceSelect.addEventListener('change', () => {
    narrator.voice = narrator.voices.find((v) => v.voiceURI === el.voiceSelect.value) || narrator.voice;
    narrator.broken = false;
    narrator.suspicious = 0;
    store.set(`voice-uri:${state.style}`, el.voiceSelect.value);
    restartChunk();
  });
  function setStyle(name, { persist = true } = {}) {
    state.style = STYLES[name] && (name !== 'studio' || studioInfo) ? name : 'documentary';
    el.styleSelect.value = state.style;
    if (persist) store.set('style', state.style);
    loadVoices();          // each style remembers its own voice, or picks its preferred one
    ui.timeline();
    ui.agendas();
    ui.slideChrome();
    restartChunk();
    ui.tick();
    ui.status();
  }
  el.styleSelect.value = state.style;
  el.styleSelect.addEventListener('change', () => setStyle(el.styleSelect.value));

  el.rateSelect.value = String(state.rate);
  if (el.rateSelect.value !== String(state.rate)) { state.rate = 1; el.rateSelect.value = '1'; }
  el.rateSelect.addEventListener('change', () => {
    state.rate = Number(el.rateSelect.value) || 1;
    store.set('rate', state.rate);
    ui.agendas();
    ui.slideChrome();
    restartChunk();
    ui.tick();
  });
  el.testVoice.addEventListener('click', () => {
    if (state.playing) pause();
    const sample = style().studio && slides[0].chunks[0].audio
      ? slides[0].chunks[0]
      : { text: 'This is how the narration will sound during the session.', words: 10 };
    narrator.say(sample, voiceOpts(), () => {});
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="restart"]')) {
      state.answers = {};
      store.set('answers', {});
      slides.filter((s) => s.isPoll).forEach(ui.pollState);
      go(0, { autoplay: true });
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = e.target.tagName;
    if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (!el.lobby.hidden) return;
    switch (e.key) {
      case ' ':
      case 'k':
      case 'K':
        e.preventDefault();
        if (tag === 'BUTTON') e.target.blur();
        toggle();
        break;
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        go(state.index + 1);
        break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        go(state.index - 1);
        break;
      case 'Home': go(0); break;
      case 'End': go(slides.length - 1); break;
      case 'c': case 'C': setCaptions(el.app.classList.contains('cc-off')); break;
      case 'n': case 'N': setVoice(!narrator.enabled); break;
      case 't': case 'T': setPanel(el.app.classList.contains('panel-off')); break;
      case 'f': case 'F': toggleFull(); break;
      default:
    }
  });

  window.addEventListener('hashchange', () => {
    const k = slides.findIndex((s) => `#${s.id}` === location.hash);
    if (k >= 0 && k !== state.index) go(k);
  });

  /* --------------------------------------------------------- syntax colour */

  const PS_TOKEN = /(<#[\s\S]*?#>|#.*)|('(?:[^']|'')*'|"(?:[^"`]|`.)*")|(\$\{[^}]+\}|\$\w+(?::\w+)?)|(\b[A-Z][A-Za-z]+-[A-Z][A-Za-z0-9]+(?:\.exe)?\b)|((?:^|[\s(])-[A-Za-z]\w*)|\b(function|param|if|else|elseif|foreach|try|catch|finally|return|process|begin|end)\b|(\b\d[\d.]*\b)/gm;
  const span = (cls, text) => `<span class="tk-${cls}">${escapeHtml(text)}</span>`;

  function highlightPS(src) {
    let out = '';
    let last = 0;
    for (const m of src.matchAll(PS_TOKEN)) {
      const [tok, comment, str, variable, fn, param, keyword, num] = m;
      out += escapeHtml(src.slice(last, m.index));
      if (comment) out += span('c', comment);
      else if (str) out += span('s', str);
      else if (variable) out += span('v', variable);
      else if (fn) out += span('f', fn);
      else if (param) {
        const lead = param.charAt(0) === '-' ? '' : param.charAt(0);
        out += escapeHtml(lead) + span('p', param.slice(lead.length));
      } else if (keyword) out += span('k', keyword);
      else if (num) out += span('n', num);
      last = m.index + tok.length;
    }
    return out + escapeHtml(src.slice(last));
  }

  /* ----------------------------------------------------------------- boot */

  $$('code[data-lang="ps"]').forEach((code) => { code.innerHTML = highlightPS(code.textContent); });
  ui.footers();
  ui.polls();
  ui.timeline();
  ui.agendas();

  const fit = () => el.deck.style.setProperty('--scale', String(el.stage.clientWidth / 1280));
  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(el.stage);
  window.addEventListener('resize', fit);
  fit();

  setCaptions(store.get('cc', true) !== false);
  el.voice.setAttribute('aria-pressed', String(narrator.enabled));
  setPanel(store.get('panel', window.innerWidth >= 1080) !== false);
  showTab('agenda');

  if (synth) {
    loadVoices();
    synth.addEventListener?.('voiceschanged', loadVoices);
    if (!synth.addEventListener) synth.onvoiceschanged = loadVoices;
  }
  setTimeout(() => {
    if (!narrator.voices.length) {
      ui.renderVoices();
      ui.voiceUnavailable('This browser didn’t provide any speech voices, so the session will run with timed captions. Edge or Chrome on Windows have the best voices.');
    }
  }, 2500);

  /* ------------------------------------------------- recorded narration */

  // scripts/render-audio.mjs writes one clip per sentence plus a manifest. A clip is only used when its
  // sentence still matches the script, so edited narration falls back to the browser voice until re-rendered.
  function attachRecordings(manifest) {
    let matched = 0;
    const attach = (chunks, recs = []) => chunks.forEach((c, i) => {
      const r = recs[i];
      if (r && r.text === c.text && r.file && r.ms > 0) {
        c.audio = { src: `assets/audio/clips/${r.file}`, ms: r.ms };
        matched++;
      }
    });
    for (const s of slides) {
      const m = manifest.slides?.[s.id];
      attach(s.chunks, m?.chunks);
      if (s.isPoll) attach(s.expl, m?.expl);
    }
    attach([CORRECT], [manifest.common?.correct]);
    attach([WRONG], [manifest.common?.wrong]);
    return matched;
  }

  fetch('assets/audio/manifest.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((manifest) => {
      if (!manifest || !attachRecordings(manifest)) return;
      studioInfo = { voice: manifest.voice?.name || 'ElevenLabs' };
      el.styleSelect.prepend(new Option(`Studio voice (${studioInfo.voice})`, 'studio'));
      el.voiceHint.textContent = `Studio voice plays the recorded narration (${studioInfo.voice}). The browser voice settings only apply to the other styles. Presenting remotely? Share computer audio as well as your screen.`;
      if (wantStudio) setStyle('studio', { persist: false });
      else el.styleSelect.value = state.style;
    })
    .catch(() => { /* no recordings: browser voices only */ });

  // Start position: an explicit #slide link wins, otherwise offer to resume.
  const fromHash = slides.findIndex((s) => `#${s.id}` === location.hash);
  const savedIndex = slides.findIndex((s) => s.id === store.get('slide', null));
  const resumeAt = fromHash > 0 ? fromHash : savedIndex > 0 && savedIndex < slides.length - 1 ? savedIndex : -1;
  go(resumeAt > 0 ? resumeAt : 0, { autoplay: false });
  if (resumeAt > 0) {
    el.resume.hidden = false;
    el.resume.textContent = `Resume at “${slides[resumeAt].title}”`;
  }

  const begin = (k) => {
    el.lobby.hidden = true;
    go(k, { autoplay: true });
    el.play.focus({ preventScroll: true });
  };
  el.start.addEventListener('click', () => begin(0));
  el.resume.addEventListener('click', () => begin(resumeAt));
  el.start.focus({ preventScroll: true });

  setInterval(() => ui.tick(), 250);
})();
