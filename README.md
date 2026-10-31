# portfolio.jarvisar.com

Online resume and portfolio of Adam Jarvis: experience, projects, 3D printed maps, education, and activities.

Live site: [portfolio.jarvisar.com](https://portfolio.jarvisar.com/)

## Structure

- `index.html` is the main page.
- `projects/` has a page for each project.
- `assets/css/site.css` and `assets/js/site.js` are shared by every page. There are no other dependencies and no build step.
- `404.html` redirects the old `*-details.html` addresses to their new pages.
- `tetris.html` opens with the Konami Code.

The map at the top of the main page is a Print export of Cincinnati from [SVGmap](https://svgmap.jarvisar.com/), saved in `assets/img/site/` with the Classic theme for light mode and Midnight for dark mode.

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
