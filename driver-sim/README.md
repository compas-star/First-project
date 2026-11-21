# Mother Road — Arizona Driver (prototype, update 2)

First playable slice of a bigger idea: a relaxed **USA driving-jobs simulator** set in the 1990s
(bus, taxi, truck... across different states). This prototype is the **intercity bus** job.

You are a Painted Desert Coach Lines driver in **1994**, running Route 66 westbound across Arizona:
**Flagstaff → Williams → Ash Fork → Seligman → Peach Springs → Kingman**.
You leave at 15:30 and drive into the sunset; the last leg is at night.

## Update 17: NO SIGNAL instead of a broken player

- Some YouTube videos can't be played outside YouTube, or are private or gone. Instead of YouTube's "Video unavailable" box, the TV now shows full static and NO SIGNAL, and a message says why (for example "THIS TAPE WON'T PLAY HERE - ITS OWNER ONLY ALLOWS IT ON YOUTUBE").
- If YouTube doesn't answer at all within 10 seconds (no internet), the TV shows NO SIGNAL too, and picks the picture up if the video turns up later.
- While a tape loads you see static, not YouTube's black loading screen.

## Update 16: road splits you can actually take

- Fixed: at a split you sometimes steered for your road and still carried on along the old one (Williams, Prescott, Ash Fork and others). If you started steering once you could see the roads coming apart, the other road pulled away faster than you could cross to it, and with a road on the left you were even switched back to the road you were leaving.
- The roads now peel apart more gradually, giving about twice as long to cross once you see them part.
- Once you're off the edge of your road and still steering toward the next one, you're on that one. You're never switched back to a road you're steering away from.
- Lamps, trees and rocks in the wedge between two roads don't stop you while you can still change road.

## Update 15: no more roundabouts

- Every place where three or more roads meet is now a road split: the roads peel apart under signs and you steer onto yours (the box lists them and stars the one toward your destination). That includes Seligman, Ash Fork, Williams, Valle, Cameron and Wickenburg, which had roundabouts.
- Where two roads meet, the road simply bends. At dead ends (Lake Havasu City, Holbrook, Page) the road curves round and takes you back the way you came.

## Update 14: souvenirs and a bigger TV

