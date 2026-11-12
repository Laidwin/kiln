---
title: Writing content
description: Headings, lists, tables, quotes and links in Markdown.
sidebar:
  order: 1
---

All content is written in standard Markdown (`.md`) or MDX (`.mdx`, Markdown with components). This page shows how each basic element renders.

## Headings

Level 2 and 3 headings appear in the table of contents on the right.

### A level 3 heading

Body text stays readable thanks to a limited line length and generous line height. Important words can be **bold**, *italic* or ~~struck through~~, and inline code is written `like this`. A key is written <kbd>⌘</kbd> + <kbd>K</kbd>.

#### A level 4 heading

Level 4 headings and below do not appear in the table of contents.

## Lists

Bulleted list:

- Markdown and MDX pages
- Navigation generated from folders
  - one group per subfolder
  - ordered with `sidebar.order`
- Full-text search

Numbered list:

1. Write a page
2. Preview it
3. Publish it

Task list:

- [x] Write the documentation
- [x] Add examples
- [ ] Generate the API reference

## Tables

| Front matter key | Type      | Default    | Description                                   |
| ---------------- | --------- | ---------- | --------------------------------------------- |
| `title`          | `string`  | none      | Page title, shown as the `<h1>`.              |
| `description`    | `string`  | none      | Summary used by search engines and previews.  |
| `sidebar.order`  | `number`  | none      | Position of the page in its sidebar group.    |
| `sidebar.badge`  | `string`  | none      | Small badge next to the sidebar link.         |

## Quotes

> Simplicity is the ultimate sophistication.
>
> *Attributed to Leonardo da Vinci*

## Links

- Internal link: [Getting started](/getting-started/)
- Relative link to a file, as on GitHub: [Customizing](./customizing.md)
- Link to an anchor: [the Tables section](#tables)
- Link to a section on another page: [`docs.yml` options](/reference/configuration/#options)
- External link: [Markdown Guide](https://www.markdownguide.org/)

---

A horizontal rule separates the sections above from this footnote[^1].

[^1]: Footnotes are gathered at the end of the document.

## Portable Markdown

The same files read well on the site, on GitHub and in an editor:

- **Relative links to files** such as `[Customizing](./customizing.md#fonts)` become links to the right page.
- **GitHub alerts** become asides:

  ```md
  > [!TIP]
  > Written like this on GitHub, shown as a tip here.
  ```

  `NOTE` and `IMPORTANT` give a note, `TIP` a tip, `WARNING` a caution and `CAUTION` a danger aside.
- **A page without `title`** in its front matter takes its first `# Heading` as title, and that heading is not shown twice.

Files that live outside `docs/`, such as `CHANGELOG.md`, are published with `include` in `docs.yml`:

```yaml title="docs.yml"
include:
  - { file: CHANGELOG.md, slug: changelog }
```

