# hanhoang.com: site + Medium auto-sync

Three files:

- `index.html` - the whole site, one self-contained file. Edit it directly.
- `build-blog.js` - pulls your Medium posts and rewrites the Writing page cards.
- `.github/workflows/sync-medium.yml` - runs the script automatically.

## How the Writing page stays current

The Writing page cards live between two markers in `index.html`:

    <!-- POSTS:START ... -->   ...cards...   <!-- POSTS:END -->

`build-blog.js` fetches your Medium RSS, builds fresh cards, and replaces
everything between those markers. Cards are written as plain HTML, so visitors
and search engines get a fast, static page (no in-browser fetch, no spinner).

Run it any time:

    node build-blog.js

Requires Node 18 or newer. No npm install needed.

## Why a build step and not a live fetch

A hosted HTML page cannot read Medium's feed directly in the browser: Medium
blocks cross-origin requests, and a live fetch would slow the page and break
whenever the feed or a proxy hiccups. Generating the cards ahead of time avoids
all of that.

## Making it automatic

The workflow runs every 6 hours, on manual trigger, and whenever you change the
script. It commits the updated `index.html` back to the repo.

- GitHub Pages, Netlify, Vercel, Cloudflare Pages: this works as-is. Push the
  repo, and each commit by the bot triggers a redeploy.
- Plain FTP or manual hosting: skip the workflow. Run `node build-blog.js`
  locally before each upload, or put it on a cron job on any machine.

## Editorial control (optional)

By default the cards are newest-first. To float specific pieces to the top,
open `build-blog.js` and fill in the `PINNED` array with the post ids (the
trailing hex in a Medium URL, e.g. `8b010e344f1b`), in the order you want.

Recommendation: pin your on-thesis pieces (robotics, building process, shelter)
so the page leads with work that matches your positioning, not whatever you
published most recently.

## The one caveat about Medium feeds

A Medium RSS feed returns only the most recent ~10 posts, and a personal feed
may not include articles you published inside a publication. That is why the
script also pulls the THE BIM FACTORY publication feed and filters it to your
authored posts. If a post still does not appear, you can add it by hand: copy
one `<a class="post">` block between the markers. Note that the next sync will
overwrite manual edits between the markers, so for permanent manual entries,
prefer the `PINNED` approach or keep them outside the marker block.

## Editing the rest of the site

Everything else in `index.html` is marked with HTML comments. Colors are in
`:root`. The font is set in the `<link>` tag and the `--display` / body rules.
The site is monochrome by design except the three brand-color hovers on the
Mission page.
