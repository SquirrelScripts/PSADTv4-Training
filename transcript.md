# PSAppDeployToolkit v4: Technician Training

## Narration script

Estimated runtime **19:12** at 165 words per minute, including pauses and time to answer the knowledge checks. 31 slides, 3,003 narrated words. Timecodes are estimates.

> PSAppDeployToolkit is free, open-source software built and maintained by the PSAppDeployToolkit Team (Sean Lillis, Dan Cunningham, Muhammad Mashwani, Mitch Richters and Dan Gough) and its community contributors, licensed under the LGPL-3.0. This is independent training material, not an official PSAppDeployToolkit Team product. Facts were verified against the PSAppDeployToolkit 4.1.8 source.

**Recording notes:** say “PSADT” as letters (P-S-A-D-T). In function names, spell out ADT, so `Show-ADTInstallationWelcome` is “Show A-D-T Installation Welcome”. Read 3010 as “thirty-ten” and 1602 as “sixteen-oh-two”. At each knowledge check, pause for the audience, then read the answer.

_Generated from `index.html` by `npm run transcript`. Edit the narration there, not here._

---

## Welcome

### 1. Welcome · `00:00`

Welcome to this technician training session on PSAppDeployToolkit version 4, or PSADT for short. Over the next twenty minutes we’ll cover how a v4 package is put together, what happens when it runs, the functions you’ll use every day, how to configure it, and how to move your v3 scripts across without getting burned. Everything here was checked against the 4.1.8 release, the current stable build.

Before we start, credit where it’s due. PSADT is free, open-source software built by the PSAppDeployToolkit Team: Sean Lillis, Dan Cunningham, Muhammad Mashwani, Mitch Richters and Dan Gough, along with a lot of community contributors. This session is independent training. The toolkit is their work.

### 2. Agenda · `00:41`

Here’s the plan. Module one covers the foundations: what changed in v4 and how a package is laid out. Module two walks through the deployment script and the session lifecycle. Module three is the function toolbox. Module four covers configuration, strings and extensions. Module five is migrating from v3, including the gotchas. We’ll finish with shipping to Intune or ConfigMgr. There are three quick knowledge checks along the way, and playback waits for your answer.

---

## Foundations

### 3. v4 at a glance · `01:09`

So what actually changed? In v3, the toolkit was a big script you dot-sourced into every package. In v4, it’s a proper PowerShell module called PSAppDeployToolkit, published to the PowerShell Gallery, with a compiled engine underneath for sessions, logging, dialogs and process handling. Every public function now follows one pattern: verb, dash, ADT, noun. The dialogs default to a modern Fluent interface, and the classic look is still there if you want it. Version 4.1 added the big one: you no longer need ServiceUI to show dialogs from a System deployment. And there’s a v3 compatibility layer, so old scripts can run while you migrate.

### 4. Getting the toolkit · `01:49`

Getting started takes two commands. Install the module from the PowerShell Gallery on your packaging workstation, then run New-ADTTemplate to scaffold a package folder. The template copies in everything the package needs, including its own copy of the module, so target devices don’t need anything installed. If you’d rather not use the Gallery, the same templates are attached to every release on GitHub. Requirements are light: Windows 10 or 11, Windows PowerShell 5.1 or later, and .NET Framework 4.7.2 or later.

### 5. Anatomy of a package · `02:19`

Here’s what New-ADTTemplate gives you. Two launchers at the top: the exe and the script. The script is where your work goes. Installers go in Files, and anything extra, like config files or licence keys, goes in SupportFiles. Assets holds the logos and banner used in dialogs. Config holds config.psd1 for toolkit settings, and Strings holds the dialog text in twenty-seven languages. Then there’s the PSAppDeployToolkit folder itself. That’s the module, and it’s digitally signed. Don’t edit anything inside it. Customise the copies of Config, Strings and Assets in your package instead. If you need your own functions, the Extensions module is where they live.

---

## Script & session lifecycle

### 6. The deployment script · `02:58`

