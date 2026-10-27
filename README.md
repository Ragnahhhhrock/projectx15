# Project X-15

A desktop browser flight simulator of the X-15 research flights: captive carry under the NB-52, drop, XLR99 ignition and boost, ballistic apex, re-entry, and landing on Rogers Dry Lake.

- Site: [projectx15.com](https://projectx15.com)
- Contact: contact@projectx15.com
- Plan: [docs/PLAN.md](docs/PLAN.md)

## Status

**M1 — physics core** (in progress). Flyable greybox build:

- 6-DOF rigid body, fixed 120 Hz RK4 in a Web Worker, flat Earth with altitude-dependent gravity
- US Standard Atmosphere 1976 (0–86 km) with an exponential tail above
- XLR99: ignition delay, 50–100 % throttle, altitude-dependent thrust, ~88 s burn
- H2O2 reaction controls, stability augmentation (pitch/roll/yaw dampers)
- Aero coefficients by Mach in `src/data/x15-aero.json` — **approximate placeholders**, to be replaced with NASA data
- Greybox X-15 and B-52, text HUD, chase / cockpit / side cameras

Magenta guide boxes (toggle with G, switch profile with J) mark the ideal flight path; the next box is yellow. Paths are recorded from the autopilot profile flights (`npm run gen-profiles`).

Headless tests check the M1 gate against real profiles: an altitude flight peaking at 320,000–380,000 ft (cf. flight 91, 354,200 ft) and a speed flight reaching Mach 5.2–6.5.

## Record challenge

A panel (bottom left) tracks two goals on every full flight from the B-52, with best-ever marks saved in the browser:

- **Altitude — 354,200 ft** (Joe Walker, flight 91, 22 Aug 1963). Fly the altitude profile.
- **Speed — Mach 6.04** (Bob White, 9 Nov 1961, the standard X-15's best). Fly the speed profile: pull up to 25°, ease into a 3° climb at 82,000 ft, full throttle to burnout. A near-perfect flight only just makes it.
- **Mach 6.70** (Pete Knight, flight 188, 3 Oct 1967) is shown locked: it needs the X-15A-2 with drop tanks.

`record_matched` fires to GA4 when a record is matched. Practice scenarios do not count.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # physics + profile tests
npm run build    # production build in dist/
```

## Controls

| Input | Action |
| --- | --- |
| W / S or ↑ / ↓ | Pitch (S = nose up) |
| A / D or ← / → | Roll |
| Q / E | Yaw |
| X / Z | Throttle up / down |
| Space | Release from the B-52 |
| I / O | Ignite / shut down the XLR99 |
| R / F | Reaction controls / stability augmentation on-off |
| L / K | Landing gear down · jettison ventral fin (both one-way, do both before landing) |
| C | Camera: chase, cockpit, pilot view (no cockpit drawn), side |
| G / J | Guide boxes on/off · switch guide profile (altitude / speed) |
| B | Flight guide on/off (step-by-step help, Enter to continue) |
| T / P / N | Time scale, pause, new flight |
| Y | Highlights replay (in replay: [ / ] skip, P pause, T speed, C camera) |
| Gamepad | Sticks fly, triggers throttle, A ignite, Y release |

## Layout

```
src/physics/   atmosphere, aircraft data, engine, 6-DOF sim, autopilot
src/data/      aero coefficient tables, recorded guide profiles (JSON)
src/worker/    fixed-step physics loop and message protocol
src/render/    Three.js scene (floating origin) and greybox models
src/input/     keyboard + Gamepad API
src/ui/        HUD
tests/         unit tests and headless flight profiles
```

## Flight guide

A step-by-step coach for first-time pilots, modelled on the lessons in Fly Kai Tak (`src/ui/coach.ts`). It is on by default; **B** turns it on or off (remembered), **Skip guide** turns it off, `?guide=0` / `?guide=1` override it. Thirteen steps follow the active guide-box profile: drop, ignite, throttle, pull-up, boost, coast, re-entry, glide to the lake, ventral fin, gear, flare, rollout. Each step shows a live meter with its target zone, amber warnings in plain words, and moves on when the aircraft does what it asked. It picks up at the matching step in a practice scenario, and a crash shows a tip for what went wrong.

## Practice scenarios

Add `?scenario=landing`, `landing-gear-up`, `highalt` or `dive` to the URL to start somewhere other than the B-52. `M` mutes sound; `U` shows the text readout in the cockpit.

## Analytics

GA4 (`G-36Q83P4LEH`, via Google tag gateway on Cloudflare). Events are fired from telemetry changes in `src/analytics.ts`, once per flight:

| Event | When | Key params |
| --- | --- | --- |
| `flight_start` | Page load or new flight (N) | `flight_number`, `scenario` |
| `b52_release` | Drop from the B-52 | `altitude_ft`, `mach`, `flight_time_s` |
| `engine_ignition` / `engine_shutdown` / `engine_burnout` | XLR99 state change | as above (+ `propellant_kg` on shutdown) |
| `mach_milestone` | Mach 1–6 first reached | `milestone` |
| `altitude_milestone` | 100k, 200k, 264k (astronaut wings), 300k, 350k ft | `milestone_ft` |
| `gear_down`, `ventral_jettison` | Landing prep | as above |
| `flight_end` | Landed or crashed | `outcome`, `max_mach`, `max_altitude_ft`, `max_g`, `crash_reason`, `touchdown_kt`, `sink_fps` |
| `camera_change` | C key | `camera` |
| `record_matched` | Altitude or speed record matched | `record`, `value` |
| `guide_start` / `guide_step` / `guide_complete` / `guide_skip` / `guide_crash` | Flight guide progress | `step`, `index`, `reason` |
