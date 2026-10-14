# Riverbound — Three-Stage Prototype

> **Development Build / Work in Progress**
>
> Riverbound is actively being developed. Gameplay balance, visuals, stage layouts, blessings, and saved progress may change. This repository is published for playtesting and feedback, not as a finished release.

A three-stage 2D side-scrolling runner prototype built entirely with native HTML, CSS, JavaScript, and Canvas. Stage 1 and Stage 3 use the reduced foreground-canopy frame, while Stage 2 uses a dedicated moonlit waterfall scene, the supplied G01–G09 gameplay atlas, and four dedicated night platforms shuffled in repeating bags. Short, medium, long, and extra-long floating platforms are separated by jumpable gaps, with river, obstacle, collectible, vine, firefly, animated hero, HUD icon, illustrated menu artwork, and matching Jaguar, Macaw, or Dart Frog altar art grounded at each stage endpoint. Each altar begins in its damaged state and changes to the restored artwork after a successful offering. The hero switches between run, slide, jump, and double-jump frames while retaining a separate gameplay collision box. The supplied cinematic nature soundtrack restarts and fades in at the beginning of each playable stage, then fades out at its altar or ending; standard UI buttons use the supplied wooden notification sound. Opening an altar also plays a short matching Frog, Macaw, or Jaguar call. The game uses no backend or third-party dependencies.

Stages 2 and 3 also spawn intermittent falling rocks. Each rock enters from above with a rolling-rock sound, drops onto the platform ahead, and briefly remains as a jump obstacle before falling out of view. Continuing to run collides with it, while an early jump clears it. A successful damage event plays the damage sound and uses the normal one-hit/invulnerability and Frog shield rules; spawning pauses outside active gameplay or near the altar. The former landing-column warning and River Gate marker have been removed.

Taking life damage briefly tints the guardian red before the existing invulnerability blink. Losing the final heart pauses the guardian at the exact reached position on a fallen pose scaled to the normal character art, then opens the run-ended screen. The HUD music switch fades the stage soundtrack on or off without muting UI, hazard, damage, or animal-god effects, and remembers the preference after refresh.

## Run

Double-click `index.html` to play. No installation is required. Alternatively, run `node dev-server.mjs` and open `http://127.0.0.1:4173`.

To download a playtest copy from GitHub, choose **Code → Download ZIP**, extract the archive, and open `index.html` in a modern browser. All required artwork and code are included; no account, backend, or installation is needed.

For level tuning, open `http://127.0.0.1:4173/?stage=2` or `?stage=3` to start those stages directly. Add `&qa=autoplay` for the automated route check, `&speed=64` to accelerate that automated check, or `&debug=colliders` to show collision rectangles. Press `B` at any time to toggle collision rectangles manually.

## Controls

- Opening dialogue: `Space`, `Enter`, or left click completes the current typewriter line, then advances on the next input
- `Space` / `↑`: Jump; hold for a higher jump and tap for a short jump
- `↓` / `Ctrl`: Hold to crouch and release to stand
- `Esc`: Pause / resume
- On-screen pause button: Click or tap the pause icon in the upper-right HUD; it changes to a play icon while paused
- `R`: Restart after failure or completion
- Altar: Click with the mouse, or press `Enter` to offer and `1` / `2` to choose a low or high blessing
- Mobile / touch: Use the **Crouch** and **Jump** buttons at the bottom of the screen; both support press and release

## Flow

Illustrated cover → six-page environmental CG prologue → six-line character dialogue → Stage 1 runner and altar → illustrated Stage 2 start screen → Stage 2 and second altar → illustrated Stage 3 start screen → Stage 3: The Broken River → final spirit dwelling → phased completion and Return to Village. Click anywhere on the cover (or press Enter/Space) to begin, then use click, Enter, or Space to advance each CG page and dialogue line. The environmental prologue appears only once per page session, even if the journey is restarted. The supplied intro track loops across the cover, CG prologue, and opening dialogue, then stops as Stage 1 gameplay begins. Click each later-stage illustrated START button or press Enter/Space to enter gameplay immediately. Choosing or skipping an offering ends the current stage immediately; there is no post-altar running segment.

Each altar calculates prices from that stage's River Breath output: low blessings cost 50%, rounded up, and high blessings cost exactly 4 more River Breath than the low tier. Offerings are deducted from the current Breath balance and added to that animal god's cumulative progress for the current journey. Every god unlocks its high blessing at 30 cumulative offered Breath. If nothing useful is affordable, the altar continues directly to the next stage or final result.

- Dart Frog: one-run Venom Cloak, or journey-long Undying Venom Cloak with a 20-second renewable obstacle shield.
- Jaguar: three one-run air-jump uses, or a journey-long air jump restored after each landing.
- Macaw: a 10-second wide magnet, or a journey-long short-range magnet that heals one life for every 50 Breath collected.

The blessing choice cards use each god's dedicated low- and high-tier artwork. Three god emblems in the upper-left HUD remain dim until their blessing is active: temporary blessings glow aqua and journey-long blessings glow gold, with the matching tier icon overlaid.

Each altar now opens with the matching animal god's weakened dialogue. Dialogue uses the illustrated animal-god panel, a typewriter effect, and `Space`, `Enter`, or left click to complete and advance each page. A successful paid offering and blessing award replaces that god's damaged altar with its matching restored artwork, holds the unobstructed restored view for about two seconds, and then triggers the same god's restored dialogue; unavailable or skipped offerings continue without the restored response. Gameplay and altar controls remain locked during the reveal and while dialogue is open.

During a full three-stage journey, encountered animal-god IDs are carried forward between stages. Each stage excludes every guardian already seen, so Frog, Jaguar, and Macaw each appear exactly once in a randomized order.

Blessings, per-god offering totals, and Macaw healing progress carry between stages in the same journey. Entering Stage 1, returning after completion, or losing all three life points clears all of them (including the versioned `riverbound-progress-v1` localStorage record), returns to the Stage 1 title screen, and leaves all three god emblems dim.

With the current physics and auto-run speed, the measured gameplay time is about 29 seconds for Stage 1, 34 seconds for Stage 2, and 37 seconds for Stage 3. Story, altar choice, pause, and result-screen reading time are not included.

Blessing prices, journey-upgrade thresholds, shield timing, second-jump power, magnet radii, magnet duration, and healing interval are centralized in `BLESSING_CONFIG` near the top of `game.js`. Each stage has separate `stageOne...`, `stageTwo...`, or `stageThree...` platform, obstacle, collectible, and tutorial arrays. All three stages share the existing physics, collision, rendering, UI, and asset loaders.

The code is organized into level data, input and state, player physics and collision, collectibles and damage, Canvas rendering, and DOM UI. The game loop uses `requestAnimationFrame`, with frame time capped to prevent large jumps after switching browser tabs.
