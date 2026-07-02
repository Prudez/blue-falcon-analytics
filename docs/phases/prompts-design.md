# Design Prompts — Frontend Pages

Prompts for Claude Design. One per page, frontend-first. Claude Design starts from a blank canvas and does not read the project brief, so these are self-contained.

How to use:

- Design the app shell first, then each page. Within one Design session, later prompts can say "same shell and brand" and it holds.
- In a fresh Design session, prepend the Brand block so the look stays consistent.
- When a page mockup is approved, switch to `prompts-code.md` and use the design-to-code handoff line there, so Claude Code builds the page to match.

---

## Brand block (prepend in any fresh Design session)

```
Brand for all of these designs: deep navy as the primary color, on a light
off-white background, near-black text. Readable sans-serif in normal case
(Inter or similar) — this is a data tool, not a marketing page, so no all-caps
and no photo-forward layout. Chart series palette: navy, teal, amber, muted
purple, with green for positive deltas and red for negative. White cards with
subtle borders, soft shadows, rounded corners, generous spacing. Uncluttered
and trustworthy.
```

---

## 1. App shell and design system (do this first)

```
Design the app shell for an internal analytics dashboard, Blue Falcon
Analytics, in the style of a modern BI tool like Metabase.

[paste Brand block]

The shell only, no page content yet:
- A left sidebar nav with the product name at top and these items: Overview,
  Sales, Marketing, Listings. Show a selected state on Overview.
- A top header bar with the page title on the left and, on the right, a global
  date-range selector and an export button.
- The main content area is an empty card grid on the light background.

Show me the shell with the four nav items and the header controls in place.
Establish the card style, header typography, and nav styling here so every
page can reuse them.
```

## 2. Overview page (Phase 1)

```
Design the Overview page inside the shell. Same shell and brand.

Layout, top to bottom:
- A top row of 4 KPI cards: Active Listings, Under Offer, Sold, Leads Captured.
  Each shows a large number and a small up/down delta versus last period.
- Below, two cards side by side: a donut of listings by status, and a
  choropleth map of the Nairobi area / Kenya counties showing listings by
  location. This is a Kenya map, not a US map.
- A compact "recent leads" strip at the bottom: the five most recent leads
  with name, source, and date.

Keep it scannable. This is the landing page, so it should read at a glance.
```

## 3. Sales page (Phase 2)

```
Design the Sales page inside the shell. Same shell and brand.

Layout:
- A top row of KPI cards: Total Sales Value, Average Days on Market,
  Conversion Rate, Commission (period to date).
- A time-series card: leads and closings over time, bars for leads with a line
  for closings, monthly.
- A lead funnel card: Lead → Viewing → Offer → Closed, showing counts and
  drop-off between stages.
- Two breakdown cards side by side: sales value by price band, and sales by
  location.
- A full recent-leads table at the bottom with columns: name, property,
  location, source, stage, date.

Data-dense but still calm. Let the table breathe.
```

## 4. Marketing page (Phases 3 and 4)

Start with the single-platform version for phase 3, then evolve it in phase 4.

Phase 3, single platform:

```
Design the Marketing page inside the shell. Same shell and brand.

For now, one platform (Instagram):
- A top row of KPI cards: Reach, Engagement Rate, Followers, Posts (period).
  Each with a delta versus last period.
- A follower-trend line chart over time.
- An engagement-rate line chart over time.
- A "top posts" card: a small list of posts with thumbnail, date, and their
  reach and engagement side by side.

Include a platform selector in the header area of the page, currently showing
Instagram, so it is clear more platforms will slot in later.
```

Phase 4, unified cross-platform (iterate on the same page):

```
Now evolve the Marketing page to cover all platforms: Facebook, Instagram,
TikTok, X. Same shell and brand.

- The KPI cards become cross-platform totals, with a small per-platform
  breakdown under each number.
- Add a "reach and engagement by platform" grouped bar chart.
- Add a "share of voice" donut across platforms.
- Add the key card: Leads by Source, tying each platform to the sales leads it
  produced, so marketing connects to the pipeline.
- The platform selector becomes a filter: All platforms, or one.
```

## 5. Listings page (supporting)

```
Design the Listings page inside the shell. Same shell and brand.

- A filter row: status (available, under offer, sold), location, price band.
- A table of properties with columns: title, location, price (KES), status,
  days on market, and which platforms it is posted on (small platform icons).
- Clicking a row opens a detail panel on the right showing that property's
  platform links and its lead count.

Clean and utilitarian. This is the working list, not a showcase.
```

## 6. States and polish (Phase 5)

```
Same shell and brand. Show me these states as variations of the Overview page:
- Loading: skeleton placeholders in the KPI cards and charts.
- Empty: a card with no data yet, with a calm "no data for this range" message.
- The global date-range selector open, showing presets (last 7 days, last 30
  days, this quarter, custom).
Then show the export button's menu: PDF and CSV.
```
