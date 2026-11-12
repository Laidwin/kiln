import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'astro/zod';
import { isMap, isSeq, LineCounter, parseDocument } from 'yaml';
import { COLOR_NAMES, contrastProblems } from '@laidwin/kiln-theme/colors.mjs';
import { OpenApiError, readOpenApi } from './openapi.mjs';

export class ConfigError extends Error {
	constructor(file, problems) {
		super(`${file} is invalid`);
		this.file = file;
		this.problems = problems;
	}
}

const SOCIAL_ICONS = [
	'github', 'gitlab', 'bitbucket', 'codeberg', 'forgejo', 'azureDevOps', 'discord', 'slack',
	'microsoftTeams', 'mastodon', 'blueSky', 'x.com', 'twitter', 'linkedin', 'youtube', 'stackOverflow',
	'npm', 'rss', 'email', 'telegram', 'matrix', 'zulip', 'discourse', 'reddit',
];

const SOCIAL_LABELS = {
	github: 'GitHub', gitlab: 'GitLab', bitbucket: 'Bitbucket', codeberg: 'Codeberg', forgejo: 'Forgejo',
	azureDevOps: 'Azure DevOps', discord: 'Discord', slack: 'Slack', microsoftTeams: 'Microsoft Teams',
	mastodon: 'Mastodon', blueSky: 'Bluesky', 'x.com': 'X', twitter: 'Twitter', linkedin: 'LinkedIn',
	youtube: 'YouTube', stackOverflow: 'Stack Overflow', npm: 'npm', rss: 'RSS', email: 'E-mail',
	telegram: 'Telegram', matrix: 'Matrix', zulip: 'Zulip', discourse: 'Discourse', reddit: 'Reddit',
};

const nonEmpty = () => z.string({ error: 'must be a string' }).trim().min(1, 'must not be empty');

const hexColor = z
	.string({ error: 'must be a quoted hex color, e.g. "#f76b15"' })
	.regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, 'must be a hex color (#rgb or #rrggbb), e.g. "#f76b15"');

