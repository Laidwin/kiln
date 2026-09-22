#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, watchFile } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ConfigError, formatConfigError, loadDocsConfig } from './lib/schema.mjs';
import { prepareApp } from './lib/generate.mjs';
import { topLevelSignature } from './lib/sidebar.mjs';

process.env.ASTRO_TELEMETRY_DISABLED = '1';
// In a container Node runs as PID 1 and has no default signal handlers.
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(0));

const here = dirname(fileURLToPath(import.meta.url));
const templateDir = join(here, 'template');
const appDir = process.env.KILN_APP_DIR ?? join(here, '.app');

const USAGE = `Usage: kiln <command> [options]

Commands:
  build      Build the static site into <project>/site
  serve      Start the dev server with live reload
  validate   Check docs.yml without building anything

Options:
  --project <dir>       Project to document (default: /project, or $KILN_PROJECT)
  --out <dir>           Build output directory (default: <project>/site)
  --port <port>         Dev server port (default: 4321)
  --no-polling          Disable file watcher polling (serve)

Environment variables:
  KILN_BASE             Base path when docs.yml does not set one (used by the GitHub Action)
  KILN_SITE             Public site URL when docs.yml does not set one
  KILN_POLLING          "false" to disable polling (default: enabled for serve)
  KILN_POLLING_INTERVAL Polling interval in ms (default: 300)
`;

const log = (msg) => console.log(`\x1b[2mkiln ›\x1b[0m ${msg}`);
const fail = (msg) => {
	console.error(msg);
	process.exit(1);
};

let args;
try {
	args = parseArgs({
		allowPositionals: true,
		options: {
			project: { type: 'string' },
			out: { type: 'string' },
			port: { type: 'string' },
			'no-polling': { type: 'boolean' },
			help: { type: 'boolean', short: 'h' },
		},
	});
} catch (err) {
	fail(`${err.message}\n\n${USAGE}`);
}

const command = args.positionals[0];
if (args.values.help || !command || command === 'help') {
	console.log(USAGE);
	process.exit(command || args.values.help ? 0 : 1);
}
if (!['build', 'serve', 'validate'].includes(command)) fail(`Unknown command "${command}".\n\n${USAGE}`);

const projectDir = resolve(args.values.project ?? process.env.KILN_PROJECT ?? '/project');
const outDir = resolve(args.values.out ?? join(projectDir, 'site'));
if (args.values.port) process.env.PORT = args.values.port;
const polling = !args.values['no-polling'] && process.env.KILN_POLLING !== 'false';

function readConfig() {
	try {
		return loadDocsConfig(projectDir);
	} catch (err) {
		if (err instanceof ConfigError) return { error: formatConfigError(err) };
		throw err;
	}
}

function checkProject() {
	if (!existsSync(projectDir)) {
		fail(`Error: project directory not found: ${projectDir}\n  With Docker, mount your project: docker run -v "$PWD":/project …`);
	}
	if (!existsSync(join(projectDir, 'docs'))) {
		fail(`Error: no docs/ directory in ${projectDir}.\n  Create docs/index.md to get started.`);
	}
}

/** Under Docker (root), hand generated files back to the owner of the mounted project. */
function restoreOwnership(dir) {
	if (typeof process.getuid !== 'function' || process.getuid() !== 0) return;
	const { uid, gid } = statSync(projectDir);
	if (uid === 0) return;
	spawnSync('chown', ['-R', `${uid}:${gid}`, dir]);
}

/**
 * Recursive copy, file by file. `fs.cpSync` (native since Node 24) fails with EACCES
 * on Docker Desktop mounts (virtiofs); `copyFileSync` works everywhere.
 */
function copyDir(src, dest) {
	mkdirSync(dest, { recursive: true });
	for (const entry of readdirSync(src, { withFileTypes: true })) {
		const from = join(src, entry.name);
		const to = join(dest, entry.name);
		if (entry.isDirectory()) copyDir(from, to);
		else if (entry.isFile() || statSync(from).isFile()) copyFileSync(from, to);
	}
}

function emptyDir(dir) {
	mkdirSync(dir, { recursive: true });
	// Empty the directory without removing it: it may be a mount point.
	for (const entry of readdirSync(dir)) rmSync(join(dir, entry), { recursive: true, force: true });
}

const initial = readConfig();
if (initial.error) fail(initial.error);
if (command === 'validate') {
	log(`docs.yml is valid (${initial.title})`);
	process.exit(0);
}
checkProject();

const mode = command === 'serve' ? 'dev' : 'build';
mkdirSync(appDir, { recursive: true });
const prepared = prepareApp({ config: initial, projectDir, appDir, templateDir, mode, polling });

// Astro writes temporary build files relative to the working directory:
// run from the internal app so nothing is ever written into the user's project.
process.chdir(appDir);
// Astro disables HMR when NODE_ENV=production, so set it per command.
process.env.NODE_ENV = mode === 'dev' ? 'development' : 'production';
const astro = await import('astro');

if (command === 'build') {
	log(`Building "${initial.title}" (base ${prepared.base})`);
	const dist = join(appDir, 'dist');
	rmSync(dist, { recursive: true, force: true });
	try {
		await astro.build({ root: appDir, logLevel: process.env.KILN_LOG_LEVEL ?? 'info' });
	} catch (err) {
		fail(`\nError: build failed: ${err.message}${err.hint ? `\n\n${err.hint}` : ''}`);
	}
	emptyDir(outDir);
	copyDir(dist, outDir);
	if (prepared.hasApi) {
		copyDir(prepared.apiDir, join(outDir, 'api'));
		log('API reference copied to /api/');
	}
	restoreOwnership(outDir);
	log(`Site written to ${outDir}`);
	process.exit(0);
}

// serve
log(`Dev server for "${initial.title}"${polling ? ' (file watcher polling enabled)' : ''}`);
await astro.dev({ root: appDir, logLevel: process.env.KILN_LOG_LEVEL ?? 'info' });

// docs.yml and the top-level tree feed astro.config.mjs: regenerate it when they change,
// and Astro restarts on its own when it detects the config change.
let signature = topLevelSignature(join(projectDir, 'docs'));
const regenerate = (reason) => {
	const config = readConfig();
	if (config.error) {
		console.error(`${config.error}  (keeping the previous configuration)`);
		return;
	}
	log(`${reason}, updating configuration`);
	prepareApp({ config, projectDir, appDir, templateDir, mode, polling });
};
watchFile(join(projectDir, 'docs.yml'), { interval: 500 }, () => regenerate('docs.yml changed'));
setInterval(() => {
	const next = topLevelSignature(join(projectDir, 'docs'));
	if (next !== signature) {
		signature = next;
		regenerate('docs/ tree changed');
	}
}, 1000).unref();