Open Invoke-AppDeployToolkit.ps1 and you’ll find five regions. At the top is a parameter block: deployment type, deploy mode, and a few switches. Next is the adtSession hashtable, which describes your app. Then come three functions: Install, Uninstall and Repair. Each one is split into pre, main and post phases, and that’s where your code goes. At the bottom are Initialization, which imports the module and opens a session, and Invocation, which runs the right function and closes the session. As a rule, you edit the hashtable and the three functions. Leave the bottom two regions alone.

### 7. The adtSession hashtable · `03:34`

The adtSession hashtable is your package’s identity card. Vendor, name, version, architecture, language and revision combine into the install name, which also names the log file. The exit code lists tell the toolkit which installer codes mean success and which mean a reboot is needed. AppProcessesToClose, new in 4.1, lists the processes your app runs. Install, Uninstall and Repair all reuse it, so you define it once. One neat trick: if you leave AppName empty, you get Zero-Config MSI. Drop a single MSI into Files, optionally with a transform, and the toolkit installs it with no code at all. Set AppName and that behaviour switches off.

### 8. The session lifecycle · `04:13`

Here’s what happens when the script runs. First it imports the module, preferring the copy bundled in the package and checking its GUID and minimum version. Then Open-ADTSession starts logging, works out the deploy mode, and swaps your hashtable for a live session object. Any extension modules load next. Then the script calls the function matching the deployment type, so Install-ADTDeployment for an install, which runs pre, main and post. Finally, Close-ADTSession writes the summary and hands the exit code back to Intune or ConfigMgr. Two failure paths are worth memorising. If the module can’t load or the session won’t open, you get exit code 60008. If anything throws inside your deployment, the catch block logs it and exits with 60001.

### 9. Pre, main, post · `04:58`

Here’s a realistic install. In the pre-install phase, we show the welcome dialog. It asks the user to close Widget, allows three deferrals, checks disk space and keeps the prompt on screen. Then we show the progress dialog and remove an old EXE-based version. In the install phase, one line installs the MSI with a transform. A bare file name resolves against the Files folder, and the toolkit writes a verbose MSI log for you. Post-install, we set a policy key to turn off auto-update. Notice the InstallPhase lines. They don’t change behaviour, but they tag every log entry, so you can see exactly which phase failed.

### 10. Deployment types and deploy modes · `05:38`

Deployment type picks the function: Install, Uninstall or Repair, with Install as the default. Deploy mode controls the dialogs. Interactive always shows them, NonInteractive shows progress without asking anything, and Silent shows nothing at all. The default in 4.1 is Auto, and it’s worth understanding. Auto goes silent if the device is still in the out-of-box experience or Autopilot’s Enrollment Status Page, if nobody is logged on, or if you listed processes to close and none of them are running. Otherwise it’s interactive. If you need the dialogs regardless, pass DeployMode Interactive. For troubleshooting, the exe takes /Debug to show console output, and /Core to run on PowerShell 7.

### 11. Exit codes · `06:18`

Exit codes are how your deployment tool knows what happened, so learn these. Zero is success. 3010 means success, but a reboot is needed. In 4.1 the toolkit passes it through by default, and the SuppressRebootPassThru switch masks it to zero. 1602 means the user deferred. The team chose it because Intune and ConfigMgr already understand it as “user cancelled”. Older 4.0 packages used 60012. 1618 means a dialog timed out. In the toolkit’s own range, 60001 is an unhandled error in your script, and 60008 means the module never loaded. If you need custom codes, use 69000 to 69999 in the script, or 70000 and up in extensions.

### 12. Knowledge check 1 · `06:59`

**Question:** Your package sets AppProcessesToClose = @('widget'). It runs with the default deploy mode, a user is logged on, and widget.exe isn’t running. What does the user see?

- A. The welcome dialog, asking them to close Widget
- B. Nothing: Auto mode switches to Silent **(correct)**
- C. An error dialog, then exit code 60001
- D. A deferral prompt with three deferrals

**Narration:**

Knowledge check. Your package lists widget in AppProcessesToClose. It runs with the default deploy mode, a user is logged on, and Widget isn’t running. What does the user see? Pick an answer to continue.

**Answer:**

