# AHoosh.ai — Style Kit (lab theme cheat-sheet)

Source of truth: `home.html`. Reusable scaffold: `_shell.html` — **copy `_shell.html`, fill the `<main id="page">` slot, done.** Everything below is already wired in the shell; this doc is for writing the body that goes in the slot so it matches.

---

## 1. Color tokens (`:root`)

| Token | Hex | Use |
|---|---|---|
| `--navy` | `#03060f` | page background (near-black navy) |
| `--navy2` | `#0a1430` | raised panels / card fills (used at low alpha) |
| `--gold` | `#e0a93f` | primary accent, eyebrows, links, primary buttons |
| `--gold-lt` | `#f4d98b` | gradient highlight (pairs with `--gold`) |
| `--silver` | `#cdd6e6` | default nav/body-secondary text |
| `--dim` | `#828ca2` | muted/caption text |
| `--maxw` | `1280px` | content max width |
| `--ease` | `cubic-bezier(.22,1,.36,1)` | standard transition curve — use for everything |

Always reference tokens, e.g. `color:var(--gold)`, `transition:transform .35s var(--ease)`.

---

## 2. Typography (2 fonts)

Loaded in `<head>`: `Montserrat:700;800` + `Inter:400;500;600`.

- **Headings** → `.display` = Montserrat **800**, UPPERCASE, `line-height:.96`, `letter-spacing:-.01em`. Size it yourself per use (e.g. `style="font-size:clamp(2.4rem,6vw,5rem)"`).
- **Eyebrows / kickers** → `.label` = Montserrat **700**, UPPERCASE, `letter-spacing:.22em`, `.66rem`, colored `--gold`. Put one above each heading.
- **Body text** → default `Inter` (set on `body`), color comes through as light; use `--silver` for secondary, `--dim` for muted.
- **Nav links / buttons** → Montserrat 700 UPPERCASE with wide tracking (see classes below).

---

## 3. Header (already in `_shell.html` — do not re-add)

```html
<header id="header">
  <div class="container nav-inner">
    <a href="/" class="logo" data-cursor><img src="Ahoosh_Vectore_Logo.png" alt="AHoosh.ai" /></a>
    <button class="burger" id="burger" aria-label="Menu"><span></span><span></span><span></span></button>
    <nav class="main" id="nav">
      <a href="/news" data-cursor>News</a>
      <a href="/articles" data-cursor>Articles</a>
      <a href="/consulting" data-cursor>Consulting</a>
      <a href="/about" data-cursor>About</a>
      <a href="/contact" class="pill" data-cursor>Book a call</a>
    </nav>
  </div>
</header>
```

- `header{position:fixed;top:0;z-index:100}`; gains `header.scrolled` (darker bg + bottom gold hairline) after 40px scroll — handled by JS in the shell.
- `nav.main` is a flex row of UPPERCASE Montserrat links (`--silver`, gold underline on hover). Last link uses `.pill`.
- Mobile (`max-width:820px`): `.burger` shows, `nav.main` becomes a fixed right-side slide-in panel toggled by `nav.main.open`. JS wired in shell.
- **Edit nav link list per page** by changing the `<a>` items; keep the markup pattern.

---

## 4. Footer (already in `_shell.html`)

4-column grid: brand blurb (logo + tagline) + `Platform` / `Company` / `Connect` link columns, then a `.foot-bottom` copyright row. Edit link lists as needed; keep structure.

```html
<footer>
  <div class="container">
    <div class="foot-grid">
      <div class="foot-brand"><img src="Ahoosh_Vectore_Logo.png" alt="AHoosh.ai" /><p>…tagline…</p></div>
      <div class="foot-col"><h4>Platform</h4><a href="…" data-cursor>…</a>…</div>
      …Company / Connect columns…
    </div>
    <div class="foot-bottom"><span>© 2026 AHoosh.ai — All rights reserved.</span></div>
  </div>
</footer>
```

`footer{border-top:1px solid rgba(205,214,230,.1);padding:80px 0 40px;background:rgba(3,6,15,.6)}`

---

## 5. Buttons & pills

| Class | What | Notes |
|---|---|---|
| `.btn` | base button | Montserrat 700 UPPERCASE, `letter-spacing:.14em`, `padding:16px 34px`, `border-radius:40px` |
| `.btn.btn-gold` | primary CTA | gold→gold-lt gradient, navy text, gold glow shadow |
| `.btn.btn-ghost` | secondary | transparent, light border, white text |
| `.pill` | nav CTA chip | smaller (`12px 26px`), gold gradient, navy text — used for "Book a call" in nav |

Add `data-cursor` to any clickable so the custom cursor grows on hover.

Eyebrow + heading pattern inside the slot:
```html
<span class="label">Live Markets</span>
<h2 class="display" style="font-size:clamp(2rem,5vw,3.4rem)">Clear enough to act on</h2>
```

---

## 6. Cards & sections (background conventions)

- **Cards / list rows** → `.feed-item`: `border:1px solid rgba(205,214,230,.12)`, `border-radius:14px`, `padding:20px 24px`, translucent navy fill `rgba(10,20,48,.4)` + `backdrop-filter:blur(6px)`. This is the standard "glass card" look — reuse it for any card.
- **Full-bleed scroll panels** → `.panel` is `100vw × 100vh` flex-centered (homepage uses these for the scroll story; for ordinary pages you usually don't need it).
- **Section stacking** → `section{position:relative;z-index:2}` so content sits above the animated background. Wrap content in `<div class="container">` for the 1280px max width + 40px side padding.
- **Card radii seen**: cards `14px`, buttons/pills `40px`.
- **Accent borders/glows**: gold at low alpha — `rgba(224,169,63,.12)` for hairlines, `0 8px 30px rgba(224,169,63,.32)` for gold-button glow.

Standard section vertical padding: roughly `80–120px` top/bottom (footer uses `80px`). Keep generous whitespace; the theme is cinematic.

---

## 7. Background (already in `_shell.html`)

Two stacked layers, both fixed behind content:
1. `.bg-layers` → static glow / photo / vignette / grain divs.
2. `<canvas id="bg-canvas">` → WebGL **"Warped Ore"** domain-warped FBM shader (navy + gold, calm legible center). Needs `three.min.js` (already linked). Falls back to a static radial gradient when reduced-motion / no WebGL.
3. Drifting gold particles canvas is included too.

Don't add your own page background color — let the shader show through. Give content `position:relative; z-index:2+`.

---

## 8. Mobile breakpoint

Single breakpoint: **`@media (max-width:820px)`**.
- Header switches to burger + slide-in nav.
- Reduced-motion **and** ≤820px both set `document.body.classList.add('reduce')` and disable heavy animation (shader uses a static fallback; particles skip).
- Scale `.display` with `clamp()` so headings shrink gracefully.
- `.container` keeps 40px side padding — tighten to ~20px on mobile if needed.

---

## Quick start for a new page
1. `cp _shell.html mypage.html`
2. Edit `<title>` / `<meta description>` in the head.
3. Edit the nav link list + footer columns if they differ.
4. Replace `<!-- PAGE CONTENT GOES HERE -->` inside `<main id="page">` with your sections (`.container` > `.label` + `.display` + `.feed-item` cards + `.btn`).
5. That's it — header, footer, cursor, and animated background carry over automatically.
