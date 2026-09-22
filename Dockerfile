# syntax=docker/dockerfile:1

# ── Stage 1: dependencies ─────────────────────────────────────────────────────
FROM node:24-alpine AS deps
WORKDIR /opt/kiln
COPY package.json package-lock.json ./
COPY theme/package.json theme/
COPY runner/package.json runner/
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund \
 # npm installs both glibc AND musl native binaries: Alpine only uses musl.
 && find node_modules -mindepth 1 -maxdepth 2 -type d \
      \( -name '*-linux-*-gnu' -o -name '*-linux-*-gnueabihf' -o -name 'sharp-linux-*' -o -name 'sharp-libvips-linux-*' \) \
      -prune -exec rm -rf {} + \
 && find node_modules \( -name '*.md' -o -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' \) \
      -not -path '*/@astrojs/*' -not -path '*/astro/*' -type f -delete

# ── Stage 2: final image ──────────────────────────────────────────────────────
FROM node:24-alpine

LABEL org.opencontainers.image.title="kiln" \
      org.opencontainers.image.description="Unified documentation: Astro + Starlight + theme, driven by docs.yml" \
      org.opencontainers.image.source="https://github.com/Laidwin/kiln" \
      org.opencontainers.image.licenses="MIT"

# npm, npx, corepack and yarn are not needed at runtime.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn* /usr/local/bin/yarn*

ENV ASTRO_TELEMETRY_DISABLED=1 \
    KILN_PROJECT=/project \
    PORT=4321

WORKDIR /opt/kiln
COPY --from=deps /opt/kiln/node_modules node_modules
COPY package.json ./
COPY theme theme
COPY runner runner

# The internal Astro project is generated at startup: it must stay writable
# even when the container runs with --user "$(id -u):$(id -g)".
RUN mkdir -p runner/.app && chmod -R a+rwX runner/.app \
 && ln -s /opt/kiln/runner/cli.mjs /usr/local/bin/kiln

WORKDIR /project
EXPOSE 4321
ENTRYPOINT ["node", "/opt/kiln/runner/cli.mjs"]
CMD ["build"]
