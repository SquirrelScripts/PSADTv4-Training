/* PSADT v4 Technician Training: shared speech helpers.
   Loaded by the player in the browser and by scripts/render-audio.mjs in Node, so recorded audio
   and on-screen captions split the script into exactly the same sentences. */
(function (root) {
  'use strict';

  const wordCount = (text) => (text.match(/\S+/g) || []).length;

  // Sentence-sized chunks keep each utterance short, which avoids Chrome cutting off long speech.
  function splitSentences(text) {
    const marked = text.replace(/\s+/g, ' ').trim().replace(/([.!?…])\s+(?=["“'(A-Z0-9$/])/g, '$1\u0000');
    const out = [];
    for (const part of marked.split('\u0000')) {
      if (wordCount(part) <= 34) { out.push(part); continue; }
      const mid = part.length / 2;
      let best = -1;
      for (const m of part.matchAll(/[,;:] /g)) {
        if (best < 0 || Math.abs(m.index - mid) < Math.abs(best - mid)) best = m.index;
      }
      if (best > 0) out.push(part.slice(0, best + 1), part.slice(best + 2));
      else out.push(part);
    }
    return out.filter(Boolean);
  }

  function toChunks(paragraphs) {
    return paragraphs.flatMap((text, para) =>
      splitSentences(text).map((sentence) => ({ text: sentence, para, words: wordCount(sentence) })));
  }

  // Captions show the script as written; the voice gets a pronunciation-friendly version.
  const LEXICON = [
    [/PSAppDeployToolkit\.Extensions/g, 'P S App Deploy Toolkit dot Extensions'],
    [/PSAppDeployToolkit/g, 'P S App Deploy Toolkit'],
    [/\bPSADT\b/g, 'P S A D T'],
    [/\badtSession\b/g, 'A D T session'],
    [/ConfigMgr/g, 'Config Manager'],
    [/CMTrace/g, 'C M Trace'],
    [/OneTrace/g, 'One Trace'],
    [/ServiceUI/g, 'Service U I'],
    [/\bADMX\b/g, 'A D M X'],
    [/\bHKCU\b/g, 'H K C U'],
    [/\bHKLM\b/g, 'H K L M'],
    [/\bLGPL\b/g, 'L G P L'],
    [/\bUI\b/g, 'U I'],
    [/MSIApplications/g, 'M S I Applications'],
    [/\bMSIs\b/g, 'M S I files'],
    [/\bEXEs\b/g, 'E X E files'],
    [/\bMSI\b/g, 'M S I'],
    [/\bEXE\b/g, 'E X E'],
    [/msiexec/gi, 'M S I exec'],
    [/reg\.exe/g, 'reg dot exe'],
    [/\.psd1\b/g, ' dot P S D 1'],
    [/\.psm1\b/g, ' dot P S M 1'],
    [/\.ps1\b/g, ' dot P S 1'],
    [/\.exe\b/g, ' dot exe'],
    [/\.msi\b/g, ' dot M S I'],
    [/\bGitHub\b/g, 'Git Hub'],
    [/\$_\.SID\b/g, 'dollar underscore dot S I D'],
    [/\$_/g, 'dollar underscore'],
    [/\$(\w)/g, 'dollar $1'],
    [/(^|\s)\/([A-Za-z]+)\b/g, '$1slash $2'],
    [/\\/g, ', '],
    [/\b3010\b/g, 'thirty ten'],
    [/\b1602\b/g, 'sixteen oh two'],
    [/\b1618\b/g, 'sixteen eighteen'],
    [/\b1641\b/g, 'sixteen forty-one'],
    [/\b60001\b/g, 'sixty thousand and one'],
    [/\b60008\b/g, 'sixty thousand and eight'],
    [/\b60012\b/g, 'sixty thousand and twelve'],
    [/\b69000\b/g, 'sixty-nine thousand'],
    [/\b69999\b/g, 'sixty-nine thousand, nine hundred and ninety-nine'],
    [/\b70000\b/g, 'seventy thousand'],
    [/\bv(\d)\b/g, 'version $1'],
    [/(\d)\.(\d)/g, '$1 point $2'],
    [/(\d)\.(\d)/g, '$1 point $2'],
    [/-ADT/g, ' A D T '],
    [/\bADT\b/g, 'A D T'],
    [/([a-z])([A-Z])/g, '$1 $2'],
    [/\bMsi\b/g, 'M S I'],
    [/\bMsp\b/g, 'M S P'],
    [/(\w)\.(\w)/g, '$1 dot $2'],
    [/(\w)-(?=\w)/g, '$1 '],
  ];
  const speakable = (text) => LEXICON.reduce((t, [re, sub]) => t.replace(re, sub), text);

  root.PSADT_SPEECH = { wordCount, splitSentences, toChunks, speakable };
})(typeof window !== 'undefined' ? window : globalThis);
