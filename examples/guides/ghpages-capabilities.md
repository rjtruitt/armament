# GitHub Pages Capabilities Reference

Static hosting with full client-side HTML/CSS/JS. No server-side execution. Everything below works without a build step unless noted.

---

## 1. Client-Side Search

GitHub Pages serves static files only — search must run entirely in the browser.

### Pre-built Index

Generate a JSON index at publish time and load it at runtime.

```html
<script src="https://unpkg.com/lunr/lunr.min.js"></script>
<script>
  fetch('/search-index.json')
    .then(r => r.json())
    .then(data => {
      const idx = lunr(function () {
        this.ref('id');
        this.field('title', { boost: 10 });
        this.field('body');
        data.forEach(doc => this.add(doc));
      });
      window.searchIndex = idx;
      window.searchDocs = data;
    });
</script>
```

### Runtime Index (small sites)

For sites under ~200 pages, build the index on page load from a single JSON file. Adds 100-300ms on first load.

### Library Comparison

| Library | Size (min) | Strengths | Trade-offs |
|---------|-----------|-----------|------------|
| Lunr.js | 8 KB | Stemming, field boosting, pre-built index support | No fuzzy by default |
| Fuse.js | 5 KB | Fuzzy matching, works on any JSON | Slower on large datasets |
| FlexSearch | 6 KB | Fastest benchmarks, memory-efficient | Less stemming flexibility |

### Index Format

```json
[
  { "id": "/pages/auth-flow", "title": "Auth Flow", "body": "OAuth2 PKCE flow..." },
  { "id": "/pages/data-model", "title": "Data Model", "body": "Core entities..." }
]
```

For larger sites, tools like `lunr-index-build` generate optimized serialized indexes.

---

## 2. Navigation

### Collapsible Tree View (pure CSS + JS)

```html
<nav id="sidebar">
  <ul class="tree">
    <li>
      <details open>
        <summary>Architecture</summary>
        <ul>
          <li><a href="#auth-flow">Auth Flow</a></li>
          <li><a href="#data-model">Data Model</a></li>
        </ul>
      </details>
    </li>
  </ul>
</nav>
```

`<details>` gives expand/collapse for free. Add JS only to persist open/closed state.

### Breadcrumbs

```js
const path = location.pathname.split('/').filter(Boolean);
const breadcrumb = path.map((seg, i) => {
  const href = '/' + path.slice(0, i + 1).join('/');
  return `<a href="${href}">${seg.replace(/-/g, ' ')}</a>`;
}).join(' / ');
document.getElementById('breadcrumb').innerHTML = breadcrumb;
```

### Hash Routing (SPA-style)

Load content without full page reloads. Works because the server only needs to serve one HTML file.

```js
window.addEventListener('hashchange', () => {
  const page = location.hash.slice(1) || 'index';
  fetch(`/pages/${page}.html`)
    .then(r => r.text())
    .then(html => document.getElementById('content').innerHTML = html);
});
```

For clean URLs (not hash-based), use a custom `404.html` that redirects — GitHub Pages serves `404.html` for all missing paths.

### Keyboard Navigation

```js
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.target.matches('input, textarea')) {
    e.preventDefault();
    document.getElementById('search-input').focus();
  }
  if (e.key === 'Escape') {
    document.getElementById('search-input').blur();
  }
});
```

---

## 3. Interactive Features

### Tabs

```html
<div class="tabs">
  <button class="tab active" data-tab="curl">cURL</button>
  <button class="tab" data-tab="python">Python</button>
</div>
<div class="tab-content active" id="curl">...</div>
<div class="tab-content" id="python">...</div>

<script>
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab, .tab-content').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});
</script>
```

### Copy to Clipboard

```js
document.querySelectorAll('pre code').forEach(block => {
  const btn = document.createElement('button');
  btn.textContent = 'Copy';
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(block.textContent);
    btn.textContent = 'Copied';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  });
  block.parentElement.prepend(btn);
});
```

### Dark Mode Toggle

```js
const toggle = document.getElementById('theme-toggle');
const saved = localStorage.getItem('theme');
if (saved) document.documentElement.setAttribute('data-theme', saved);

toggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
});
```

```css
:root { --bg: #fff; --text: #1a1a1a; }
[data-theme="dark"] { --bg: #1a1a1a; --text: #e0e0e0; }
body { background: var(--bg); color: var(--text); }
```