The answer is B: nothing. In Auto mode, if you listed processes to close and none of them are running, there’s nothing to ask the user, so the toolkit switches to Silent. If you always want dialogs, set DeployMode to Interactive, or add the NoProcessDetection switch when the session opens.

---

## The ADT function set

### 13. Finding your way around · `07:41`

The module exports 134 public functions, and you don’t need to memorise them. They all follow verb, dash, ADT, noun, so the verb tells you the family. Show is for dialogs. Start runs processes. Get, Set and Remove read and change state. Test checks conditions, like whether the device is on battery or PowerPoint is presenting. Get-Command filters by verb, Get-Help with Full gives you every parameter and example, and Show-ADTHelpConsole opens a searchable help browser. Let’s walk through the families you’ll use most.

### 14. The Show- family · `08:13`

The Show family is the user experience. Show-ADTInstallationWelcome is the workhorse. It asks users to close apps, offers deferrals, checks disk space, and with BlockExecution it stops them relaunching the app mid-install. Show-ADTInstallationProgress puts up the installing window, and you can update its status text as you go. Show-ADTInstallationPrompt shows a message with buttons, and in 4.1 it can collect text input. Show-ADTInstallationRestartPrompt handles reboot countdowns. And here’s the big 4.1 change. When you deploy as System, the toolkit shows dialogs through a separate process in the user’s own session. ServiceUI isn’t needed anymore, and the team strongly recommends dropping it, because it works by manipulating security tokens.

### 15. The Start- family · `08:53`

The Start family runs installers. Start-ADTMsiProcess handles MSI installs, uninstalls, patches and repairs. Give it a bare file name and it looks in your Files folder. It also writes a verbose MSI log next to the toolkit log without you asking. To uninstall by product code, pass ProductCode instead of FilePath. Start-ADTProcess is for everything else. Tell it which exit codes mean success and which mean reboot, and it’ll fail the deployment on anything else. 4.1 added useful switches for awkward installers. WaitForChildProcesses handles setups that hand off and exit early, and Timeout handles setups that hang. When you need something to run as the logged-on user, use Start-ADTProcessAsUser.

### 16. Finding and removing apps · `09:33`

Get-ADTApplication searches the uninstall registry keys and returns rich objects with name, version, publisher, product code and architecture. Uninstall-ADTApplication takes the same filters and removes what matches. MSIs go through msiexec, and EXEs use their registered uninstall string plus any arguments you pass. Name matching is “contains” by default, which is broad. Java matches a lot of things. So tighten it with NameMatch Exact, Wildcard or Regex, filter by application type, or add a FilterScript. Best habit: run Get-ADTApplication with your filters first. It’s a free dry run. When the results look right, pipe them straight in.

### 17. Files, registry, per-user · `10:09`

Most packages need a few tweaks after install. Copy-ADTFile and Remove-ADTFile handle files, and the session gives you DirFiles and DirSupportFiles, so you never hard-code package paths. Set-ADTRegistryKey writes values, and creates the key if it’s missing. Per-user settings are the classic trap. Your deployment runs as System, so plain HKCU is System’s own hive. Invoke-ADTAllUsersRegistryAction loads every user’s hive, including the Default User, and runs your script block once per profile. Use $_.SID to target each one. For files, Copy-ADTFileToUserProfiles does the same job. And if a setting must apply at each user’s next logon, Set-ADTActiveSetup has you covered.

### 18. Logging · `10:47`

When something breaks, the log is where you’ll look first. By default the toolkit logs to the Logs\Software folder under Windows. The file name is built from the install name and deployment type, so each app and action gets its own log, with MSI logs alongside. The format is CMTrace, so errors and warnings highlight properly in CMTrace or OneTrace. Add your own entries with Write-ADTLogEntry. Severity one is information, two is a warning, and three is an error. Log the decisions your script makes, not just the failures. The technician reading it at two in the morning might be you.

### 19. Knowledge check 2 · `11:24`

**Question:** Your deployment runs as SYSTEM. You need a registry value in HKCU for every user on the device. Which approach works?

