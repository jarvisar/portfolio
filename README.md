# portfolio.jarvisar.com

Online resume and portfolio of Adam Jarvis: experience, projects, 3D printed maps, education, and activities.

Live site: [portfolio.jarvisar.com](https://portfolio.jarvisar.com/)

## Structure

- `index.html` is the main page.
- `projects/` has a page for each project.
- `assets/css/site.css` and `assets/js/site.js` are shared by every page. There are no other dependencies and no build step.
- `assets/js/map.js` draws the map at the top of the main page.
- `404.html` redirects the old `*-details.html` addresses to their new pages.
- `tetris.html` opens with the Konami Code.

## Cover Map

The map is drawn on a canvas from vector data in `assets/maps/`, one file per city, so it stays sharp at any screen density and zoom. It can be dragged, zoomed with the buttons, a double-click, Ctrl and scroll, or a pinch, and switched between 46 cities and 11 styles. The print styles use the theme colors from [SVGmap](https://svgmap.jarvisar.com/). City model raises the buildings to their OpenStreetMap heights in the colors of a [City Model](https://citymodel.jarvisar.com/) print. Until a style is picked, the map uses Classic in light mode and Midnight in dark mode.

Pen plot draws the map one pen at a time, Birch plywood engraves it a row at a time, and City model builds it up a layer at a time. Reset view plays these again.

Until the map is moved or a city or style is picked, it plays a tour of other cities and styles, set by `TOUR` in `assets/js/map.js`. The tour waits while keyboard focus is on the map and while the map is mostly off screen. It doesn't start on its own when the system is set to reduce motion or Data Saver is on. The button next to the City menu pauses and plays it.

The data is OpenStreetMap, from OpenFreeMap's vector tiles, the same source SVGmap uses. To rebuild it or add a city, edit the list at the top of `tools/build-maps.mjs`, run it with Node 22 or later, and add the city to the City menu in `index.html`:

```
node tools/build-maps.mjs              all cities
node tools/build-maps.mjs paris boston some of them
```

`assets/img/site/cincinnati-light.webp` and `cincinnati-dark.webp` are captures of the starting view in Classic and Midnight. They show until the map loads, and without JavaScript. Capture them again if the Cincinnati data or those colors change.

## Running Locally

Serve the folder with any static server, for example:

```
python -m http.server 8000
```

Then open http://localhost:8000.

## Notes

- Every page has a noindex tag to keep the site out of search results, so there's no sitemap. New pages need the tag too.
- The contact form posts to Formspree.
- Light and dark mode follow the system setting.
- Each city's map data is 45 to 365 KB gzipped, including building heights. Cincinnati loads with the page. The others load when picked, or shortly before the tour shows them.
