import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'astro/zod';
import { isMap, isSeq, LineCounter, parseDocument } from 'yaml';

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
	const result = docsConfigSchema.safeParse(raw);
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
