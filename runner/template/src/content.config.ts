import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { defineCollection } from 'astro:content';
import type { Loader } from 'astro/loaders';
import { docsLoader, i18nLoader } from '@astrojs/starlight/loaders';
import { docsSchema, i18nSchema } from '@astrojs/starlight/schema';

/**
 * Title of a page without a `title` in its front matter: its first level-1 heading, as GitHub shows it.
 * Inline Markdown (code, emphasis, links) is reduced to its text.
 */
function headingTitle(source: string): string | undefined {
	const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
	let fence: string | null = null;
	for (const line of body.split(/\r?\n/)) {
		const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
		if (marker) {
			if (!fence) fence = marker[0];
			else if (marker[0] === fence) fence = null;
			continue;
		}
		if (fence) continue;
		const match = /^#\s+(.+?)\s*#*\s*$/.exec(line);
		if (match) {
			return match[1]
				.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
				.replace(/[`*_]/g, '')
				.trim();
		}
	}
	return undefined;
}

/** Files published from outside docs/ (docs.yml `include`), written by the Kiln runner. */
const includes: { file: string; id: string }[] = JSON.parse(
	readFileSync(new URL('./kiln-includes.json', import.meta.url), 'utf8'),
);

type Context = Parameters<Loader['load']>[0];

/** Add an included Markdown file to the docs collection, as if it were a page of docs/. */
async function loadInclude(context: Context, { file, id }: { file: string; id: string }) {
	let source: string;
	try {
		source = readFileSync(file, 'utf8');
	} catch {
		context.logger.warn(`include: cannot read ${file}`);
		return;
	}
	const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
	const body = fm ? source.slice(fm[0].length) : source;
	let data: Record<string, unknown> = fm ? (parse(fm[1]) ?? {}) : {};
	if (data.title === undefined) data = { ...data, title: headingTitle(source) ?? id };
	const root = fileURLToPath(context.config.root);
	data = await context.parseData({ id, data, filePath: relative(root, file) });
	const rendered = await context.renderMarkdown(body, { fileURL: pathToFileURL(file) });
	context.store.set({ id, data, body, rendered, filePath: relative(root, file), digest: context.generateDigest(source) });
}

/**
 * Starlight's docs loader, with page titles taken from the first `# Heading` when missing,
 * and the files of docs.yml `include` added to the collection.
 */
function kilnDocsLoader(): Loader {
	const loader = docsLoader();
	return {
		...loader,
		load: async (context) => {
			await loader.load({
				...context,
				parseData: (entry) => {
					if (entry.data.title === undefined && entry.filePath) {
						try {
							const file = resolve(fileURLToPath(context.config.root), entry.filePath);
							const title = headingTitle(readFileSync(file, 'utf8'));
							if (title) entry = { ...entry, data: { ...entry.data, title } };
						} catch {
							// Unreadable file: Starlight reports the missing title itself.
						}
					}
					return context.parseData(entry);
				},
			});
			// After the glob loader, which removes the entries it did not find in docs/.
			for (const include of includes) await loadInclude(context, include);
			context.watcher?.add(includes.map((i) => i.file));
			context.watcher?.on('change', (changed) => {
				const include = includes.find((i) => resolve(i.file) === resolve(changed));
				if (include) loadInclude(context, include);
			});
		},
	};
}

export const collections = {
	docs: defineCollection({ loader: kilnDocsLoader(), schema: docsSchema() }),
	i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
