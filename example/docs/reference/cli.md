---
title: Command line
description: Commands, options and environment variables of the Kiln image.
sidebar:
  order: 2
---

Kiln runs as a Docker image. Mount your project at `/project` and pass a command:

```sh
docker run --rm -v "$PWD":/project ghcr.io/laidwin/kiln <command> [options]
```

## Commands

| Command    | Description |
| ---------- | ----------- |
| `build`    | Build the static site into `site/`. This is the default command. |
| `serve`    | Start the dev server on port 4321 with live reload. Publish the port with `-p 4321:4321`. |
| `validate` | Check `docs.yml` and exit, without building anything. |

## Options

| Option            | Default          | Description |
| ----------------- | ---------------- | ----------- |
| `--project <dir>` | `/project`       | Project to document. |
| `--out <dir>`     | `<project>/site` | Build output directory. |
| `--port <port>`   | `4321`           | Dev server port. |
| `--no-polling`    | none            | Disable file watcher polling in `serve`, for native Linux filesystems. |

## Environment variables

Pass them with `-e NAME=value`.

| Variable                | Default | Description |
| ----------------------- | ------- | ----------- |
| `KILN_BASE`             | `/`     | Base path, when `docs.yml` does not set `base`. |
| `KILN_SITE`             | none   | Public site URL, when `docs.yml` does not set `site`. |
| `KILN_POLLING`          | `true`  | Set to `false` to disable file watcher polling. |
| `KILN_POLLING_INTERVAL` | `300`   | Polling interval, in milliseconds. |
| `KILN_LOG_LEVEL`        | `info`  | Astro log level: `debug`, `info`, `warn`, `error` or `silent`. |

## File ownership

On Linux, files written by a container belong to root by default. Kiln hands `site/` back to the owner of the mounted folder, or you can run the container as yourself:

```sh
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD":/project ghcr.io/laidwin/kiln build
```

## Exit codes

| Code | Meaning |
| ---- | ------- |
| `0`  | Success. |
| `1`  | Invalid `docs.yml`, missing `docs/` folder or failed build. |