- A. Set-ADTRegistryKey -LiteralPath 'HKCU\Software\Contoso' …
- B. Start-ADTProcessAsUser -FilePath 'reg.exe' -ArgumentList 'add HKCU\Software\Contoso …'
- C. Invoke-ADTAllUsersRegistryAction { Set-ADTRegistryKey -SID $_.SID -LiteralPath 'HKCU\Software\Contoso' … } **(correct)**
- D. Write it to HKLM instead. Apps check both.

**Narration:**

Knowledge check two. Your deployment runs as System, and you need a registry value in HKCU for every user on the device. Which approach works? Pick an answer to continue.

**Answer:**

The answer is C. As System, plain HKCU writes to System’s own hive. Running reg.exe as the user only reaches whoever is logged on right now. Invoke-ADTAllUsersRegistryAction loads each profile’s hive, including the Default User for future accounts, and passes each profile in as $_. Note that v3’s $UserProfile variable is gone.

---

## Config, strings & extensions

### 20. config.psd1 · `12:06`

Config.psd1 controls how the toolkit behaves, and it’s split into four sections: Assets, MSI, Toolkit and UI. A few settings are worth knowing. CompanyName puts your organisation’s name in dialog subtitles. LogPath and LogStyle control where logs go and what format they use. DialogStyle switches between Fluent and Classic dialogs, and FluentAccentColor sets your brand colour. DefaultTimeout is fifty-five minutes, deliberately, so dialogs time out before Intune’s sixty-minute limit kills the install. Read any value at runtime with Get-ADTConfig. And new in 4.1, the toolkit ships ADMX templates. Group Policy settings override config.psd1, so you can set standards once for the whole organisation.

### 21. Strings and assets · `12:44`

Strings.psd1 holds every piece of text users see, grouped by dialog: close apps, progress, restart, installation prompts, balloon tips, blocked apps and disk space. Translations live in language subfolders, and the toolkit picks the detected display language automatically. Use LanguageOverride in config if you need to force one. If you reword a message, update the translations you actually support too. For branding, the Assets folder holds the logo, a separate dark-mode logo, and a banner used by the Classic dialogs. Point the Assets section of config at your files and every dialog picks them up.

### 22. Extensions · `13:20`

When you write the same helper twice, it belongs in an extension. The template ships a PSAppDeployToolkit.Extensions module next to the script, and the invocation code automatically imports any folder whose name starts with PSAppDeployToolkit and a dot. So your organisation’s shared functions live there, outside the signed module, and survive toolkit upgrades. Use your own prefix so you never collide with ADT names, log through Write-ADTLogEntry so everything lands in the same log, and keep custom exit codes in the 70000 range. This replaces v3’s AppDeployToolkitExtensions.ps1.

---

## Migrating from v3

### 23. Two migration paths · `13:52`

You’ve got two ways to move v3 packages. Compatibility mode gets you running fast. New-ADTTemplate with Version 3 creates the v3 layout, with the old launcher and an AppDeployToolkit folder, running on the v4 engine. Bring your existing Deploy-Application script, and it mostly works as-is. Every old function call goes through a wrapper that logs a warning naming its replacement. Treat that log as your to-do list. It’s a bridge, not a destination. The real goal is a native v4 package. Start a fresh template, move the app details into the adtSession hashtable, move your code into the three deployment functions, then rename. The next slide shows the renames you’ll hit most.

### 24. Function renames · `14:34`

Most renames follow one rule: add ADT after the dash. Write-Log becomes Write-ADTLogEntry, and Show-InstallationWelcome becomes Show-ADTInstallationWelcome. The Execute family became the Start family, so Execute-MSI is now Start-ADTMsiProcess and Execute-Process is Start-ADTProcess. A few changed more than that. Exit-Script is now Close-ADTSession, Remove-MSIApplications is Uninstall-ADTApplication, and Get-InstalledApplication is Get-ADTApplication. Set-PinnedApplication is gone completely, because Windows stopped supporting what it did.

### 25. Variables and parameters · `14:57`

Variables changed too. The loose script variables from v3 now live on the session object. So dirFiles becomes adtSession.DirFiles, and the same goes for the app details, InstallPhase, DeploymentType and DeployMode. Parameters were renamed to match PowerShell conventions. Path is now FilePath, Parameters is ArgumentList, and AddParameters is AdditionalArgumentList. CloseApps, which took one comma-separated string, is now CloseProcesses, which takes a proper array. That array can include hashtables with friendly descriptions. And ContinueOnError is gone. v4 uses standard PowerShell error handling, which brings us to the first gotcha.

