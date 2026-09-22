import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { autoSidebar, toStarlightSidebar } from './sidebar.mjs';

const UI = {
	fr: { label: 'Français', api: 'Référence API' },
	en: { label: 'English', api: 'API reference' },
};

/** Replace `target` with a symlink to `source` (or remove `target` when `source` is missing). */
function link(source, target) {
	if (existsSync(target) || isDanglingLink(target)) {
		if (lstatSync(target).isSymbolicLink() && readlinkSync(target) === source && existsSync(source)) return;
		rmSync(target, { recursive: true, force: true });
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
	cpSync(templateDir, appDir, {
		recursive: true,
		filter: (src, dest) => statSync(src).isDirectory() || !existsSync(dest) || !readFileSync(src).equals(readFileSync(dest)),
	});

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
import { baseLinks, accessibility } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'markdown-plugins.mjs')).href)};
import { apiIndex, onBuildWarning } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'vite-plugins.mjs')).href)};

const astro = ${JSON.stringify(astro, null, '\t')};
const starlightConfig = ${JSON.stringify(starlight, null, '\t')};

astro.vite.plugins = ${hasApi && mode === 'dev' ? `[apiIndex(${JSON.stringify({ apiDir, base })})]` : '[]'};
astro.vite.build = { rollupOptions: { onwarn: onBuildWarning } };

export default defineConfig({
	...astro,
	markdown: { processor: satteri({ hastPlugins: [baseLinks(astro.base), accessibility(${JSON.stringify(locale)})] }) },
	integrations: [
		starlight({
			...starlightConfig,
			plugins: [theme(${JSON.stringify({ accent: config.accent })})],
		}),
	],
});
`;
	// Only write when the content changes: in dev every write restarts Astro.
	const configFile = join(appDir, 'astro.config.mjs');
	if (!existsSync(configFile) || readFileSync(configFile, 'utf8') !== source) writeFileSync(configFile, source);

	return { base, hasApi, apiDir };
}
