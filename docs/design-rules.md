# Design Rules

Use this document when adding or changing UI so new features stay visually and structurally consistent with the app.

---

## Layout

- **Full screen width** — The interface uses the full width of the viewport; avoid fixed max-widths that create side margins on the main layout.
- **Fixed left menu column** — The left navigation is a fixed-width column; it does not scroll with the main content and stays in place. **Settings** uses the Phosphor `Gear` icon in the **lower left** of the menu (links to settings); main nav items are above it.
- **Flexible canvas area** — The main content area (canvas) sits to the right of the menu and flexes to use all remaining horizontal space. Content is laid out on an **8-column grid**.

---

## Background Colors

- **Menu column** — Dark grey (e.g. `#212121`). Use for the left navigation/sidebar only.
- **Canvas area** — Slightly lighter dark grey (e.g. `#282828`) for the main content area so it is subtly distinct from the menu.

---

## Typography

- **Font family** — JetBrains Mono (set on `body` in `frontend/src/index.css`).
- **Use semantic classes** — All typography uses CSS classes that combine size and color from design tokens. Changing `--color-text`, `--color-text-muted`, or font-size variables in `index.css` updates the app everywhere. Do not hardcode font sizes or text colors in components; use the classes below.
- **Full typography scale** — The **Design** page (`/design`) has a **Typography scale (all variations)** table that lists every class, a live sample, and “Used for”. Use that as the single reference when choosing which class to use.
- **Semantic classes (main canvas)**  
  - **Headings** — `.typography-h1` (20px), `.typography-h2` (16px), `.typography-h3` (14px), `.typography-h4` (12px). All use primary text color.  
  - **Body** — `.typography-body` (11px, primary); `.typography-body-muted` (11px, muted) for card body, descriptions, captions; `.typography-caption` and `.typography-label` (same size/color as body-muted) for captions and form labels.  
- **Panel typography** (dense UIs, e.g. PanelsTab) — Same color tokens; 14px: `.typography-panel-title`, `.typography-panel-body`, `.typography-panel-label`.  
- **Color only** — When size is set elsewhere (e.g. `text-xs`), use `.text-muted` for muted color so it still follows the token.

---

## Text Colors

- **Primary / main text** — White (`#FFFFFF`), via `--color-text`. Use semantic typography classes (e.g. `.typography-body`, `.typography-h1`) so one token change updates the app.
- **Secondary / muted text** — Light grey (`#A0A0A0`), via `--color-text-muted`. Use `.typography-body-muted`, `.typography-label`, `.typography-caption`, `.typography-panel-body`, `.typography-panel-label`, or `.text-muted` as appropriate.
- **Menu**
  - **Inactive items** — Grey (same as secondary/muted).
  - **Hover** — White.
  - **Active item** — White, with an accent (e.g. blue) to show selection (e.g. left border or underline).

---

## Accent Color

- **Active / selected state** — Blue (`#007AFF`) for:
  - Active menu item indicator (e.g. left border),
  - Active tab underline,
  - Primary actions (e.g. "Create" / main CTA) when using a solid button.

---

## Icons

Use **Phosphor Icons** exclusively so icons stay consistent across all UI elements (buttons, menu, cards, panels, etc.).

- **Source** — [Phosphor Icons](https://phosphoricons.com) ([GitHub](https://github.com/phosphor-icons/homepage)). 1,248+ icons; 6 weights: Thin, Light, **Regular**, Bold, Fill, Duotone.
- **Integration** — Use the package matching your stack: `@phosphor-icons/react`, `@phosphor-icons/vue`, or `@phosphor-icons/web` (vanilla). Tree-shaking is supported; import only the icons you use.
- **Weight** — Prefer **Regular** for most UI (menu, buttons, cards). Use **Bold** or **Fill** only when an icon needs emphasis (e.g. primary CTA). Keep weight consistent within a component type (e.g. all nav icons same weight).
- **Size** — Icons are designed at 16×16px and scale well. Match icon size to surrounding text: 16px for body, 20px for headings. Avoid mixing icon sizes within the same control.
- **Color** — Icons inherit text color. Use the same semantic tokens as typography: white for primary, muted grey for secondary. Accent (e.g. blue) for active/selected states.

---

## Buttons and Controls

- **Default / secondary buttons and filter-style controls** — Thin white outline (e.g. 1px), rounded corners, background matching the canvas (or transparent/dark). Text and icons in white or light grey. Use Phosphor Icons (see Icons section).
- **Primary action button** — Can use solid blue background, white text, rounded corners when the action is the main CTA (e.g. "Create a report").

---

## Cards

Cards are used to list items (e.g. episodes, characters, locations) in a consistent way across the app.

- **Container** — Same look everywhere: rounded corners, generous padding, a thin light border on a slightly raised background so the card sits gently on the canvas. On hover, the border is a bit brighter so the card feels responsive.
- **Size and layout** — Cards share the same padding and border radius and a uniform minimum height so they look consistent. Width is uniform within each row (the grid gives equal column widths). Within a row, all cards stretch to the same height as the tallest card in that row. List pages use the same grid: one column on small screens, two on medium, three on large, with a consistent gap between cards.
- **Title** — Each card has a main title (e.g. episode title, character name, location name) using `.typography-h3`, with optional badge (status or type) aligned to the right.
- **Description** — If the card shows a short description or subtitle, use `.typography-body-muted` and clamp to two lines so card heights stay predictable.
- **Thumbnails** — When a card shows reference images, show up to three thumbnails in a row at a fixed size; if there are more, show a "+N" counter in a small box that matches the card style (same border and muted background); counter text can use `.typography-body-muted`.
- **Actions** — Cards that are a single click target (e.g. open episode) use a pointer cursor on the whole card. Cards with Edit/Delete or other actions keep the same container style; action labels use body size (e.g. `.typography-body-muted`), muted by default and white on hover; delete is red with a lighter red on hover.
- **Badges** — Status or type badges (e.g. draft, character type) use the same padding and body font size (`text-body`); colours can stay semantic (e.g. green for complete, amber for in progress) as long as they fit the dark canvas.

---

## Summary Checklist

When implementing a new feature, check:

- [ ] Full-width layout with fixed left menu and flexible canvas (8-column grid).
- [ ] Menu column dark grey; canvas lighter dark grey.
- [ ] Typography: use semantic classes (e.g. `.typography-h1`, `.typography-body`, `.typography-body-muted`, `.typography-label`); see Design page typography table for the full list. No hardcoded font sizes or text colors.
- [ ] Main text white; secondary/muted grey (via tokens and semantic classes).
- [ ] Inactive menu grey; hover white; active white + blue accent.
- [ ] Icons use Phosphor Icons only; Regular weight for most UI; consistent size within each control type.
- [ ] Buttons use thin white outlines (or solid blue for primary CTA only).
- [ ] Cards use the same container style, title (`.typography-h3`), body/muted description (`.typography-body-muted`), and grid layout across Episodes, Characters, and Locations.