### Accordions (CSS-only)

```html
<details>
  <summary>What authentication method is used?</summary>
  <p>OAuth2 with PKCE flow. See the auth-flow page for details.</p>
</details>
```

---

## 4. Data Visualization

### D3.js (CDN, no build)

```html
<script src="https://d3js.org/d3.v7.min.js"></script>
<div id="chart"></div>
<script>
  const data = [40, 80, 150, 60, 120];
  const svg = d3.select('#chart').append('svg').attr('width', 300).attr('height', 200);
  svg.selectAll('rect')
    .data(data)
    .join('rect')
    .attr('x', (d, i) => i * 60)
    .attr('y', d => 200 - d)
    .attr('width', 50)
    .attr('height', d => d)
    .attr('fill', 'steelblue');
</script>
```

### CSS-Only Charts

```html
<div class="bar" style="--value: 75%">Service A (75%)</div>
<div class="bar" style="--value: 45%">Service B (45%)</div>

<style>
.bar {
  background: linear-gradient(to right, steelblue var(--value), transparent var(--value));
  padding: 0.5em;
  margin: 0.25em 0;
}
</style>
```

### Interactive SVG Diagrams

Inline SVG with JS event handlers for tooltips, zoom, highlighting:

```html
<svg id="architecture-diagram" viewBox="0 0 800 600">
  <g class="node" data-service="auth">
    <rect x="10" y="10" width="120" height="60" />
    <text x="70" y="45">Auth Service</text>
  </g>
</svg>
<script>
document.querySelectorAll('.node').forEach(node => {
  node.addEventListener('mouseenter', () => showTooltip(node.dataset.service));
});
</script>
```

### Canvas API

For large datasets (thousands of points), Canvas outperforms SVG. Useful for flame charts, dependency graphs, timeline views.

---

## 5. Offline / Performance

### Service Workers

Cache the entire site for offline access:

```js
// sw.js
const CACHE = 'docs-v1';
const URLS = ['/', '/index.html', '/style.css', '/app.js', '/search-index.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(URLS)));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
```

```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

### Prefetching

```html
<link rel="preload" href="/search-index.json" as="fetch" crossorigin>

<script>
document.querySelectorAll('a[href]').forEach(link => {
  link.addEventListener('mouseenter', () => {
    const prefetch = document.createElement('link');
    prefetch.rel = 'prefetch';
    prefetch.href = link.href;
    document.head.appendChild(prefetch);
  }, { once: true });
});
</script>
```

### Lazy Loading

```html
<img src="diagram.png" loading="lazy" alt="System diagram">

<script>
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      loadHeavyContent(entry.target);
      observer.unobserve(entry.target);
    }
  });
});
document.querySelectorAll('[data-lazy]').forEach(el => observer.observe(el));
</script>
```

### IndexedDB for Local State

Store user preferences, reading progress, annotation drafts:

```js
const dbReq = indexedDB.open('docs', 1);
dbReq.onupgradeneeded = (e) => {
  e.target.result.createObjectStore('notes', { keyPath: 'page' });
};
dbReq.onsuccess = (e) => {
  const db = e.target.result;
  const tx = db.transaction('notes', 'readwrite');
  tx.objectStore('notes').put({ page: location.pathname, text: 'My note here' });
};
```

---

## 6. Content Features

### Syntax Highlighting (no build)

```html
<link rel="stylesheet" href="https://unpkg.com/prismjs/themes/prism.css">
<script src="https://unpkg.com/prismjs/prism.js"></script>
<script src="https://unpkg.com/prismjs/components/prism-python.min.js"></script>

<pre><code class="language-python">
def hello():
    return "world"
</code></pre>
```

Prism auto-highlights on DOMContentLoaded. For dynamic content, call `Prism.highlightAll()` after insertion.

### Math Rendering (KaTeX)

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex/dist/contrib/auto-render.min.js"></script>

<script>
document.addEventListener('DOMContentLoaded', () => {
  renderMathInElement(document.body, {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '$', right: '$', display: false }
    ]
  });
});
</script>
```

KaTeX renders much faster than MathJax. Suitable for rate formulas, SLA calculations, etc.

### Table Sorting

