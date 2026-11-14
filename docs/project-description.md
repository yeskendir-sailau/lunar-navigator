# Project description (for the Space Apps submission form)

**Name:** Lunar Navigator

**Summary (one sentence):** Pick any spot on a 3D Moon and a date, and get a traffic-light report of sunlight, view of Earth and distance to existing landing sites, with the reasons.

**Description**

Lunar Navigator is a web tool that helps engineers and students see, in seconds, whether a place on the Moon is a good landing candidate on a chosen date. You click on a 3D Moon (or type coordinates or a site name), and the tool shows a report with three checks and one overall colour: **Energy** (how much of the next 14 days the Sun is more than 5° above the horizon, and how long the longest night is), **Communication** (how much of the time Earth is above the horizon, so a direct link is possible) and **Neighbors** (distance to the 25 landing and impact sites in our list, checked against NASA's 2011 recommendations: 2 km, or 3σ of the landing error, from lander sites; 0.5 km from impact sites). Every colour is repeated with an icon and a word, so the result is clear without telling colours apart.

A date slider and a Play button show how conditions change in time: the light on the Moon comes from the real direction of the Sun, the Sun and Earth are drawn in the scene (labelled "not to scale"), and the report updates. "View from Earth" shows the familiar phase. Two or three places can be put side by side in a comparison table with the best value in each row highlighted. A "How it is calculated" button explains every rule and says which numbers come from NASA and which are our own choices. A robot checks the source pages once a day and opens a GitHub issue if one changes; it never edits the map by itself.

**Data and sources:** NASA/JPL ephemeris DE421 (Sun and Earth positions); LOLA elevation data, Barker et al. (2023) (terrain horizon: prepared in code, profiles not included yet); NASA NSSDC lists of lunar sites; NASA 2011 recommendations for protecting US government lunar artifacts; NASA Scientific Visualization Studio Moon texture; three.js.

**Honest limits:** the horizon is flat unless terrain data is present (the report says so); the green / yellow / red limits for Energy and Communication are our own choice and are explained in the tool; the NASA 2011 rules are non-binding recommendations; dust is a rough approximation; this is not for real mission planning.

**Use of AI:** The code, texts and tests were written with the help of Claude (Anthropic). The team checked the numbers against NASA and JPL sources, chose the thresholds and decided what goes in.

**Links:** Website: _GitHub Pages link_ · Repository: _GitHub link_ · Video: _YouTube link_

**Challenge fit:** choose and compare sites; date and time; Sun and Earth visualization; sunlight, Earth visibility and sunset / Earthset times; safety around existing sites; accessible colours with icons and words.
