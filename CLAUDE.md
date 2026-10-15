# CLAUDE.md

Main project: `fighting-game/`, a 3D browser fighting game where two AI fighters
fight. (`habit-tracker/` is an older, unrelated app.)

## Working with the user

- Reply in **Russian**, short and plain. The user writes from a phone.
- The user tests on the phone through the published artifact:
  **https://claude.ai/artifact/76iyaUsfYfiU3CgtixpMqG**. After each meaningful change:
  `npm run build` in `fighting-game/`, then republish `fighting-game/dist/artifact.html`
  to that URL (Artifact tool, `url` = the link above).
- Branch: `claude/fighting-game-customization-lgblty`. Commit and push after each step.
  No PR unless asked.
- The user wants to be shown results, not asked many questions. Be honest about what
  did not work or was not checked.

## Vision (from the user)

- Two AI fighters (later up to 4-5). Full customization: height, weight, strength,
  speed, technique, style, powers; later a move editor and proper characters.
- From realistic street fights to demigods who fly and wreck the arena.
- **Speed mechanic (core):** body speed = own time runs faster; perception (mind)
  speed = notices attacks sooner and decides more often. Default view slows time to
  the fastest fighter's perception; "real time" mode shows the fast one as a blur.
- Physics and ragdoll are the base of the fun. Falls must be varied and interesting.
- The user rejected: a UFC-style kinematic/animation rewrite (said "забей про юфс").

## Architecture (`fighting-game/src`)

Vite + TypeScript + three.js + Rapier (`@dimforge/rapier3d-compat`, WASM inlined).
`npm run build` makes `dist/index.html` (single file) and `dist/artifact.html`.

- `sim.ts`: fight loop. World time vs fighter local time (`dl = h * bodySpeed`).
  Actions, hits (`checkStrike` geometric fist/foot contact, `resolveHit`), knockdowns,
  powers, crates. `Fighter` holds all per-fighter state.
- `physics.ts`: 11-body active ragdoll. Standing: each part steered to its world
  orientation in the target pose (external PD, own inertia: stable), scaled by
  `stability`; fallen: weak joint-relative PD (`tone`). Hover spring + walk force on
  pelvis/chest. Soft joint limits (hinge elbows/knees, cones elsewhere). IK solvers.
- `feet.ts`: planted feet with friction-like anchor, stepping, capture-point balance
  (`measureBalance`), leg IK from where the hips should be.
- `pose.ts`: target pose per moment (stance by style, strike keyframes, dazed sway,
  fall poses: fencing/fold/tuck/catch, on-floor writhing).
- `strikes.ts`: aimed punches and kicks: paths (straight/hook/upper/swing/over,
  teep/round/low/back) to the enemy's real head/body/leg via IK.
- `moves.ts`: 22 MMA strikes as data (torso keyframes + hit window + path), combo
  table `FOLLOW`, named poses `POSES`.
- `disciplines.ts`: styles (MMA, boxing, Muay Thai, kickboxing, karate, street):
  move weights, stance, range.
- `ai.ts`: `react()` reflexes (parry/counter/dash/dodge/block with perception delay),
  `think()` tactics (range, lunges, combos, feints, footwork intent).
- `brain.ts`: game plan (outbox/pressure/counter/legs/body/survive/finish) and memory
  of the opponent (what lands, how he reacts). Memory lives for one fight only.
- `powers.ts`: parry, dash, shockwave, stone skin, regeneration.
- `view.ts`: rendering, afterimages, effects, auto-framing camera, KO slow-mo zoom.
- `main.ts`: HUD, time scale ("eyes"), setup sheet, presets.

## Testing (no phone needed)

- Headless sims: `fighting-game/tools/run.sh <script> [args]` (bundles with esbuild):
  `tech "0,1,2" 4` fight stats per preset (winners, duration, hits by zone, thoughts),
  `push` push recovery, `getup` fall and rise, `aim` strike speed on a static target,
  `falls` fall types and part speeds, `plans` time spent in each plan.
- Visual: `node tools/strip.cjs <presetIndex> <waitMs>` in Playwright (Chromium at
  `/opt/pw-browsers`, global playwright) writes `s0..s23.png` frames; tile them with PIL
  and look. Screenshots cannot show motion; say so when reporting.
- Targets that worked well: equal fighters ~25-40 s fights, no runaway draws; fast
  fighters must not fall on their own; parts should not exceed ~20 m/s at body speed 1.

## Lessons learned

- Fully internal muscle torques (reaction on parent/legs) made the ragdoll explode.
  Keep external per-part PD with own inertia; make falls happen via `stability`.
- Strong braking (walk force) and strong foot anchors turn fighters into statues.
- Capture point must count a foot in the air at its landing spot, and its lead must be
  divided by body speed, otherwise single support or fast fighters look like falling.
- Damage grows with sqrt of impulse; impulse per hit is capped (~3 m/s whole-body,
  more with strength) and spread through the trunk, or bodies fly.

## Next steps (planned with the user)

1. **Evolution / training:** run thousands of headless fights, evolve the AI weights
   (plan scores, eagerness, move weights) per fighter; fighters "train" a style.
2. **Memory across fights:** persist what a fighter learned (localStorage, by name).
3. **Lookahead where mind = depth:** faster perception simulates more options ahead.
4. Known issues: rare support-shin velocity spike during cross/bodykick (IK flip?);
   no sweeps as a technique; no southpaw; no grappling; crates are the only props.
5. Later from the vision: move editor, 3-5 fighters, flight and arena destruction for
   demigods, proper character models and customization.