```js
function sortTable(table, col, asc) {
  const rows = [...table.querySelectorAll('tbody tr')];
  rows.sort((a, b) => {
    const aVal = a.cells[col].textContent.trim();
    const bVal = b.cells[col].textContent.trim();
    return asc ? aVal.localeCompare(bVal, undefined, {numeric: true})
               : bVal.localeCompare(aVal, undefined, {numeric: true});
  });
  rows.forEach(row => table.querySelector('tbody').appendChild(row));
}

document.querySelectorAll('th[data-sortable]').forEach((th, i) => {
  let asc = true;
  th.addEventListener('click', () => {
    sortTable(th.closest('table'), i, asc);
    asc = !asc;
  });
  th.style.cursor = 'pointer';
});
```

### Table Filtering

```html
<input type="text" id="table-filter" placeholder="Filter rows...">
<script>
document.getElementById('table-filter').addEventListener('input', (e) => {
  const term = e.target.value.toLowerCase();
  document.querySelectorAll('tbody tr').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
  });
});
</script>
```

---

## 7. Developer Patterns

### Web Components (no framework, no build)

```html
<script>
class DocCallout extends HTMLElement {
  connectedCallback() {
    const type = this.getAttribute('type') || 'info';
    this.innerHTML = `
      <div class="callout callout-${type}">
        <strong>${type.toUpperCase()}</strong>
        <p>${this.textContent}</p>
      </div>
    `;
  }
}
customElements.define('doc-callout', DocCallout);
</script>

<doc-callout type="warning">This endpoint is deprecated in v3.</doc-callout>
```

### ES Modules (native, no bundler)

```html
<script type="module">
  import { initSearch } from './modules/search.js';
  import { initNav } from './modules/nav.js';
  import { initTheme } from './modules/theme.js';

  initSearch();
  initNav();
  initTheme();
</script>
```

All modern browsers support `type="module"`. Deferred by default, supports `import`/`export` without bundlers.

### Recommended Structure

```
/
  index.html
  style.css
  app.js
  sw.js
  search-index.json
  /modules/
    search.js
    nav.js
    theme.js
  /components/
    callout.js
    tabs.js
  /pages/
    auth-flow.html
    data-model.html
  /assets/
    diagrams/
```

All files are plain HTML/CSS/JS. Edit directly, push. No install, no compile, no CI dependency.

### When a Build Step Adds Value

- Markdown-to-HTML conversion (many pages, frequent edits)
- Minification (performance-sensitive, large JS)
- TypeScript (complex interactive features)
- Bundling third-party libraries (reduce CDN requests)

If you add a build step later, keep source in `/src` and output to `/docs` (or root). GitHub Actions can run the build on push.

---

## 8. Limitations

| Constraint | Limit |
|-----------|-------|
| Published site size | 1 GB |
| Single file size | 100 MB |
| Bandwidth (soft) | 100 GB / month |
| Builds per hour | 10 |
| Repo size (recommended) | Under 5 GB |

### No Server-Side Processing

- No dynamic content generation per request
- No authentication at the page level (rely on repo visibility settings)
- No form submissions to the same domain (use external services or GitHub Issues API)
- No server-side redirects (use `<meta http-equiv="refresh">` or `location.replace()`)

### No Dynamic Routing

- Every URL must map to an actual file or `404.html`
- Hash routing (`#/page`) works but isn't crawlable
- For clean URLs, each page needs its own `index.html` in a directory

### CORS

- Client-side JS fetching external APIs is subject to CORS
- Internal APIs need CORS headers for your `*.github.io` domain
- Alternative: proxy through a service, or pre-fetch data at build time into static JSON

### Other

- No WebSocket connections to the same origin
- No custom HTTP headers (CSP must be via `<meta>`)
- HTTPS enforced (no mixed content)
- Custom domains supported but may require DNS configuration
- On GHEC, private repos produce private Pages accessible only to org members with repo access

---

## Decision Matrix

| Need | Solution | Build Required |
|------|----------|----------------|
| Search across 50 pages | Lunr.js + manual JSON index | No |
| Search across 500 pages | FlexSearch + generated index | Yes (index gen) |
| Collapsible sidebar | `<details>` + CSS | No |
| SPA feel | Hash routing + fetch | No |
| Offline access | Service Worker | No |
| Syntax highlighting | Prism.js from CDN | No |
| Architecture diagrams | Inline SVG + JS tooltips | No |
| Dependency graph (large) | D3.js force layout | No |
| Reusable UI patterns | Web Components | No |
| Dark mode | CSS vars + localStorage | No |
| Table of 1000 rows | Virtual scrolling or paginate | No |
