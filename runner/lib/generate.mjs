import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { autoSidebar, toStarlightSidebar } from './sidebar.mjs';
import { loadPythonApi } from './python-api.mjs';
import { loadOpenApi } from './openapi.mjs';

const UI = {
	fr: { label: 'Français', api: 'Référence API' },
	en: { label: 'English', api: 'API reference' },
};

/** Replace `target` with a symlink to `source` (or remove `target` when `source` is missing). */
function link(source, target) {
	if (existsSync(target) || isDanglingLink(target)) {
		if (lstatSync(target).isSymbolicLink() && readlinkSync(target) === source && existsSync(source)) return;
		// rmSync leaves a dangling symlink in place (Node 24.0), so unlink links explicitly.
		if (lstatSync(target).isSymbolicLink()) unlinkSync(target);
		else rmSync(target, { recursive: true, force: true });
	}
	if (!existsSync(source)) return;
	mkdirSync(dirname(target), { recursive: true });
	symlinkSync(source, target, 'junction');
}

function isDanglingLink(path) {
	try {
		return lstatSync(path).isSymbolicLink();
	} catch {
		return false;
	}
}

function copyIfChanged(src, dest) {
	if (existsSync(dest) && readFileSync(src).equals(readFileSync(dest))) return;
	mkdirSync(dirname(dest), { recursive: true });
	cpSync(src, dest);
}

/** cpSync filter: skip files whose copy is already identical, so the dev watcher is not triggered. */
const unchanged = (src, dest) => statSync(src).isDirectory() || !existsSync(dest) || !readFileSync(src).equals(readFileSync(dest));

function writeIfChanged(file, content) {
	if (existsSync(file) && readFileSync(file, 'utf8') === content) return;
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, content);
}

const API_LABELS = {
	en: { python: 'Python API', openapi: 'REST API' },
	fr: { python: 'API Python', openapi: 'API REST' },
};

/**
 * Generated API references (docs.yml `api.python` and/or `api.openapi`): write the page models and add
 * the routes and their components, or remove them when the options are not set. Alone, a reference
 * lives under /api/; with both, the Python one keeps /api/ and the OpenAPI one moves to /api/rest/.
 * Returns the sidebar groups to add.
 */
function prepareApi({ config, projectDir, appDir, base, locale }) {
	const pagesDir = join(appDir, 'src', 'pages', 'api');
	const kinds = {
		python: { components: join(appDir, 'src', 'components', 'kiln-api'), model: join(appDir, 'src', 'kiln-api.json'), templates: join(import.meta.dirname, '..', 'api') },
		openapi: { components: join(appDir, 'src', 'components', 'kiln-openapi'), model: join(appDir, 'src', 'kiln-openapi.json'), templates: join(import.meta.dirname, '..', 'openapi') },
	};
	const active = Object.keys(kinds).filter((kind) => config.api?.[kind]);
	const both = active.length === 2;
	const specDir = join(appDir, 'public', 'kiln-openapi');
	for (const [name, k] of Object.entries(kinds)) {
		if (!active.includes(name)) for (const path of [k.components, k.model]) rmSync(path, { recursive: true, force: true });
	}
	if (!active.includes('openapi')) rmSync(specDir, { recursive: true, force: true });

	// Pages of every reference share src/pages/api: start again when the set of references changes.
	const marker = join(pagesDir, '.kiln-api');
	if (!existsSync(marker) || readFileSync(marker, 'utf8') !== active.join('+')) rmSync(pagesDir, { recursive: true, force: true });
	if (!active.length) return [];

	const sidebar = [];
	for (const kind of active) {
		const k = kinds[kind];
		const label = both ? (API_LABELS[locale] ?? API_LABELS.en)[kind] : undefined;
		let model;
		let routeDir = pagesDir;
		if (kind === 'python') {
			model = loadPythonApi({ file: resolve(projectDir, config.api.python), exclude: config.api.exclude, base, locale });
			if (both && model.pages.some((p) => p.slug === 'rest' || p.slug?.startsWith('rest/'))) {
				throw new Error('api: a Python package named "rest" collides with the REST API reference (/api/rest/) when api.openapi is also set. Exclude it or document the APIs separately.');
			}
			if (label) model.sidebar.label = label;
		} else {
			// The description itself is published too, for clients and code generators.
			const spec = resolve(projectDir, config.api.openapi);
			const specName = `openapi${extname(spec)}`;
			if (existsSync(specDir)) for (const name of readdirSync(specDir)) if (name !== specName) rmSync(join(specDir, name));
			copyIfChanged(spec, join(specDir, specName));
			const root = both ? '/api/rest' : '/api';
			if (both) routeDir = join(pagesDir, 'rest');
			model = loadOpenApi({ file: spec, server: config.api.server, base, locale, specUrl: `/kiln-openapi/${specName}`, root, label });
		}
		cpSync(join(k.templates, 'pages'), routeDir, { recursive: true, filter: unchanged });
		cpSync(join(k.templates, 'components'), k.components, { recursive: true, filter: unchanged });
		writeIfChanged(k.model, JSON.stringify({ pages: model.pages, labels: model.labels }));
		sidebar.push(model.sidebar);
	}
	writeIfChanged(marker, active.join('+'));
	return sidebar;
}

