# Mother Road — Arizona Driver (prototype, update 2)

First playable slice of a bigger idea: a relaxed **USA driving-jobs simulator** set in the 1990s
(bus, taxi, truck... across different states). This prototype is the **intercity bus** job.

You are a Painted Desert Coach Lines driver in **1994**, running Route 66 westbound across Arizona:
**Flagstaff → Williams → Ash Fork → Seligman → Peach Springs → Kingman**.
You leave at 15:30 and drive into the sunset; the last leg is at night.

## Update 7: roundabout exits and side streets you can see

- Roundabouts: each exit is now a real road leaving the circle on the right. You see it coming, with a green sign first. To take it, steer right onto it (a hint says "YOUR EXIT – KEEP RIGHT" at the right one). Miss it and you go round again.
- Side streets in towns and cities: at a crossing, the streets to the left and right are drawn as roads you can turn into. Slow down and steer into one.
- Stop sign at the end of a side street: both ways (left and right) are drawn. Steer onto the one you want.
- You only turn off if you're steering that way, so drifting in your lane never sends you down a side street by accident.

## Update 6: service roads

- Gas stations, diners and motels now sit on their own one-way service road instead of on the highway's shoulder. The service road leaves on the right, runs past the businesses, and merges back into the same highway.
- Every town has one on the way out, with gas, a diner and a motel. The long empty highways have one at the truck stop.
- A green SERVICES sign and a striped marker show where it starts. Keep right onto it (a hint pops up if you're low on gas, hungry or tired), stop in the painted bay next to the pump, diner or motel, and press Space. Then keep driving and it brings you back to the highway.
- Highway traffic stays on the highway, and you can't stop for gas or food on the highway itself any more.

## Update 5: roads that split in front of you

- Highway interchanges (I-40/AZ-95, Cordes Jct) and the big cities with several roads out (Kingman, Williams, Flagstaff, Prescott) no longer use a menu. The road visibly splits into one road per destination, and they peel apart in front of you.
- Steer onto the road you want. Whichever road you are on when they separate is the one you take. No buttons.
- Signs tell you which is which: a green advance sign about a mile and a half before, an overhead sign bridge with one panel and arrow per road, a striped marker where the roads part, and each road's route shield after it.
- The panel on the right lists the roads from left to right, highlights the one you are on, and stars the one that gets you to your destination. If you're on the wrong one, a hint says which way to steer.
- The bus sees the same splits but keeps to its route.

## Update 4: diners, motels and a driver who gets tired
- **Hunger and tiredness** (FOOD / REST meters, top left) drop as game time passes and are saved with your career.
  Tired drivers yawn, their eyelids start to close and their hands drift on the wheel; hungry drivers tire faster.
- **Diners** on the way out of every town and at highway truck stops: pull into the lot and press Space to eat ($6.45, 35 min).
- **Motels** on the way into every town and at truck stops: sleep until 07:00 (or 8 hours) for $24.95. Car trips only.
- **Coffee** at any gas pump once your tank is full (75 cents) for a quick pick-me-up.
- The hub's REST tab shows your meters and has the local diner and motel.
- Fixed: the gas pumps in towns offered to return the rental car instead of refuelling.

## Update 3: real driving
- **Reverse gear**: stop, then hold the brake to back up (the bus beeps). Press gas at a standstill to go forward.
- **U-turns** (car): slow below 15 mph and press U (or U-TURN) for a hairpin turn back the way you came.
- **Roundabouts** at highway junctions, small-town forks and dead ends: circle as long as you like and
  steer right at your exit. The junction panel lists the exits and stars the one toward your destination.
- **Side streets** in towns and cities: slow down at a cross street and steer hard left or right. Residential
  streets end in a turning circle and bring you back to a stop sign, where you steer left or right.
- **Every road looks the same in both directions**, so turning around brings you back past the same scenery.
- **Returning the rental**: stop anywhere in a town to drop the car off there; no more missed yellow boxes.
  A bus that overshoots its stop can back up into it.

## Update 2: the region map
- **Paper road map of northern & central Arizona (1994)**: 23 real towns (Kingman, Flagstaff, Phoenix,
  Grand Canyon, Sedona, Page, Needles...) on the real highways (I-40, Route 66, US-93, I-17, US-89, AZ-64...).
- **The road you drive is generated from the map**: curves follow the real road's turns, the landscape
  follows the real terrain, towns are where they are on the map, and the sun sits where it should for your heading.
- **Hub**: bus jobs from each depot (17 daily routes), U-Drive car rental to any town, motel, ledger of your money.
- **Rental car**: its own cab, faster, you pay for gas. Where the road splits, steer onto the road you want (Update 5).
- **Paper map in the vehicle**: press M (or MAP) to unfold it and see where you are.
- 24-hour day/night cycle; progress is saved in the browser.

## Play
It's a static web page with no build step and no dependencies:

```bash
cd driver-sim
python3 -m http.server 8000   # then open http://localhost:8000
```
(ES modules need http://, opening index.html as a file won't work.)

| Action | Keyboard | Touch |
|---|---|---|
| Gas / brake | ↑ / ↓ (W / S) | GAS / BRAKE pedals |
| Steer | ← / → (A / D) | ◀ ▶ buttons, or drag on the steering wheel |
| Reverse | hold ↓ at a standstill | hold BRAKE at a standstill |
| U-turn (car) | U | U-TURN |
| Pick a road where the road splits | Steer onto it | Steer onto it |
| Paper map | M or Tab | MAP |
| Open doors / refuel | Space | big pulsing button |
| Cruise control | C | CRUISE |
| Radio (2 stations) | R | RADIO |
| Horn, lights, mute, pause | H, L, N, P | HORN, SOUND, II |

## What's in the prototype
- First-person cab view only: pixel-art dashboard, big steering wheel, hairy forearms in a flannel shirt,
  fuzzy dice, a coffee cup, a rear-view mirror that shows your passengers.
- 480×270 pixel rendering (16-bit era look: dithered gradients, shaded sprites) with a classic pseudo-3D road.
- A 90s coach cab: split windshield, folding entry door, bus mirrors on arms, six-gauge cluster (speed, RPM, air, oil, fuel, temp), toggle switches, CB radio, desk fan, wristwatch, bugs on the glass.
- Five landscapes along the way: ponderosa forest → juniper woodland → golden high plains
  (fences, cows, windmills) → red-rock mesas → Mojave desert (Joshua trees, cacti).
- Small towns with motels, diners, stores, and bus shelters with people waiting. Gas stations at $1.09/gal.
- Time of day: afternoon, golden hour, sunset, dusk, then a starry night with headlights and neon.
- 90s traffic: sedans, wagons, pickups, vans, semis, RVs. Pass slow vehicles; oncoming cars honk and swerve.
- Relaxed rules: a generous schedule, passenger comfort (smooth driving), fuel management
  (a friendly trucker rescues you if you run dry), and a shift report with stars and a paycheck.
- All art and sound are generated in code (WebAudio engine, horn, doors, generative AM radio).

## Code map (`js/`)
| File | What it does |
|---|---|
| `config.js` | Resolution, road and world constants, time compression (1 real s = 20 game s) |
| `track.js` | Route, towns, schedule, biomes, procedural road and scenery placement |
| `render.js` | Pseudo-3D road and sprite renderer, fog, night lighting |
| `backgrounds.js` | Parallax mountains per biome, sky and sun by time of day |
| `cockpit.js` | Dashboard, gauges, wheel, hands, mirror, LCD |
| `sprites.js` | Procedural pixel-art sprites |
| `game.js` | Bus physics, stops, boarding, fuel, comfort, report |
| `traffic.js`, `audio.js`, `input.js`, `font.js`, `main.js` | Traffic, sound, controls, bitmap font, loop and screens |

## Ideas for next steps
- Persistent career: money, reputation, unlocking routes and other states.
- More bus routes (Texas panhandle, Rockies in snow, Pacific coast), weather, longer real-time mode.
- New jobs on the same engine: NYC taxi (city grid, fares), Minnesota truck (heavy loads, winter).
- Rest stops, CB radio chatter, random roadside events.
