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

The map is drawn on a canvas from vector data in `assets/maps/`, one file per city, so it stays sharp at any screen density and zoom. It can be dragged, zoomed with the buttons, a double-click, Ctrl and scroll, or a pinch, and switched between eight cities and ten styles. The print styles use the theme colors from [SVGmap](https://svgmap.jarvisar.com/). Pen plot draws the map one pen at a time, and Reset view draws it again. Until a style is picked, the map uses Classic in light mode and Midnight in dark mode.

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
- Each city's map data is 130 to 335 KB gzipped. Cincinnati loads with the page, and the others load when picked.
