# X-15 Flight Simulator — Project Plan

As of 2026-10-27. Living version: https://claude.ai/artifact/AxiQ3kU6s1F1kXzef85wBc

## Overview

Build a single-mission sim of an X-15 research flight, from hanging under the B-52 to rolling out on Rogers Dry Lake. Each run takes about 10–12 minutes of real time, matching the real flights.

- **Platform:** desktop browser (WebGL), joystick/gamepad + keyboard. Mobile is a later add-on via a separate touch input layer and HUD-only view; menus, briefings and replays are responsive from the start
- **Aircraft:** X-15 (A-1/A-3) baseline; X-15A-2 with drop tanks as a later variant
- **Missions:** two presets modelled on the real records — a speed profile (~Mach 6, ~100,000 ft) and an altitude profile (~350,000 ft)
- **Out of scope for v1:** multiplayer, B-52 piloting, failure scenarios beyond engine abort

## Flight phases

The mission runs as six linked phases; each is a game state with its own checklist, camera and win/fail conditions. Figures are approximate, from the historical programme.

| # | Phase | Starts at | Player does | Ends when |
| --- | --- | --- | --- | --- |
| 1 | Captive carry | Under the NB-52 right wing pylon, ~45,000 ft, ~Mach 0.8 | Pre-drop checklist: APU on, propellant top-off, launch-panel switches, countdown with B-52 crew | Release pulled at T-0 |
| 2 | Release | Drop from pylon | Hold attitude through the clean separation and brief free-fall | Engine lit within the light window, or abort to an emergency lakebed |
| 3 | Ignition and boost | XLR99 lit, ~57,000 lbf | Rotate to the profile pitch, hold alpha and heading, throttle as briefed | Burnout (~80–85 s) or planned shutdown |
| 4 | Ballistic / apex | Coasting above the sensible atmosphere | Switch to reaction controls (H2O2 jets) to hold attitude as aero surfaces lose authority | Descending through re-entry interface |
| 5 | Re-entry and recovery | Steep descent, rising dynamic pressure | Set entry alpha, pull out within g limits (~5 g), bleed energy, steer for the high key | Subsonic over Rogers Dry Lake |
| 6 | Approach and landing | High key, ~35,000 ft overhead | Overhead spiral to low key, jettison lower ventral fin, flare, land on rear skids + nose gear at ~200 kt | Rollout stops |

**Scoring:** peak Mach, peak altitude, profile tracking error, max g, landing point vs target, and fuel/energy margins.

## Core systems

The flight model is the hard part: it must stay stable from Mach 0.8 at 45,000 ft to Mach 6+ near vacuum.

| System | What it models | v1 fidelity |
| --- | --- | --- |
| Flight dynamics | 6-DOF rigid body; lift/drag/moment tables by Mach and alpha | Lookup tables from published wind-tunnel and flight data |
| Atmosphere | Density, temperature, speed of sound vs altitude | US Standard Atmosphere 1976 |
| Gravity and Earth | Altitude-dependent gravity, flat Earth with curvature for visuals | Spherical gravity, flat-Earth physics |
| XLR99 engine | Thrust vs throttle and altitude, mass loss as LOX/ammonia burn | Thrust curve + fuel flow; ignition can fail |
| Reaction controls | Hydrogen-peroxide jets in nose and wings for pitch/yaw/roll | Fixed impulse per jet, propellant budget |
| Control blending | Aero surfaces fade with dynamic pressure; RCS takes over | Blend by q (manual), MH-96 auto-blend as a later option |
| Thermal / structure | Skin heating and g-load limits | Warning lamps + score penalty, no breakup in v1 |
| Cockpit | Attitude indicator, Mach, altitude, alpha/beta, g, propellant, RCS | 3D cockpit with readable 1960s gauges + optional HUD |
| Environment | Mojave terrain, Edwards AFB, Rogers Dry Lake, sky fading to black | Low-poly terrain, lakebed runway markings |
| Audio | Engine roar, RCS pops, wind, radio calls with NASA-1 | Basic loops; scripted chase/NASA-1 calls |

## Tech stack and architecture

Reuse the Fly Kai Tak browser stack where possible, with a fixed-step physics loop decoupled from rendering.

- **Rendering:** Three.js (WebGL) — cockpit, external chase/B-52 views, terrain, sky shader for the black-sky transition
- **Physics:** TypeScript 6-DOF core running a fixed 120 Hz RK4 step in a Web Worker; double-precision positions with a floating origin to avoid jitter at 100 km+
- **Data:** aero, engine and atmosphere tables as JSON, loaded at start
- **Mission engine:** a state machine for the six phases, checklist scripts, scoring and a flight-data recorder for replay
- **Input:** Gamepad API for stick/throttle, keyboard fallback, separate RCS control mode
- **Hosting:** static site on Cloudflare Pages; repo on GitHub with CI tests on the physics core (known trajectories must match within tolerance)

## Milestones and roadmap

Five milestones in order; the physics core is the riskiest and comes first. Each gate must pass before the next milestone starts. Dates to be set once v1 scope is locked.

1. **M1 · Physics core** — 6-DOF model, atmosphere, gravity, aero and engine tables; headless runs with automated trajectory tests
    - Gate: sim reproduces a known X-15 flight profile
2. **M2 · Drop to apex** — release, XLR99 ignition, boost, RCS and control blending; greybox visuals, basic HUD
    - Gate: a player can fly from drop to apex
3. **M3 · Re-entry and landing** — entry alpha, pull-out, high key / low key pattern; Rogers Dry Lake, skid landing, ventral fin jettison
    - Gate: full mission flyable end to end
4. **M4 · Cockpit, B-52 and audio** — 1960s gauges, captive carry, pre-drop checklist; engine and RCS sound, NASA-1 radio calls
    - Gate: testers finish a mission unaided
5. **M5 · Missions and launch** — speed and altitude presets, scoring, replay; difficulty levels, terrain polish, public release

## Risks and open questions

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Aero data gaps at high Mach / high alpha | Unrealistic handling on boost and re-entry | Start from NASA technical reports; tune against known flight profiles |
| Numerical instability near vacuum | Tumbling or jitter at apex | Fixed-step RK4, floating origin, clamp tiny q terms |
| Too hard to fly | Players crash on re-entry | Difficulty levels: auto-blend, alpha hold, predicted-path cue |
| Scope creep (variants, failures, career) | v1 slips | Lock v1 to one aircraft and two missions |
| Browser performance | Low frame rate on laptops | Physics in a worker; LOD terrain |

**Open questions**

- [x] Platform: desktop first; mobile later
- [ ] Free web game, or a paid release later?
- [x] Name and domain: Project X-15, projectx15.com (Cloudflare); repo Ragnahhhhrock/projectx15; contact@projectx15.com
- [ ] How much real radio dialogue (NASA-1 call-outs) to script?

## Reference sources

Figures in this plan are approximate, from general knowledge of the programme; verify against these before building data tables.

- Dennis R. Jenkins, *Hypersonics Before the Shuttle: A Concise History of the X-15 Research Airplane* (NASA SP-2000-4518)
- Dennis R. Jenkins and Tony Landis, *X-15: Extending the Frontiers of Flight* (NASA SP-2007-562)
- NASA Technical Reports Server — X-15 wind-tunnel and flight-test reports
- NASA Armstrong Flight Research Center X-15 photo and fact archive
- Milt Thompson, *At the Edge of Space: The X-15 Flight Program*
