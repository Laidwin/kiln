---
title: Images and diagrams
description: Add images, screenshots and SVG diagrams.
sidebar:
  order: 4
---

Images placed in `docs/` are optimized at build time: resized, converted to modern formats and given explicit dimensions to avoid layout shifts. Reference them with a path relative to the page.

```md
![Alt text describing the image](../assets/screenshot.png)
```

## SVG diagram

![docs.yml and the docs folder go into the Kiln container, which writes a static site that GitHub Pages publishes](../assets/architecture.svg)

## Screenshot

![This site's Getting started page, with the sidebar on the left and the table of contents on the right](../assets/screenshot.png)

Always write alt text describing what the image shows: screen readers read it aloud, and it is displayed if the image fails to load.