const relativePath = () =>
	nonEmpty().refine((p) => !p.startsWith('/') && !/^[a-z]+:\/\//i.test(p), 'must be a path relative to docs.yml (e.g. "docs/assets/logo.svg")');

const url = () => z.string({ error: 'must be a URL' }).url('must be a full URL (https://…)');

const logo = z.union(
	[
		relativePath(),
		z.strictObject({
			light: relativePath(),
			dark: relativePath(),
			alt: z.string().optional(),
			replacesTitle: z.boolean().optional(),
		}),
		z.strictObject({
			src: relativePath(),
			alt: z.string().optional(),
			replacesTitle: z.boolean().optional(),
		}),
	],
	{ error: 'must be a relative path, or an object { src } / { light, dark } with optional alt and replacesTitle' },
);

const socialLink = z.strictObject({
	icon: z.enum(SOCIAL_ICONS, { error: `unknown icon. Allowed values: ${SOCIAL_ICONS.join(', ')}` }),
	label: z.string().optional(),
	href: url(),
});

const social = z.union(
	[
		z.array(socialLink),
		z.partialRecord(
			z.enum(SOCIAL_ICONS, { error: `unknown icon. Allowed values: ${SOCIAL_ICONS.join(', ')}` }),
			url(),
		),
	],
	{ error: 'must be a list of { icon, href, label? } or an icon → URL map (e.g. github: https://github.com/…)' },
);

const sidebarItem = z.lazy(() =>
	z.union(
		[
			nonEmpty(),
			z.strictObject({ slug: nonEmpty(), label: z.string().optional(), badge: z.string().optional() }),
			z.strictObject({ label: nonEmpty(), link: nonEmpty(), badge: z.string().optional() }),
			z.strictObject({
				label: nonEmpty(),
				collapsed: z.boolean().optional(),
				autogenerate: z.strictObject({ directory: nonEmpty(), collapsed: z.boolean().optional() }),
			}),
			z.strictObject({ label: nonEmpty(), collapsed: z.boolean().optional(), items: z.array(sidebarItem) }),
		],
		{
			error:
				'invalid sidebar entry. Accepted forms: "path/to/page", { slug }, { label, link }, { label, items: [...] } or { label, autogenerate: { directory } }',
		},
	),
);

const palette = z.strictObject(Object.fromEntries(COLOR_NAMES.map((name) => [name, hexColor.optional()])), {
	error: `must be a map of colors: ${COLOR_NAMES.join(', ')}`,
});

const theme = z.strictObject(
	{ light: palette.optional(), dark: palette.optional() },
	{ error: 'must be a map with light and/or dark colors, e.g. { dark: { background: "#000000" } }' },
);

const apiReference = z.strictObject(
	{
		python: relativePath().optional(),
		exclude: z.array(nonEmpty(), { error: 'must be a list of module names, e.g. [my_package.internal]' }).optional(),
		openapi: relativePath().optional(),
		server: url().optional(),
	},
	{ error: 'must be a map, e.g. { python: api.json } or { openapi: docs/openapi.yaml }' },
);

const fontFile = z.union(
	[
		relativePath(),
		z.strictObject({
			file: relativePath(),
			weight: z.union([z.number(), z.string()], { error: 'must be a weight, e.g. 400 or "100 900"' }).optional(),
			style: z.enum(['normal', 'italic'], { error: 'must be "normal" or "italic"' }).optional(),
		}),
	],
	{ error: 'must be a .woff2 path, or { file, weight?, style? }' },
);

const fontRole = z.union([fontFile, z.array(fontFile)], {
	error: 'must be a .woff2 path, or a list of files with their weight, e.g. [{ file: docs/assets/fonts/x-700.woff2, weight: 700 }]',
});

const fonts = z.strictObject(
	{ body: fontRole.optional(), heading: fontRole.optional(), mono: fontRole.optional() },
	{ error: 'must be a map with body, heading and/or mono fonts' },
);

const navLink = z.strictObject({ label: nonEmpty(), link: nonEmpty() });

const navItem = z.union(
	[navLink, z.strictObject({ label: nonEmpty(), items: z.array(navLink, { error: 'must be a list of { label, link }' }) })],
	{ error: 'must be { label, link } or { label, items: [{ label, link }, ...] }' },
);

const includeEntry = z.strictObject(
	{
		file: relativePath(),
		slug: z
			.string({ error: 'must be a page path, e.g. "changelog"' })
			.regex(/^[a-z0-9][a-z0-9\-_]*(?:\/[a-z0-9][a-z0-9\-_]*)*$/, 'must be a lowercase page path without extension or leading "/", e.g. "project/changelog"'),
	},
	{ error: 'must be a map { file, slug }, e.g. { file: CHANGELOG.md, slug: changelog }' },
);

const basePath = z
	.string({ error: 'must be a string, e.g. "/my-project"' })
	.regex(/^\/[\w\-./~]*$/, 'must start with "/" and contain only plain URL characters, e.g. "/my-project"');

export const docsConfigSchema = z.strictObject(
	{
		title: nonEmpty(),
		description: z.string({ error: 'must be a string' }).optional(),
		logo: logo.optional(),
		accent: hexColor.optional(),
		locale: z.enum(['en', 'fr'], { error: 'must be "en" or "fr"' }).default('en'),
		base: basePath.optional(),
		site: url().optional(),
		social: social.optional(),
		sidebar: z.array(sidebarItem, { error: 'must be a list of entries' }).optional(),
		editLink: url().optional(),
		poweredBy: z.boolean({ error: 'must be true or false' }).optional(),
		theme: theme.optional(),
		api: apiReference.optional(),
		include: z.array(includeEntry, { error: 'must be a list of { file, slug }' }).optional(),
		fonts: fonts.optional(),
		css: relativePath().optional(),
		nav: z.array(navItem, { error: 'must be a list of { label, link } or { label, items }' }).optional(),
	},
	{ error: 'docs.yml must contain a map of keys (title, description, …)' },
);

export const KNOWN_KEYS = Object.keys(docsConfigSchema.shape);

/** Find the YAML line matching a zod error path, to point the user at the right place. */
function lineFor(doc, lineCounter, path) {
	let node = doc.contents;
	let last = node;
	for (const key of path) {
		if (isMap(node)) {
			const pair = node.items.find((p) => (p.key?.value ?? p.key) === key);
			if (!pair) break;
			last = pair.key ?? pair.value;
			node = pair.value;
		} else if (isSeq(node) && typeof key === 'number') {
			node = node.items[key];
		} else break;
		if (node) last = node;
	}
	const offset = last?.range?.[0];
	return offset === undefined ? undefined : lineCounter.linePos(offset).line;
}

function formatPath(path) {
	return path.reduce((acc, k) => (typeof k === 'number' ? `${acc}[${k}]` : acc ? `${acc}.${k}` : String(k)), '');
}

/** For each failed union, keep the error from the branch closest to what the user wrote. */
function flattenIssues(issues, prefix = []) {
	const out = [];
	for (const issue of issues) {
		const path = [...prefix, ...issue.path];
		if (issue.code === 'invalid_union' && issue.errors?.length) {
			const branches = issue.errors.map((errs) => flattenIssues(errs, path));
			// A branch that only fails deeper down (not on the type itself) is the most relevant one.
			const deep = branches.filter((b) => b.every((i) => i.path.length > path.length));
			if (deep.length === 1) {
				out.push(...deep[0]);
				continue;
			}
		}
		const missing = issue.code === 'invalid_type' && issue.input === undefined;
		out.push({ path, message: missing ? 'is required' : issue.message, code: issue.code, keys: issue.keys });
	}
	return out;
}

export function loadDocsConfig(projectDir) {
	const file = resolve(projectDir, 'docs.yml');
	if (!existsSync(file)) {
		throw new ConfigError('docs.yml', [
			{
				message: `file not found in ${projectDir}. Create a minimal docs.yml:\n\n      title: My project\n      description: Documentation for my project`,
			},
		]);
	}

	const source = readFileSync(file, 'utf8');
	const lineCounter = new LineCounter();
	const doc = parseDocument(source, { lineCounter, prettyErrors: true });
	if (doc.errors.length) {
		throw new ConfigError(
			'docs.yml',
			doc.errors.map((e) => ({ line: e.linePos?.[0]?.line, message: `malformed YAML: ${e.message.split('\n')[0]}` })),
		);
	}

	const raw = doc.toJS() ?? {};
	const result = docsConfigSchema.safeParse(raw, { reportInput: true });
	if (!result.success) {
		const problems = flattenIssues(result.error.issues).map((issue) => {
			if (issue.code === 'unrecognized_keys' && issue.path.join('.') === 'social') {
				return {
					line: lineFor(doc, lineCounter, [...issue.path, issue.keys[0]]),
					message: `social: unknown icon ${issue.keys.map((k) => `"${k}"`).join(', ')}. Available icons: ${SOCIAL_ICONS.join(', ')}`,
				};
			}
			if (issue.code === 'unrecognized_keys') {
				return {
					line: lineFor(doc, lineCounter, [...issue.path, issue.keys[0]]),
					message: `unknown key${issue.keys.length > 1 ? 's' : ''} ${issue.keys
						.map((k) => `"${k}"`)
						.join(', ')}${issue.path.length ? ` in ${formatPath(issue.path)}` : ''}. Allowed keys: ${
						issue.path.length ? 'see the README' : KNOWN_KEYS.join(', ')
					}`,
				};
			}
			const where = formatPath(issue.path);
			return { line: lineFor(doc, lineCounter, issue.path), message: where ? `${where}: ${issue.message}` : issue.message };
		});
		throw new ConfigError('docs.yml', problems);
	}

	const config = result.data;
	const problems = [];
	const logoPaths = typeof config.logo === 'string' ? [config.logo] : config.logo ? [config.logo.src, config.logo.light, config.logo.dark].filter(Boolean) : [];
	for (const p of logoPaths) {
		if (!existsSync(resolve(projectDir, p))) {
			problems.push({ line: lineFor(doc, lineCounter, ['logo']), message: `logo: file not found "${p}" (path relative to docs.yml)` });
		}
	}
	for (const { mode, pair, ratio } of contrastProblems(config.theme)) {
		problems.push({
			line: lineFor(doc, lineCounter, ['theme', mode]) ?? lineFor(doc, lineCounter, ['theme']),
			message: `theme.${mode}: ${pair} has a contrast of ${ratio}:1, below the 4.5:1 needed to read it comfortably (WCAG AA). Darken or lighten one of the two colors.`,
		});
	}
	if (config.api && !config.api.python && !config.api.openapi) {
		problems.push({ line: lineFor(doc, lineCounter, ['api']), message: 'api: set python (a griffe dump) or openapi (an OpenAPI description)' });
	}
	if (config.api?.openapi) {
		const line = lineFor(doc, lineCounter, ['api', 'openapi']);
		const file = resolve(projectDir, config.api.openapi);
		if (!existsSync(file)) problems.push({ line, message: `api.openapi: file not found "${config.api.openapi}" (path relative to docs.yml)` });
		else {
			try {
				readOpenApi(file);
			} catch (err) {
				if (!(err instanceof OpenApiError)) throw err;
				problems.push({ line, message: `api.openapi: ${config.api.openapi}: ${err.message}` });
			}
		}
		if (existsSync(resolve(projectDir, 'api'))) {
			problems.push({ line, message: 'api.openapi: an api/ folder also exists. Both are published under /api/: keep one of them.' });
		}
	}
	if (config.api?.python) {
		const line = lineFor(doc, lineCounter, ['api', 'python']);
		if (!existsSync(resolve(projectDir, config.api.python))) {
			problems.push({
				line,
				message: `api.python: file not found "${config.api.python}". Generate it with griffe, e.g.:\n\n      griffe dump my_package --docstyle google --full --output ${config.api.python}`,
			});
		}
		if (existsSync(resolve(projectDir, 'api'))) {
			problems.push({
				line,
				message: 'api.python: an api/ folder also exists. Both are published under /api/: keep one of them.',
			});
		}
	}
	for (const [role, entry] of Object.entries(config.fonts ?? {})) {
		[entry].flat().forEach((f, i) => {
			const file = typeof f === 'string' ? f : f.file;
			const line = lineFor(doc, lineCounter, ['fonts', role]);
			if (!/\.woff2$/i.test(file)) problems.push({ line, message: `fonts.${role}: "${file}" is not a .woff2 file (convert it with a tool such as fonttools or an online converter)` });
			else if (!existsSync(resolve(projectDir, file))) problems.push({ line, message: `fonts.${role}: file not found "${file}" (path relative to docs.yml)` });
		});
	}
	if (config.css) {
		const line = lineFor(doc, lineCounter, ['css']);
		if (!/\.css$/i.test(config.css)) problems.push({ line, message: `css: must be a .css file, got "${config.css}"` });
		else if (!existsSync(resolve(projectDir, config.css))) problems.push({ line, message: `css: file not found "${config.css}" (path relative to docs.yml)` });
	}
	(config.nav ?? []).forEach((item, i) => {
		for (const { link } of item.items ?? [item]) {
			if (!link.startsWith('/') && !/^https?:\/\//.test(link)) {
				problems.push({ line: lineFor(doc, lineCounter, ['nav', i]), message: `nav[${i}]: link "${link}" must be a site path starting with "/" (e.g. /guides/start/) or a full URL` });
			}
		}
	});
	(config.include ?? []).forEach(({ file, slug }, i) => {
		const line = lineFor(doc, lineCounter, ['include', i]);
		if (!/\.md$/i.test(file)) problems.push({ line, message: `include[${i}].file: must be a Markdown file (.md), got "${file}"` });
		else if (!existsSync(resolve(projectDir, file))) problems.push({ line, message: `include[${i}].file: file not found "${file}" (path relative to docs.yml)` });
		const clash = ['.md', '.mdx', '/index.md', '/index.mdx'].map((ext) => `docs/${slug}${ext}`).find((p) => existsSync(resolve(projectDir, p)));
		if (clash) problems.push({ line, message: `include[${i}].slug: "${slug}" is already the page ${clash}. Choose another slug.` });
	});
	if (problems.length) throw new ConfigError('docs.yml', problems);

	if (config.social && !Array.isArray(config.social)) {
		config.social = Object.entries(config.social).map(([icon, href]) => ({ icon, href }));
	}
	config.social = config.social?.map((s) => ({ ...s, label: s.label ?? SOCIAL_LABELS[s.icon] ?? s.icon }));

	return config;
}

export function formatConfigError(err) {
	const lines = [`\nError: ${err.message}:\n`];
	for (const p of err.problems) {
		lines.push(`  • ${p.line ? `[line ${p.line}] ` : ''}${p.message}`);
	}
	lines.push('\nSee the README ("docs.yml reference" section) for all options.\n');
	return lines.join('\n');
}