function copyAsset(projectDir, appDir, relPath, name) {
	const target = join(appDir, 'src', 'assets', `${name}${extname(relPath)}`);
	copyIfChanged(resolve(projectDir, relPath), target);
	return `./src/assets/${basename(target)}`;
}

/**
 * Prepare the internal Astro project (`appDir`) from the user's project:
 * links to docs/ and api/, logo, favicon and the generated astro.config.mjs.
 */
export function prepareApp({ config, projectDir, appDir, templateDir, mode, polling }) {
	// Copy the skeleton without touching identical files, so the dev watcher is not triggered.
	cpSync(templateDir, appDir, { recursive: true, filter: unchanged });

	const docsDir = join(projectDir, 'docs');
	const apiDir = join(projectDir, 'api');
	link(docsDir, join(appDir, 'src', 'content', 'docs'));
	// In dev the API is served from public/; on build it is copied afterwards so Pagefind does not index it.
	link(mode === 'dev' ? apiDir : '', join(appDir, 'public', 'api'));

	let logo;
	if (typeof config.logo === 'string') {
		logo = { src: copyAsset(projectDir, appDir, config.logo, 'logo'), alt: '' };
	} else if (config.logo) {
		const { src, light, dark, ...rest } = config.logo;
		logo = src
			? { ...rest, src: copyAsset(projectDir, appDir, src, 'logo') }
			: { ...rest, light: copyAsset(projectDir, appDir, light, 'logo-light'), dark: copyAsset(projectDir, appDir, dark, 'logo-dark') };
	}

	const favicon = typeof config.logo === 'string' && extname(config.logo) === '.svg' ? resolve(projectDir, config.logo) : null;
	if (favicon) copyIfChanged(favicon, join(appDir, 'public', 'favicon-project.svg'));
	else rmSync(join(appDir, 'public', 'favicon-project.svg'), { force: true });

	const locale = config.locale;
	const base = config.base ?? process.env.KILN_BASE ?? '/';
	const hasApi = existsSync(apiDir);
	const sidebar = config.sidebar ? toStarlightSidebar(config.sidebar) : autoSidebar(docsDir);
	if (hasApi) {
		sidebar.push({ label: UI[locale].api, link: '/api/', attrs: { 'data-api-link': '' } });
	}
	// Files published from outside docs/ (docs.yml `include`), read by src/content.config.ts.
	const includes = (config.include ?? []).map(({ file, slug }) => ({
		file: resolve(projectDir, file),
		id: slug,
		editUrl: config.editLink ? new URL(file, config.editLink.replace(/\/?$/, '/')).href : undefined,
	}));
	writeIfChanged(join(appDir, 'src', 'kiln-includes.json'), JSON.stringify(includes));

	sidebar.push(...prepareApi({ config, projectDir, appDir, base, locale }));

	// Project fonts (docs.yml `fonts`): copied to public/, served next to the site.
	const fontsDir = join(appDir, 'public', 'kiln-fonts');
	const fonts = {};
	const fontNames = new Set();
	for (const [role, entry] of Object.entries(config.fonts ?? {})) {
		fonts[role] = [entry].flat().map((f, i) => {
			const { file, weight, style } = typeof f === 'string' ? { file: f } : f;
			const name = `${role}-${i}.woff2`;
			fontNames.add(name);
			copyIfChanged(resolve(projectDir, file), join(fontsDir, name));
			return { url: `${base.replace(/\/$/, '')}/kiln-fonts/${name}`, weight, style };
		});
	}
	// Remove fonts dropped from docs.yml, without touching the others (the dev watcher sees every write).
	if (existsSync(fontsDir)) for (const name of readdirSync(fontsDir)) if (!fontNames.has(name)) rmSync(join(fontsDir, name));

	const starlight = {
		title: config.title,
		description: config.description,
		logo,
		favicon: favicon ? '/favicon-project.svg' : '/favicon.svg',
		social: config.social,
		sidebar,
		editLink: config.editLink ? { baseUrl: config.editLink } : undefined,
		routeMiddleware: './src/route-middleware.ts',
		locales: { root: { label: UI[locale].label, lang: locale } },
		defaultLocale: 'root',
		credits: false,
	};

	const astro = {
		site: config.site ?? process.env.KILN_SITE ?? undefined,
		base,
		trailingSlash: 'ignore',
		server: { host: '0.0.0.0', port: Number(process.env.PORT ?? 4321) },
		devToolbar: { enabled: false },
		vite: {
			// docs/ is a symlink: keep the internal path so MDX imports
			// (@astrojs/starlight/components…) resolve from the image's node_modules.
			resolve: { preserveSymlinks: true },
			server: {
				watch: polling ? { usePolling: true, interval: Number(process.env.KILN_POLLING_INTERVAL ?? 300) } : {},
				fs: { allow: [appDir, projectDir, resolve(appDir, '..', '..')] },
			},
		},
	};

	const source = `// Generated from docs.yml by the Kiln runner. Do not edit.
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import theme from '@laidwin/kiln-theme';
import { satteri } from '@astrojs/markdown-satteri';
import { accessibility, baseLinks, githubAlerts, leadingTitle, relativePageLinks } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'markdown-plugins.mjs')).href)};
import { apiIndex, onBuildWarning } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'vite-plugins.mjs')).href)};

const astro = ${JSON.stringify(astro, null, '\t')};
const starlightConfig = ${JSON.stringify(starlight, null, '\t')};

astro.vite.plugins = ${hasApi && mode === 'dev' ? `[apiIndex(${JSON.stringify({ apiDir, base })})]` : '[]'};
astro.vite.build = { rollupOptions: { onwarn: onBuildWarning } };

export default defineConfig({
	...astro,
	markdown: {
		processor: satteri({
			mdastPlugins: [githubAlerts(${JSON.stringify(locale)})],
			hastPlugins: [
				relativePageLinks(${JSON.stringify([join(appDir, 'src', 'content', 'docs'), docsDir])}),
				leadingTitle(),
				baseLinks(astro.base),
				accessibility(${JSON.stringify(locale)}),
			],
		}),
	},
	integrations: [
		starlight({
			...starlightConfig,
			plugins: [theme(${JSON.stringify({
				accent: config.accent,
				poweredBy: config.poweredBy,
				colors: config.theme,
				fonts,
				css: config.css ? [resolve(projectDir, config.css)] : [],
				nav: config.nav ?? [],
			})})],
		}),
	],
});
`;
	// Only write when the content changes: in dev every write restarts Astro.
	const configFile = join(appDir, 'astro.config.mjs');
	if (!existsSync(configFile) || readFileSync(configFile, 'utf8') !== source) writeFileSync(configFile, source);

	return { base, hasApi, apiDir };
}
