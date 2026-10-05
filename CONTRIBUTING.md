# Contributing to Kiln

This guide is for people working on Kiln itself. To use Kiln in your project, see the [README](README.md).

## Repository layout

```text
.
├── theme/                  @laidwin/kiln-theme: Starlight plugin, self-contained
│   ├── index.mjs           plugin entry: styles, component overrides, Expressive Code, accent
│   ├── expressive-code.mjs code block settings
│   ├── components/         Starlight component overrides (ThemeSelect, Head)
│   ├── fonts/              trimmed Inter and its build script
│   └── styles/             CSS; tokens.css holds every design token
├── runner/                 @laidwin/kiln-runner: the `kiln` CLI
│   ├── cli.mjs             build | serve | validate
│   ├── lib/                docs.yml schema, config generation, sidebar, Markdown plugins
│   └── template/           skeleton of the internal Astro project
├── example/                Kiln's own documentation site
├── Dockerfile              multi-stage image (node:24-alpine)
├── action.yml              composite action
└── .github/workflows/
    ├── pages.yml           reusable workflow: build + deploy to GitHub Pages
    └── ci.yml              tests, image publishing, showcase deployment
```

## Developing the theme

The theme is a regular Starlight plugin in `theme/`, with no dependency on the runner, so it can be published to npm on its own later.

- **Design tokens:** colors, typography, spacing, radii, shadows and motion live in [`theme/styles/tokens.css`](theme/styles/tokens.css). The other stylesheets only consume tokens.
- **Accent:** the plugin injects `--th-accent-source`; text, fill and tint variants are derived in CSS with OKLCH, clamped to keep WCAG AA contrast.
- **Cascade:** Starlight's styles live in cascade layers; the theme's are unlayered, so they win without specificity tricks.
- **Components:** `ThemeSelect` (a compact light/dark/auto toggle) and `Head` (font loading) are overridden. Add overrides in `theme/components/` and register them in `theme/index.mjs`.
- **Fonts:** the theme ships a trimmed Inter (`theme/fonts/inter-kiln.woff2`, 28 kB: weights 400–700, Latin-1), rebuilt with [`theme/fonts/build.sh`](theme/fonts/build.sh). It is loaded after the first paint on a visitor's first page, over a fallback with matched metrics, which keeps mobile Lighthouse performance above 95 with no layout shift. Code uses the system monospace font. Inter is licensed under the [SIL Open Font License](theme/fonts/OFL-Inter.txt).

Work on it with live reload, either with Node 22.12+ installed:

```sh
npm install
npm run serve:example    # http://localhost:4321
npm run build:example
```

or entirely in Docker, rebuilding the image after each theme change:

```sh
docker build -t kiln:dev .
docker run --rm -p 4321:4321 -v "$PWD/example":/project kiln:dev serve
```

Before submitting a change, check the example site in light and dark modes, on mobile and desktop, and audit the built site, for example with `npx @axe-core/cli` and `npx lighthouse` (serve `example/site` with gzip enabled, as GitHub Pages does).

## Releasing

Releases are driven by git tags. The [CI workflow](.github/workflows/ci.yml):

| Event | Image tags pushed to `ghcr.io/laidwin/kiln` |
| ----- | ------------------------------------------- |
| Pull request | none (build and test only) |
| Push to `main` | `edge`, `sha-<commit>`; the showcase site is redeployed |
| Tag `v1.2.3` | `v1.2.3`, `v1.2`, `v1`, `latest` (linux/amd64 and linux/arm64) |

To release:

```sh
git tag v1.2.3
git push origin v1.2.3
```

The workflow also moves the `v1.2` and `v1` git tags to the release, so projects using `Laidwin/kiln/.github/workflows/pages.yml@v1` or `Laidwin/kiln@v1` pick it up. `v0.x` releases get no `v0` tag.

Follow semantic versioning: a change that requires projects to edit their `docs.yml` or workflow is a new major version. When releasing a new major, update the default `image` in `.github/workflows/pages.yml` and `action.yml` to the new `vX` tag.

**First release only:** GHCR packages start private. After the first push, open the package settings on GitHub and set its visibility to **Public**, otherwise other repositories cannot pull the image.
