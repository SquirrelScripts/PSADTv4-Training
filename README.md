# PSADT v4 Technician Training

A narrated, self-paced training session on **PSAppDeployToolkit v4** for technicians who build and deploy packages. It runs about 20 minutes across six modules with three knowledge checks, and it's a static site with no build step.

- **Narration** uses the browser's built-in speech voices (Edge has the most natural ones), with captions and a live transcript.
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
transcript.md                   narration script, generated from index.html
scripts/build-transcript.mjs    transcript generator
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

## Credits

**PSAppDeployToolkit** is free, open-source software built and maintained by the **PSAppDeployToolkit Team**: Sean Lillis, Dan Cunningham, Muhammad Mashwani, Mitch Richters and Dan Gough, together with its community of contributors. It's licensed under the [GNU LGPL-3.0](https://github.com/PSAppDeployToolkit/PSAppDeployToolkit/blob/main/COPYING.Lesser).

- Project: <https://github.com/PSAppDeployToolkit/PSAppDeployToolkit>
- Documentation: <https://psappdeploytoolkit.com>
- Community: [Discourse](https://discourse.psappdeploytoolkit.com/) · [r/psadt](https://reddit.com/r/psadt) · [Discord](https://discord.com/channels/618712310185197588/627204361545842688)

This repository is independent training material. It isn't produced, affiliated with or endorsed by the PSAppDeployToolkit Team.
