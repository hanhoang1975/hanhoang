#!/usr/bin/env node
/**
 * build-blog.js
 * -------------------------------------------------------------------
 * Fetches Han Hoang's Medium RSS feed(s), turns each post into a card,
 * and writes the cards into index.html between the markers:
 *
 *     <!-- POSTS:START ... -->   ...cards...   <!-- POSTS:END -->
 *
 * Run it whenever you want the Writing page to match Medium:
 *     node build-blog.js
 *
 * It is also run automatically by .github/workflows/sync-medium.yml.
 *
 * No npm dependencies. Requires Node 18+ (built-in fetch).
 * -------------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");

// ---- CONFIG -------------------------------------------------------

// Feeds to pull from. The first is your personal feed. The second is the
// THE BIM FACTORY publication feed, filtered to your authored posts only,
// because some of your articles were published inside that publication.
const FEEDS = [
  { url: "https://hanmhoang.medium.com/feed", authorFilter: null },
  { url: "https://medium.com/feed/the-bim-factory", authorFilter: "Han Hoang" },
];

// Optional editorial control. Put the post id (the trailing hex in a Medium
// URL, e.g. "8b010e344f1b") of any pieces you want floated to the top, in the
// order you want them. Everything else stays newest-first below them.
// Leaving this empty gives pure reverse-chronological order.
//
// Suggested on-thesis picks (uncomment to use):
// const PINNED = ["8b010e344f1b", "17e2e79f4dac", "b1e88b5a140d"];
const PINNED = [];

const MAX_POSTS = 20;          // hard cap on cards rendered
const DEK_MAX = 160;           // max characters in the one-line summary
const HTML_FILE = path.join(__dirname, "index.html");

// ---- HELPERS ------------------------------------------------------

function stripCdata(s) {
  return s.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

// Convert em/en dashes to keep the site dash-free per brand rules.
function killDashes(s, replacement) {
  return s.replace(/[\u2014\u2013]/g, replacement).replace(/\s+,/g, ",");
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tagContent(block, tag) {
  // matches <tag ...>...</tag> (first occurrence), tolerant of namespaces
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  return m ? stripCdata(m[1]).trim() : "";
}

function postIdFromLink(link, guid) {
  const fromGuid = (guid || "").match(/([0-9a-f]{8,})\b/i);
  if (fromGuid) return fromGuid[1];
  const fromLink = (link || "").match(/-([0-9a-f]{8,})(?:\?|$)/i);
  return fromLink ? fromLink[1] : (link || guid || "").trim();
}

function fmtDate(pubDate) {
  const d = new Date(pubDate);
  if (isNaN(d)) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function makeDek(description, content) {
  let raw = description || content || "";
  raw = decodeEntities(stripCdata(raw));
  raw = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  raw = killDashes(raw, ", ");
  if (raw.length <= DEK_MAX) return raw;
  let cut = raw.slice(0, DEK_MAX);
  cut = cut.slice(0, cut.lastIndexOf(" ")).replace(/[,.;:]+$/, "");
  return cut + "...";
}

async function fetchFeed(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; medium-rss-sync/1.0)" },
  });
  if (!res.ok) throw new Error(`Feed ${url} returned ${res.status}`);
  return res.text();
}

function parseItems(xml, authorFilter) {
  const items = [];
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  for (const block of blocks) {
    const creator = decodeEntities(tagContent(block, "dc:creator"));
    if (authorFilter && creator.toLowerCase() !== authorFilter.toLowerCase()) continue;
    const link = tagContent(block, "link").replace(/\?.*$/, "");
    const guid = tagContent(block, "guid");
    const title = killDashes(decodeEntities(tagContent(block, "title")), "-");
    const pubDate = tagContent(block, "pubDate");
    const dek = makeDek(tagContent(block, "description"), tagContent(block, "content:encoded"));
    if (!title || !link) continue;
    items.push({ id: postIdFromLink(link, guid), link, title, dek, pubDate, ts: Date.parse(pubDate) || 0 });
  }
  return items;
}

function dedupe(items) {
  const seen = new Map();
  for (const it of items) if (!seen.has(it.id)) seen.set(it.id, it);
  return [...seen.values()];
}

function sortPosts(items) {
  const pinIndex = id => { const i = PINNED.indexOf(id); return i === -1 ? Infinity : i; };
  return items.sort((a, b) => {
    const pa = pinIndex(a.id), pb = pinIndex(b.id);
    if (pa !== pb) return pa - pb;
    return b.ts - a.ts;
  });
}

function renderCard(p) {
  const date = escapeHtml(fmtDate(p.pubDate));
  const title = escapeHtml(p.title);
  const dek = escapeHtml(p.dek);
  return `        <a class="post" href="${p.link}" target="_blank" rel="noopener">
          <div class="date">${date}</div>
          <div>
            <h3>${title}</h3>
            <p>${dek}</p>
            <span class="src">Read on Medium</span>
          </div>
        </a>`;
}

function inject(html, cardsHtml) {
  const re = /(<!-- POSTS:START[\s\S]*?-->)[\s\S]*?(<!-- POSTS:END -->)/;
  if (!re.test(html)) throw new Error("POSTS markers not found in index.html");
  return html.replace(re, `$1\n${cardsHtml}\n        $2`);
}

// ---- MAIN ---------------------------------------------------------

(async () => {
  try {
    let all = [];
    for (const f of FEEDS) {
      try {
        const xml = await fetchFeed(f.url);
        all = all.concat(parseItems(xml, f.authorFilter));
      } catch (e) {
        console.warn(`Skipping feed ${f.url}: ${e.message}`);
      }
    }
    if (!all.length) {
      console.error("No posts fetched. Leaving index.html unchanged.");
      process.exit(1);
    }
    const posts = sortPosts(dedupe(all)).slice(0, MAX_POSTS);
    const cards = posts.map(renderCard).join("\n\n");
    const html = fs.readFileSync(HTML_FILE, "utf8");
    const updated = inject(html, cards);
    if (updated === html) {
      console.log("No change. Writing page already up to date.");
    } else {
      fs.writeFileSync(HTML_FILE, updated);
      console.log(`Wrote ${posts.length} posts to index.html`);
    }
  } catch (e) {
    console.error("Build failed:", e.message);
    process.exit(1);
  }
})();
