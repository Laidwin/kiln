---
title: Customizing
description: Change the accent color, logo, navigation and language of your site.
sidebar:
  order: 7
---

Kiln's theme is deliberately restrained: one accent color, neutral grays, automatic light and dark modes. Everything is set in `docs.yml`, never in code.

## Accent color

```yaml title="docs.yml"
accent: "#0ea5e9"
```

Every accent shade (links, active states, focus rings, buttons) is derived from this single color. Kiln adjusts its lightness where needed so text stays readable with WCAG AA contrast, even with yellow or light green.

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