### 26. Gotchas · `15:30`

Six gotchas catch v3 veterans. One: errors stop the script. The template sets the error action preference to Stop and turns on strict mode, so a failure that v3 logged and skipped now fails the deployment with 60001. Decide deliberately where to tolerate errors. Two: Auto mode can go silent, as we saw in the first knowledge check. Three: drop ServiceUI from your Intune commands, because 4.1 doesn’t need it. Four: exit codes moved. Deferral is 1602 now, and 3010 passes through by default, so check your reporting. Five: MSIs run fully quiet by default, and dialogs no longer minimise other windows unless you ask. Six: every package carries its own copy of the module. Updating the module on your workstation doesn’t change packages you’ve already built, so upgrade them deliberately.

### 27. Knowledge check 3 · `16:18`

**Question:** What’s the v4 equivalent of this v3 line? Execute-Process -Path 'setup.exe' -Parameters '/S' -ContinueOnError $true

- A. Start-ADTProcess -Path 'setup.exe' -Parameters '/S' -ContinueOnError $true
- B. Execute-ADTProcess -FilePath 'setup.exe' -ArgumentList '/S'
- C. Start-Process -FilePath 'setup.exe' -ArgumentList '/S'
- D. Start-ADTProcess -FilePath 'setup.exe' -ArgumentList '/S' -ErrorAction SilentlyContinue **(correct)**

**Narration:**

Final knowledge check. A v3 script runs Execute-Process with Path set to setup.exe, Parameters set to /S, and ContinueOnError set to true. Which line is the v4 equivalent? Pick an answer to continue.

**Answer:**

The answer is D. Execute became Start, with ADT after the dash. Path became FilePath, and Parameters became ArgumentList. ContinueOnError no longer exists, so you use the standard ErrorAction parameter to tolerate a failure. Option C is plain Start-Process. It would run, but you’d lose the toolkit’s logging and exit code handling.

---

## Ship it

### 28. Intune and ConfigMgr · `17:01`

Shipping it. For Intune, wrap the whole package folder with the Win32 Content Prep Tool, using Invoke-AppDeployToolkit.exe as the setup file. The install command is the exe with DeploymentType Install, and uninstall is the same with Uninstall. Set the install behaviour to System, and leave ServiceUI out. Intune’s default return codes already cover success, the two reboot codes, and 1618 for retry. Add 1602 so deferrals are reported the way you want. For ConfigMgr, use the same command lines, and you no longer need to tick “allow users to interact”. In both cases, use a real detection rule, and test as System before anything goes to production.

### 29. Technician checklist · `17:41`

Here’s the checklist to run before any package leaves your hands. Scaffold with New-ADTTemplate and leave the module alone. Fill in the session details, including processes to close. Put code in the right phase. Declare exit codes for every EXE. Handle per-user settings properly. Test install, uninstall and repair, both interactive and silent, running as System. Then read the log, because a clean exit code with a log full of warnings isn’t a clean package. And make sure ServiceUI is nowhere in sight.

### 30. Credit where it’s due · `18:12`

Before we wrap up, credit where it’s due. PSAppDeployToolkit is built and maintained by the PSAppDeployToolkit Team. Sean Lillis, Dan Cunningham and Muhammad Mashwani carried it through the v3 years, and Mitch Richters and Dan Gough joined them for the v4 rebuild. A community of contributors writes fixes, translates the dialog text and answers questions on the forums. It’s free, open-source software under the LGPL, with a release history going back to 2013. If it saves you time, and it will, say thanks. Star the repository, report bugs properly, contribute a fix, or help someone else on the forum or Discord.

### 31. Session complete · `18:49`

That’s the session. You now know how a v4 package is built, how the session runs from import to exit code, which functions do the heavy lifting, how to configure the toolkit, and how to migrate v3 packages without surprises. The full transcript is linked on this slide, along with the official documentation. Thanks for your time, and happy packaging.
