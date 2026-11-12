---
title: Customizing
description: Change the accent color, palette, fonts, logo, navigation and language of your site.
sidebar:
  order: 7
---

Kiln's theme is deliberately restrained: one accent color, neutral grays, automatic light and dark modes. Everything is set in `docs.yml`, never in code.

## Accent color

```yaml title="docs.yml"
accent: "#0ea5e9"
```

Every accent shade (links, active states, focus rings, buttons) is derived from this single color. Kiln adjusts its lightness where needed so text stays readable with WCAG AA contrast, even with yellow or light green.

## Colors

To match your brand beyond the accent, replace the theme's palette for light mode, dark mode or both:

```yaml title="docs.yml"
theme:
  light:
    background: "#ffffff"
    surface: "#f5f5f7"
    text: "#1d1d1f"
    mutedText: "#6e6e73"
    border: "#e3e3e8"
  dark:
    background: "#121212"
    surface: "#1e1e1e"
    text: "#f5f5f7"
    mutedText: "#b3b3b3"
    border: "#333333"
```

| Color | Used for |
| ----- | -------- |
| `background` | Page, header and sidebar |
| `surface` | Code blocks and secondary areas |
| `text` | Body text; hover and inline code shades derive from it |
| `mutedText` | Descriptions, captions, inactive navigation |
| `border` | Borders of tables, cards and fields |

Every color is optional: the ones you leave out keep Kiln's values. Kiln checks that `text` and `mutedText` stay readable on `background` and `surface` (4.5:1, WCAG AA) and rejects the configuration otherwise, with the measured contrast.

## Fonts

Kiln uses Inter for text and the system's monospace font for code. To use your own typefaces, give `.woff2` files for the body text, the headings, the code, or any of them:

```yaml title="docs.yml"
fonts:
  heading: docs/assets/fonts/display.woff2       # one file: a variable font, or a single weight
  body:
    - { file: docs/assets/fonts/text-400.woff2, weight: 400 }
    - { file: docs/assets/fonts/text-700.woff2, weight: 700 }
    - { file: docs/assets/fonts/text-400-italic.woff2, weight: 400, style: italic }
  mono: docs/assets/fonts/code.woff2
```

Headings use the body font unless `heading` is set. Fonts are served with the site; check that their license allows it (the SIL Open Font License does). Convert other formats to `.woff2` first.

## Custom CSS

For an identity that goes beyond colors and fonts, add a stylesheet. It loads after the theme, so its rules win:

```yaml title="docs.yml"
css: docs/assets/brand.css
```

```css title="docs/assets/brand.css"
/* Headings in capitals, a colored band above the header. */
h1#_top,
.sl-markdown-content h2 {
	text-transform: uppercase;
}
.page > .header {
	border-top: 4px solid var(--th-accent);
}
```

The theme's design tokens (`--th-accent`, `--th-text`, `--th-bg`, `--th-font-heading`…) are available in it. Keep this file small: class names of the theme and of Starlight may change between versions, and Kiln cannot check the contrast of colors set here.

## Logo

A relative path to an image. An SVG logo is also used as the favicon.

```yaml title="docs.yml"
logo: docs/assets/logo.svg
```

Use separate files for light and dark modes, and hide the title if the logo already contains it:

```yaml title="docs.yml"
logo:
  light: docs/assets/logo-light.svg
  dark: docs/assets/logo-dark.svg
  replacesTitle: true
```

## Navigation

By default the sidebar mirrors `docs/`: pages at the root first, then one group per folder. Order pages with `sidebar.order` in their front matter. To take full control, list the entries in `docs.yml`:

```yaml title="docs.yml"
sidebar:
  - getting-started
  - label: Guides
    autogenerate:
      directory: guides
  - label: Changelog
    link: https://github.com/Laidwin/kiln/releases
```

### Header links

`nav` adds links to the header, next to the search, for the main sections of a large site. An entry with `items` opens a small menu:

```yaml title="docs.yml"
nav:
  - { label: Guides, link: /guides/writing-content/ }
  - { label: Reference, link: /reference/configuration/ }
  - label: "1.2"
    items:
      - { label: Releases, link: https://github.com/Laidwin/kiln/releases }
```

Links are site paths (the base path is added for you) or full URLs. On small screens, they move into the menu with the social icons.

## Language

The interface (search, table of contents, navigation labels) is available in English and French:

```yaml title="docs.yml"
locale: fr
```

## Edit links

Add an "Edit page" link at the bottom of every page, pointing to your repository:

```yaml title="docs.yml"
editLink: https://github.com/<owner>/<repo>/edit/main/
```

Without `editLink`, as on this site, no page shows the link. To hide it on a single page only, add `editUrl: false` to its front matter.