- **Souvenirs:** deliver a load or finish a bus route in a town, eat there, or sleep in a motel there, and you pick up something from its tourist shop: first a postcard, then a photo, then a little figure. Each town has its own: a dinosaur from Holbrook, a mule from the Grand Canyon, a snow globe from Flagstaff, a steam engine from Williams, the London Bridge from Lake Havasu, a Route 66 shield from Kingman and Seligman, and so on. Truck stops out on the highway don't sell any.
- Postcards and photos are taped along the top of the windshield, figures stand on the left of the dashboard, and the newest figure sits on top of the TV. They're saved with your career.
- The TV is bigger (the bus has a slightly smaller one, so it doesn't fill the door-side window).
- With a tape in, the road-choice box moves up above the TV and hints move left of it, so the video never hides them.

## Update 13: VHS TV, map tips, radio keeps playing

- **VHS TV:** a little TV/VCR combo sits on the dashboard. Press V (or VHS) and paste a YouTube link: it plays on the TV with a worn-tape look (colour bleed, soft picture, scanlines, static, a rolling tracking band and the VCR's green PLAY). The game waits while you're typing. Press V again to change or eject the tape. N mutes it with the rest of the sound. The video is the real YouTube player (youtube-nocookie.com) laid over the TV's screen, so it needs an internet connection, and some videos can't be played outside YouTube.
- **The paper map (M)** shows a list of the controls.
- **The radio keeps playing** while the game is paused or the map is open.

## Update 12: wider roundabouts, wipers behind the dashboard

- Roundabouts are wider again (240 segments round instead of 168), with a gentler swing into the circle, so there's more room between exits to pick yours. The exit hint stays up a little longer to match.
- The wipers are drawn behind the dashboard, so their pivots no longer sit on top of the dash or the clipboard.
- Dust storms die down once you leave the dry country, and snow turns to rain down low, even when you picked the weather yourself with F. F only offers weather the landscape around you can have.

## Update 11: nothing in the way at roundabout exits

- The big green SERVICES sign no longer stands at the mouth of roundabout exits, where holding right a moment too long ran you into it. It's further down the road and further from the edge.
- Buildings around town roundabouts stay clear of the exit roads (the bigger circles made exits peel off more slowly).
- Steering, turning onto roads and crashes work exactly as in Update 10.

## Update 10: weather, night lights and sound

- **Weather:** clear, overcast, rain, thunderstorms, dust storms in the desert and snow up in the pines around Flagstaff. It changes by itself every hour or two of game time and fades in slowly. Press F (or WEATHER) to change it yourself.
- Rain streaks past you and beads on the windshield, and the wipers sweep the drops away. Storms bring lightning that lights up the whole landscape, with thunder a few seconds later. Snow builds up on the ground. Dust storms turn the air brown and cut how far you can see.
- Wet roads are darker and reflect every street lamp and tail light. They also make your brakes a little weaker. Headlights switch on by themselves in heavy weather.
- **Headlights** are now a soft pool of light that follows the road over hills and round bends, instead of a hard triangle. Other cars' lights and lit windows glow softly.
- **Night sky:** stars that turn with you, the Milky Way and a moon.
- **Sound:** rain on the roof, single drops, thunder, wind that rises with speed and in storms, the hiss of wet tyres, a whoosh when cars pass, the wipers, crickets at night and birds in the morning.

## Update 9: bigger roundabouts

- Roundabouts are now more than twice as wide, so going round feels like a sweeping curve, not a carousel. The swing into the circle is gentler too.
- The "YOUR EXIT" hint stays up a little longer, because exits peel away from the wider circle more gradually.

## Update 8: trucking and real internet radio

- New **TRUCK** tab in the hub: Desert Freight posts five loads a day at every town's yard (lumber, US mail, fresh eggs, TV sets and so on), each with a destination, weight, pay and a delivery deadline.
- Hook up the trailer and pick your own route: road splits, roundabout exits, side streets and service roads all work as with the rental car. Stop anywhere in the destination town and press Space to deliver.
- Pay: +15% if you're on time, less the later you are (down to 30% of the pay). Crashes damage the load (fragile loads more), and the load's condition cuts the pay too. Diesel is on the company card.
- The truck has its own cab, a trip computer showing the load, destination, deadline and load condition, and warnings at 2 h, 1 h and 30 min left. Heavier loads pull away slower. Every vehicle now has a crawl gear for steep hills.
- **Radio (R):** after OFF and the two built-in stations, the dial has real internet radio. The game asks the free, public Radio Browser directory (radio-browser.info) for the most-played live stations tagged trucker, truckers or trucking, plus US classic country, country and Americana, and plays them. Only secure (https) streams are used. If the directory or a stream can't be reached, the display says NO NET RADIO or NO SIGNAL and the built-in stations still work. Station names come from the directory and change over time.

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
| Radio (built-in and online stations) | R | RADIO |
| Change the weather | F | WEATHER |
| Put a tape in the TV (YouTube link) | V | VHS |
| Headlights | L | LIGHTS |
| Horn, mute, pause | H, N, P | HORN, SOUND, II |

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
| `backgrounds.js` | Parallax mountains per biome, sky, sun, moon, stars and Milky Way by time of day |
| `souvenirs.js` | Postcards, photos and figures from the towns you visit, and where they go in the cab |
| `vhs.js` | The dashboard TV: YouTube player with a VHS filter, the tape dialog |
| `weather.js` | Weather changes, rain, snow and dust, drops on the glass, wipers, lightning |
| `cockpit.js` | Dashboard, gauges, wheel, hands, mirror, LCD |
| `sprites.js` | Procedural pixel-art sprites |
| `game.js` | Bus physics, stops, boarding, fuel, comfort, report |
| `traffic.js`, `audio.js`, `input.js`, `font.js`, `main.js` | Traffic, sound, controls, bitmap font, loop and screens |

## Ideas for next steps
- Persistent career: money, reputation, unlocking routes and other states.
- More bus routes (Texas panhandle, Rockies in snow, Pacific coast), weather, longer real-time mode.
- New jobs on the same engine: NYC taxi (city grid, fares), Minnesota truck (heavy loads, winter).
- Rest stops, CB radio chatter, random roadside events.
