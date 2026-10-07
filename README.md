# PSADT v4 Technician Training

A narrated, self-paced training session on **PSAppDeployToolkit v4** for technicians who build and deploy packages. It runs about 20 minutes (a little over 21 at documentary pacing) across six modules with three knowledge checks, and it's a static site with no build step.

- **Narration** uses the browser's built-in speech voices, with captions and a live transcript. The default **Documentary narrator** style picks the deepest voice available, lowers the pitch and slows the pacing; **Standard** is switchable in the Audio tab. Edge on Windows has the best voices.
- **Studio narration** (optional): render the script with ElevenLabs and the player plays the recording instead. See [Studio narration](#studio-narration-elevenlabs).
- **Knowledge checks** pause playback until the viewer answers, then explain the answer.
- **Presenting remotely?** Run it full screen (`F`) and share computer audio along with your screen.

## Content

| # | Module | Covers |
|---|--------|--------|
| 1 | Foundations | What changed in v4, getting the toolkit, package anatomy |
| 2 | Script & session lifecycle | `Invoke-AppDeployToolkit.ps1`, `$adtSession`, Open/Close-ADTSession, deploy modes, exit codes |
| 3 | The ADT function set | `Show-`, `Start-`, Get/Uninstall-ADTApplication, files, registry, per-user settings, logging |
| 4 | Config, strings & extensions | `config.psd1`, Group Policy (ADMX), `strings.psd1`, assets, the Extensions module |
| 5 | Migrating from v3 | Compatibility mode vs native v4, function/variable/parameter renames, six gotchas |
| 6 | Ship it | Intune and ConfigMgr, technician checklist, credits |

Every technical claim was checked against the PSAppDeployToolkit **4.1.8** source (the current stable release at the time of writing).

## Files

```
index.html                      slides, narration and knowledge checks
assets/player.css               player and slide styles
assets/player.js                playback engine (speech, captions, timeline, polls)
assets/speech.js                sentence splitting and pronunciation, shared with the scripts
assets/audio/                   studio narration clips and manifest (after npm run audio)
transcript.md                   narration script, generated from index.html
scripts/build-transcript.mjs    transcript generator
scripts/render-audio.mjs        ElevenLabs renderer
scripts/slides.mjs              slide parsing shared by the scripts
vercel.json                     static hosting config
```

## Editing

Each slide is a `<section class="slide">` in `index.html`. The spoken script lives in its `<aside class="narration">`. Knowledge checks also carry `data-answer` (zero-based) and an `<aside class="explanation">`.

After changing narration, regenerate the transcript:

```sh
npm run transcript   # rewrite transcript.md
npm run check        # fail if transcript.md is stale; syntax-check the player
```

To preview locally, open `index.html` in a browser, or serve the folder with any static server.

## Studio narration (ElevenLabs)

`npm run audio` renders every sentence of the script with ElevenLabs into `assets/audio/`. When those files are present, the player adds a **Studio voice** option and uses it by default. Captions stay in sync because each sentence is its own clip. Any sentence edited since the last render falls back to the browser voice until you render again.

1. **Network:** allow `api.elevenlabs.io` (in a Claude Code cloud environment: environment settings → Network access → Allowed domains).
2. **Key:** set `ELEVENLABS_API_KEY` as an environment variable or secret. Restrict the key to Text to Speech plus read access to Voices. Never commit it.
3. **Voice:** run `npm run audio -- --list-voices` and set `ELEVENLABS_VOICE_ID`. If a Voice Library voice is missing from the list, add it to My Voices first. Only use voices you're licensed to use; no clones of real people without their consent.
4. **Cost check:** `npm run audio -- --dry-run` prints the character count (about 20,000 for the full script; ElevenLabs bills credits per character, and the rate depends on the model).
5. **Render:** `npm run audio`, then commit `assets/audio/` and deploy.

After editing narration, run it again: only changed sentences are re-rendered, and clips that are no longer used are deleted. Set `ELEVENLABS_MODEL` to change the model (default `eleven_multilingual_v2`).

## Credits

**PSAppDeployToolkit** is free, open-source software built and maintained by the **PSAppDeployToolkit Team**: Sean Lillis, Dan Cunningham, Muhammad Mashwani, Mitch Richters and Dan Gough, together with its community of contributors. It's licensed under the [GNU LGPL-3.0](https://github.com/PSAppDeployToolkit/PSAppDeployToolkit/blob/main/COPYING.Lesser).

- Project: <https://github.com/PSAppDeployToolkit/PSAppDeployToolkit>
- Documentation: <https://psappdeploytoolkit.com>
- Community: [Discourse](https://discourse.psappdeploytoolkit.com/) · [r/psadt](https://reddit.com/r/psadt) · [Discord](https://discord.com/channels/618712310185197588/627204361545842688)

This repository is independent training material. It isn't produced, affiliated with or endorsed by the PSAppDeployToolkit Team.
