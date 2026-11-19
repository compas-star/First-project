# Mother Road — Route 66 Bus Driver (prototype)

First playable slice of a bigger idea: a relaxed **USA driving-jobs simulator** set in the 1990s
(bus, taxi, truck... across different states). This prototype is the **intercity bus** job.

You are a Painted Desert Coach Lines driver in **1994**, running Route 66 westbound across Arizona:
**Flagstaff → Williams → Ash Fork → Seligman → Peach Springs → Kingman**.
You leave at 15:30 and drive into the sunset; the last leg is at night.

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
| Open doors / refuel | Space | big pulsing button |
| Cruise control | C | CRUISE |
| Radio (2 stations) | R | RADIO |
| Horn, lights, mute, pause | H, L, M, P | HORN, SOUND, II |

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
