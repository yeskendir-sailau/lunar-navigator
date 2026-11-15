# Lunar Navigator

**Pick a spot on the Moon and a date. Get a traffic-light answer: is there enough sunlight, can you see Earth, and is it safe for the landing sites that are already there?**

Made for NASA Space Apps Challenge 2026.

**Live site: https://yeskendir-sailau.github.io/lunar-navigator/**

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
| Surface elevation of the Moon | LOLA (Lunar Orbiter Laser Altimeter on NASA's LRO), map `LDEM_80S_80MPP_ADJ` (south of 80° S, 80 m per pixel), NASA Goddard PGDA: [product page](https://pgda.gsfc.nasa.gov/products/90), [file](https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF) (181 MB, not stored in this repo). Barker, M. K. et al. (2023), Planet. Sci. J. 4, 183, [doi:10.3847/PSJ/acf3e1](https://doi.org/10.3847/PSJ/acf3e1) | Real terrain horizon for 6 points near the south pole: `tools/make_horizons.py` → `data/horizons.json` |
| Positions of the Sun and Earth | NASA/JPL ephemeris DE421 ([de421.bsp](https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de421.bsp)) and the Moon orientation files from NASA NAIF (SPICE): [moon_pa_de421_1900-2050.bpc](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de421_1900-2050.bpc), [moon_080317.tf](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_080317.tf), [pck00008.tpc](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/a_old_versions/pck00008.tpc). Moon-fixed frame MOON_ME_DE421, read with [Skyfield](https://rhodesmill.org/skyfield/) and sampled every hour by `tools/make_ephemeris.py` into `data/sun_earth.json` | Sun and Earth elevation, day and night, phases |
| Landing and impact sites | NASA NSSDC: [lunar landing sites](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html), [artifact impacts](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html); NASA 2011 document | `data/sites.json` (coordinates, dates, source link for every site) |
| Planned missions | NASA, [Artemis III candidate landing regions](https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/) (2024); [Chang'e 7](https://www.planetary.org/space-missions/change-7) | `data/planned.json`: names and links only. Coordinates are not filled yet, so these are not on the map and do not change any colour |
| Rules for neighbours | NASA, *NASA's Recommendations to Space-Faring Entities: How to Protect and Preserve the Historic and Scientific Value of U.S. Government Lunar Artifacts* (2011, Rev. A), [PDF](https://www.nasa.gov/pdf/617743main_NASA-USG_LUNAR_HISTORIC_SITES_RevA-508.pdf) | Keep-out distances, gravel distance, horizon distance |
| Moon height map and texture | NASA Scientific Visualization Studio, CGI Moon Kit, https://svs.gsfc.nasa.gov/4720 (built from LRO / LOLA data). `textures/moon_height.jpg` comes from there; _team: confirm that `textures/moon_4k.jpg` does too_ | The relief and the picture on the 3D Moon (relief exaggerated about 7×, picture only) |
| Star sky | NASA Scientific Visualization Studio, Deep Star Maps 2020, https://svs.gsfc.nasa.gov/4851 (`starmap_2020_4k.exr` converted to `textures/stars.jpg`) | Background of the 3D scene (decorative, not turned to the exact date) |
| Earth 3D model | `models/earth.glb` (textures reduced to 2048 px). _Team: add the author, the page you downloaded it from and the licence._ | Earth in the scene |
| Sun surface texture | `textures/sun.jpg` from the Sun model archive. _Team: add the author, the page you downloaded it from and the licence._ | Sun in the scene |
| Check of the Sun and Earth positions | NASA/JPL [Horizons](https://ssd.jpl.nasa.gov/horizons/) through its [API](https://ssd.jpl.nasa.gov/api/horizons.api) | `tools/horizons_check.mjs`, table below |
| 3D | [three.js](https://threejs.org/) 0.160 (MIT licence) | Drawing the Moon |
| PDF | [jsPDF](https://github.com/parallax/jsPDF) 2.5.1 (MIT licence), stored in `vendor/` | The PDF report |
| Data preparation (Python, run once on our computer) | [Skyfield](https://rhodesmill.org/skyfield/), [NumPy](https://numpy.org/), [rasterio](https://rasterio.readthedocs.io/), [pyproj](https://pyproj4.github.io/pyproj/) | `tools/make_ephemeris.py`, `tools/make_horizons.py` |

NASA 2011 numbers we use (checked against the document): stay at least 2.0 km from a lander site (0.5 km from an impact site) or 3σ of the landing error, whichever is larger; rocks thrown by the Apollo landers reached up to 1.5 km; the lunar horizon is about 1.8 km away. The document is a **non-binding recommendation written for US government artifacts**. We apply the same distances to all sites as a precaution, which is our choice.

## Comparison with JPL Horizons

Our Sun and Earth elevations come from DE421 through the hourly file; [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) is an independent service built on the same kind of ephemerides. To check we did not make a mistake in the geometry, run:

```
node tools/horizons_check.mjs
```

(Needs internet. It compares 3 places × 3 dates × Sun and Earth.) With `node tools/horizons_check.mjs --readme` it also writes the table below by itself.

What differences to expect: Horizons looks from a point **on the surface**, we look from the **centre of the Moon**. For the Sun this changes almost nothing (the Sun is far away). For Earth it can shift the elevation by up to about 0.26° (the Moon's radius seen from Earth's distance), so Earth differences of a few tenths of a degree are expected, not an error.

<!-- horizons-check:start -->
| Place | Time (UTC) | Body | Horizons elevation | Our elevation | Difference |
|---|---|---|---|---|---|
| Apollo 11 | 2026-11-20 00:00 | Sun | 59.797° | 59.791° | −0.006° |
| Apollo 11 | 2026-11-20 00:00 | Earth | 58.897° | 59.034° | +0.137° |
| Apollo 11 | 2026-12-05 12:00 | Sun | -68.178° | -68.172° | +0.006° |
| Apollo 11 | 2026-12-05 12:00 | Earth | 71.273° | 71.350° | +0.077° |
| Apollo 11 | 2027-03-10 06:00 | Sun | -39.191° | -39.196° | −0.005° |
| Apollo 11 | 2027-03-10 06:00 | Earth | 60.310° | 60.432° | +0.122° |
| Apollo 17 | 2026-11-20 00:00 | Sun | 58.807° | 58.803° | −0.004° |
| Apollo 17 | 2026-11-20 00:00 | Earth | 45.667° | 45.850° | +0.183° |
| Apollo 17 | 2026-12-05 12:00 | Sun | -66.501° | -66.497° | +0.004° |
| Apollo 17 | 2026-12-05 12:00 | Earth | 61.760° | 61.875° | +0.115° |
| Apollo 17 | 2027-03-10 06:00 | Sun | -29.445° | -29.449° | −0.004° |
| Apollo 17 | 2027-03-10 06:00 | Earth | 46.013° | 46.187° | +0.174° |
| Near the south pole | 2026-11-20 00:00 | Sun | 4.506° | 4.506° | +0.000° |
| Near the south pole | 2026-11-20 00:00 | Earth | 8.134° | 8.391° | +0.257° |
| Near the south pole | 2026-12-05 12:00 | Sun | -2.066° | -2.065° | +0.001° |
| Near the south pole | 2026-12-05 12:00 | Earth | -1.484° | -1.233° | +0.252° |
| Near the south pole | 2027-03-10 06:00 | Sun | -5.184° | -5.183° | +0.001° |
| Near the south pole | 2027-03-10 06:00 | Earth | 9.974° | 10.226° | +0.253° |

Largest difference: 0.257° (Sun only: 0.006°). Checked on 2026-11-15 with the JPL Horizons API.
<!-- horizons-check:end -->

## Tests

`node tests/run.mjs` runs 29 checks, for example:

- Apollo 12 and Surveyor 3 are 156.8 m apart, so a landing at Apollo 12's spot is **red** (inside the 2 km keep-out zone of Surveyor 3).
- The keep-out distance is 2.0 km (0.5 km for impact sites) and grows to 3σ when the landing error is large.
- Terrain shielding makes dust risk lower but never lowers the NASA keep-out zone.
- The colour changes with the date, the overall colour is the worst of the three, missing data is shown as "No data".

## Limitations (please read)

- **The thresholds are our own choice.** NASA gives numbers only for the neighbour distances. The green / yellow / red limits for Energy and Communication (14-day window, Sun above 5°, 70 % / 30 % sunlit, and so on) are ours, kept in one file, `data/thresholds.json`, and explained in "How it is calculated". With a 30-day window every place is sunlit about 50 % of the time, so a 14-day window (about one lunar day of sunlight) is used. Other missions need other numbers.
- **Real terrain horizon only for 6 points near the south pole.** `data/horizons.json` holds LOLA horizon profiles (360 directions, up to 100 km away, eye 2 m above the ground) for 5 crater areas (Shackleton, de Gerlache, Haworth, Faustini, Nobile; centres are approximate, see `data/pole_points.json`) and the listed landing site south of 80° S. There the report says "Terrain horizon used", and Sun / Earth hidden behind a crater wall count as not visible. Example: at Shackleton (-89.9, 129.3) a flat horizon gives "Earth in view 83 %", the real terrain gives 0 %. Everywhere else the horizon is flat and the report says "Flat horizon, no terrain". Why not everywhere: the LOLA map we use covers only the region south of 80° S, and a profile must be computed for each point in advance (about 10 s per point). Near the equator the Sun climbs to 60–90°, so a hill of a few degrees moves sunrise by a few hours out of a 14-day day; near the poles the Sun stays within a few degrees of the horizon, so terrain decides everything. More points can be added with `python tools/make_horizons.py --point NAME LAT LON`. Terrain shielding of neighbours is a rough approximation: it knows how high the terrain is, not how far away.
- **Dust**: NASA gives no distance for dust, so we flag neighbours within twice the horizon distance (3.6 km) as "may be in line of sight". This is an approximation.
- The relief on the 3D Moon (CGI Moon Kit height map) is **exaggerated about 7×** so that it can be seen; it is a picture only. The report and the Sky view use the real LOLA heights (where available), not the 3D picture.
- Sun and Earth are treated as points (the centre of the disc), seen from the centre of the Moon; for Earth this ignores a shift of up to about 0.26° for an observer on the surface. No atmosphere on the Moon, so no refraction.
- Sun and Earth data cover only the dates in `data/sun_earth.json`. Outside this range the report says "No data".
- Site coordinates are from public lists and are good to roughly tens of metres to a few kilometres, depending on the mission. Landing accuracy in the report is 1σ and can be changed (10 m – 3 km).
- The "Lander size" list (Small CLPS / Medium heavy cargo / Large crewed) is a note only: we do not yet have a verified rule for what it would change, so it does not change any colour. The weight ranges in it are approximate.
- **This is not a tool for real mission planning.**

## Extra features
- **PDF report**: "Download PDF" in the report card (or "PDF" in the comparison table) saves the report with charts, nearest sites and, if places A / B / C are set, the comparison table. It uses [jsPDF](https://github.com/parallax/jsPDF) 2.5.1 (MIT licence), stored in `vendor/` so it works offline.
- **Light theme**: the button in the top right corner switches between the dark (space) theme and a light grey one. The choice is remembered in the browser.
- **Tour**: after Start the site asks if you want a 1-minute tour (11 steps; the rest of the screen is blurred). The `?` button replays it.

## Updating the data

`tools/check_sources.py` runs once a day through GitHub Actions (`.github/workflows/update.yml`). If one of the source pages changed, it opens a GitHub issue "Check what's new in the sources". It never changes the map by itself: a person reads the issue and decides. Next step: automatic suggestions for new sites.

## Use of AI

The code, the texts and the tests of this project were written with the help of **Claude** (Anthropic): the team described what it wanted, Claude wrote the code, and the team ran it, checked the numbers against NASA and JPL sources, chose the thresholds and decided what to include. All data come from the sources listed above; no numbers were invented by the AI. Where we could not check something (for example the authors of the Earth model and the Sun texture), the README says so.

## What was prepared before the hackathon and what was done on 14–15 November

_Team: please check this section against the Space Apps rules and with your Local Lead before submitting; correct it if it does not match what really happened._

- **Before 14 Nov**: research and the plan; the site list with sources (`data/sites.json`); the Sun and Earth ephemeris script; the calculation modules (`astro.js`, `safety.js`, `horizon.js`, `report-logic.js`) and their tests; the NASA 2011 rules; texts (README, video script, project description).
- **14–15 Nov**: putting the parts together into the website, `index.html` and the start screen, publishing on GitHub Pages, checking on other devices, the 30-second video and the submission.
