# Lunar Navigator

**Pick a spot on the Moon and a date. Get a traffic-light answer: is there enough sunlight, can you see Earth, and is it safe for the landing sites that are already there?**

Made for NASA Space Apps Challenge 2026. Live site: _add your GitHub Pages link here_ (`https://YOUR_LOGIN.github.io/lunar-navigator/`).

## What it does

- A 3D Moon with 25 marked sites (Apollo, Surveyor, Luna, Chang'e, Chandrayaan, SLIM, Odysseus, Blue Ghost, Hakuto-R and more, including impact sites). Click a marker for the story of the site.
- Click anywhere on the Moon, type coordinates (`3.01 S, 23.42 W`) or a site name, and you get a **report** with three checks and one overall colour:
  - **Energy**: how much of the next 14 days the Sun is more than 5° above the horizon, and the longest night.
  - **Communication**: how much of the next 14 days Earth is above the horizon (a direct line to Earth), and the longest break.
  - **Neighbors**: distance to existing landing and impact sites, checked against NASA's 2011 recommendations.
- Every colour is repeated with an icon and a word (✓ Good, ! Caution, ✕ Not recommended), so the report works without telling colours apart.
- Move the cursor over the Moon: the ring under it shows a quick preliminary colour. Click for the full report.
- **Time**: pick a date or drag the slider, or press Play (the slider covers the dates in `data/sun_earth.json`). The light on the 3D Moon, the report and the graphs all follow.
- **Real light / Full light**: real light shows the phase made by the real Sun direction; full light lights the whole Moon.
- **View from Earth** shows the Moon the way we see it from home. The Sun and Earth are drawn in the scene in their real direction, labelled "not to scale".
- **Compare places** (wide screens): "Set as A / B / C" in the Sun & Earth panel puts 2–3 places side by side. The best value in each row is highlighted.
- **How it is calculated** (button in the report) explains every rule and says which numbers are NASA's and which are our own choice.

## How to use it

Open the site, press **Start**, click a marker or the Moon. Read the overall colour first, then the three blocks: each one says *why* it is not green. Change the date with the slider and watch the colours change. On a phone you get the report, the date bar and the light buttons; the Sun & Earth graph, the site card and the comparison need a wide screen.

## Run it on your computer

1. Install VS Code and its **Live Server** extension.
2. Open the project folder in VS Code, right-click `index.html`, **Open with Live Server**.
3. Optional checks: `node tests/run.mjs` (logic tests), or open `demos/tests.html` in Live Server (the same tests in the browser), `python3 tools/check_sites.py` (site list).

It needs internet for one thing only: three.js is loaded from a CDN.

## Data and citations

| What | Source | Used for |
|---|---|---|
| Surface elevation of the Moon | LOLA, Lunar Orbiter Laser Altimeter. Barker, M. K. et al. (2023), LOLA elevation maps _(team: add the full reference: title, journal, DOI)_. | Terrain horizon (see "Limitations": the profiles are not included yet) |
| Positions of the Sun and Earth | NASA/JPL ephemeris DE421, Moon-fixed frame MOON_ME_DE421, sampled every hour by `tools/make_ephemeris.py` into `data/sun_earth.json` | Sun and Earth elevation, day and night, phases |
| Landing and impact sites | NASA NSSDC lists of lunar sites and artifact impacts; NASA 2011 document | `data/sites.json` (coordinates, dates, source link for every site) |
| Rules for neighbours | NASA, *NASA's Recommendations to Space-Faring Entities: How to Protect and Preserve the Historic and Scientific Value of U.S. Government Lunar Artifacts* (2011, Rev. A) | Keep-out distances, gravel distance, horizon distance |
| Moon texture | NASA Scientific Visualization Studio, CGI Moon Kit _(team: confirm that `textures/moon_4k.jpg` comes from there and add the link)_ | The picture on the 3D Moon |
| Earth 3D model | `models/earth.glb` (textures reduced to 2048 px). _Team: add the author, the page you downloaded it from and the licence._ | Earth in the scene |
| Sun surface texture | `textures/sun.jpg` from the Sun model archive. _Team: add the author, the page you downloaded it from and the licence._ | Sun in the scene |
| 3D | three.js (MIT licence) | Drawing the Moon |

NASA 2011 numbers we use (checked against the document): stay at least 2.0 km from a lander site (0.5 km from an impact site) or 3σ of the landing error, whichever is larger; rocks thrown by the Apollo landers reached up to 1.5 km; the lunar horizon is about 1.8 km away. The document is a **non-binding recommendation written for US government artifacts**. We apply the same distances to all sites as a precaution, which is our choice.

## Comparison with JPL Horizons

Our Sun and Earth elevations come from DE421 through the hourly file; JPL Horizons is an independent service built on the same kind of ephemerides. To check we did not make a mistake in the geometry, run:

```
node tools/horizons_check.mjs
```

and paste the table it prints below. (Needs internet. It compares 3 places × 3 dates × Sun and Earth. A difference of a few hundredths of a degree is expected: Horizons gives the apparent direction with light-time, we use the geometric direction.)

_Table to be filled in from the output of `tools/horizons_check.mjs`. Not filled yet, so no numbers are claimed here._

## Tests

`node tests/run.mjs` runs 29 checks, for example:

- Apollo 12 and Surveyor 3 are 156.8 m apart, so a landing at Apollo 12's spot is **red** (inside the 2 km keep-out zone of Surveyor 3).
- The keep-out distance is 2.0 km (0.5 km for impact sites) and grows to 3σ when the landing error is large.
- Terrain shielding makes dust risk lower but never lowers the NASA keep-out zone.
- The colour changes with the date, the overall colour is the worst of the three, missing data is shown as "No data".

## Limitations (please read)

- **The thresholds are our own choice.** NASA gives numbers only for the neighbour distances. The green / yellow / red limits for Energy and Communication (14-day window, Sun above 5°, 70 % / 30 % sunlit, and so on) are ours, kept in one file, `data/thresholds.json`, and explained in "How it is calculated". With a 30-day window every place is sunlit about 50 % of the time, so a 14-day window (about one lunar day of sunlight) is used. Other missions need other numbers.
- **The horizon is flat unless terrain data is present.** `data/horizons.json` is empty at the moment: no terrain profiles from LOLA are included. So mountains, crater walls and the long shadows near the poles are not counted, and the report says "Flat horizon, no terrain". Near the poles a flat-horizon result can be too optimistic. The code for terrain (horizon masks, Sun and Earth hidden behind a hill, neighbours shielded by terrain) is written and tested; it switches on for any place that has an entry in `data/horizons.json`. Terrain shielding of neighbours is a rough approximation: it knows how high the terrain is, not how far away.
- **Dust**: NASA gives no distance for dust, so we flag neighbours within twice the horizon distance (3.6 km) as "may be in line of sight". This is an approximation.
- The 3D Moon is a smooth sphere: it shows the phase, not mountain shadows. For the exact light at a point, use the report and the graph.
- Sun and Earth are treated as points (the centre of the disc); no atmosphere on the Moon, so no refraction.
- Sun and Earth data cover only the dates in `data/sun_earth.json`. Outside this range the report says "No data".
- Site coordinates are from public lists and are good to roughly tens of metres to a few kilometres, depending on the mission. Landing accuracy in the report is 1σ and can be changed (10 m – 3 km).
- The "Lander size" list (Small CLPS / Medium heavy cargo / Large crewed) is a note only: we do not yet have a verified rule for what it would change, so it does not change any colour. The weight ranges in it are approximate.
- **This is not a tool for real mission planning.**

## Updating the data

`tools/check_sources.py` runs once a day through GitHub Actions (`.github/workflows/update.yml`). If one of the source pages changed, it opens a GitHub issue "Check what's new in the sources". It never changes the map by itself: a person reads the issue and decides. Next step: automatic suggestions for new sites.

## Use of AI

The code, the texts and the tests of this project were written with the help of **Claude** (Anthropic): the team described what it wanted, Claude wrote the code, and the team ran it, checked the numbers against NASA and JPL sources, chose the thresholds and decided what to include. All data come from the sources listed above; no numbers were invented by the AI. Where we could not check something (for example the JPL Horizons table), the README says so.

## What was prepared before the hackathon and what was done on 14–15 November

_Team: please check this section against the Space Apps rules and with your Local Lead before submitting; correct it if it does not match what really happened._

- **Before 14 Nov**: research and the plan; the site list with sources (`data/sites.json`); the Sun and Earth ephemeris script; the calculation modules (`astro.js`, `safety.js`, `horizon.js`, `report-logic.js`) and their tests; the NASA 2011 rules; texts (README, video script, project description).
- **14–15 Nov**: putting the parts together into the website, `index.html` and the start screen, publishing on GitHub Pages, checking on other devices, the 30-second video and the submission.
