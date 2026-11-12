import { readFileSync } from 'node:fs';
import { LineCounter, parseDocument } from 'yaml';
import { markdownToHtml } from 'satteri';

/**
 * OpenAPI reference: turn an OpenAPI 3.0 or 3.1 description (YAML or JSON) into a page model for the
 * /api/ routes, in the manner of hosted API references: an introduction, one page per operation with
 * its parameters, request body, responses and code samples, and one page per schema.
 */

const LABELS = {
	en: {
		reference: 'API reference',
		introduction: 'Introduction',
		schemas: 'Schemas',
		baseUrl: 'Base URL',
		authentication: 'Authentication',
		noAuth: 'No authentication',
		authRequired: 'Requires',
		public: 'Public: no authentication needed',
		pathParams: 'Path parameters',
		queryParams: 'Query parameters',
		headerParams: 'Headers',
		cookieParams: 'Cookies',
		body: 'Request body',
		responses: 'Responses',
		request: 'Request',
		response: 'Response',
		required: 'required',
		optional: 'optional',
		deprecated: 'Deprecated',
		default: 'Default',
		allowed: 'Allowed values',
		example: 'Example',
		noContent: 'No content',
		fields: 'Fields',
		usedBy: 'Used by',
		operations: 'Operations',
		copy: 'Copy',
		version: 'Version',
		download: 'Download the OpenAPI description',
		overview: 'Every operation of the API, generated from its OpenAPI description.',
	},
	fr: {
		reference: 'Référence API',
		introduction: 'Introduction',
		schemas: 'Schémas',
		baseUrl: 'URL de base',
		authentication: 'Authentification',
		noAuth: 'Aucune authentification',
		authRequired: 'Nécessite',
		public: 'Publique : aucune authentification',
		pathParams: 'Paramètres de chemin',
		queryParams: 'Paramètres de requête',
		headerParams: 'En-têtes',
		cookieParams: 'Cookies',
		body: 'Corps de la requête',
		responses: 'Réponses',
		request: 'Requête',
		response: 'Réponse',
		required: 'obligatoire',
		optional: 'facultatif',
		deprecated: 'Obsolète',
		default: 'Par défaut',
		allowed: 'Valeurs possibles',
		example: 'Exemple',
		noContent: 'Aucun contenu',
		fields: 'Champs',
		usedBy: 'Utilisé par',
		operations: 'Opérations',
		copy: 'Copier',
		version: 'Version',
		download: 'Télécharger la description OpenAPI',
		overview: "Toutes les opérations de l'API, générées depuis sa description OpenAPI.",
	},
};

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];

/** Sidebar badge variant of each HTTP method (Starlight badge variants). */
const METHOD_VARIANT = { get: 'success', post: 'note', put: 'caution', patch: 'caution', delete: 'danger' };

export class OpenApiError extends Error {}

const slugify = (s) =>
	String(s)
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'item';

const humanize = (s) => {
	const text = String(s).replace(/[-_]+/g, ' ').trim();
	return text.charAt(0).toUpperCase() + text.slice(1);
};

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');


/** First sentence-like line of a description, as plain text (meta descriptions, lists). */
const plain = (text) =>
	String(text ?? '')
		.split(/\n\s*\n/)[0]
		.replace(/[`*_]/g, '')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\s+/g, ' ')
		.trim();

/**
 * Read and check an OpenAPI file. Errors carry the line of the problem when there is one.
 * @returns {{ doc: object, line: (path: (string|number)[]) => number | undefined }}
 */
export function readOpenApi(file) {
	const source = readFileSync(file, 'utf8');
	const lineCounter = new LineCounter();
	const parsed = parseDocument(source, { lineCounter, prettyErrors: true });
	if (parsed.errors.length) {
		const e = parsed.errors[0];
		throw new OpenApiError(`${e.linePos?.[0]?.line ? `line ${e.linePos[0].line}: ` : ''}malformed ${file.endsWith('.json') ? 'JSON' : 'YAML'}: ${e.message.split('\n')[0]}`);
	}
	const doc = parsed.toJS() ?? {};
	const line = (path) => {
		const node = parsed.getIn(path, true);
		const offset = node?.range?.[0];
		return offset === undefined ? undefined : lineCounter.linePos(offset).line;
	};
	const version = String(doc.openapi ?? '');
	if (!/^3\.[01]\./.test(version)) {
		throw new OpenApiError(
			doc.swagger
				? 'Swagger 2.0 is not supported: convert the file to OpenAPI 3 (for example with swagger2openapi)'
				: `"openapi" must be a 3.0.x or 3.1.x version, got "${version || 'nothing'}"`,
		);
	}
	if (!doc.paths || typeof doc.paths !== 'object') throw new OpenApiError('"paths" is missing: the description has no operation');

	// Every local $ref must point somewhere.
	const missing = [];
	const walk = (node, path) => {
		if (Array.isArray(node)) node.forEach((v, i) => walk(v, [...path, i]));
		else if (node && typeof node === 'object') {
			if (typeof node.$ref === 'string') {
				if (!node.$ref.startsWith('#/')) missing.push({ ref: node.$ref, path, external: true });
				else if (resolvePointer(doc, node.$ref) === undefined) missing.push({ ref: node.$ref, path });
			}
			for (const [k, v] of Object.entries(node)) if (k !== '$ref') walk(v, [...path, k]);
		}
	};
	walk(doc, []);
	if (missing.length) {
		const m = missing[0];
		const where = line(m.path);
		throw new OpenApiError(
			`${where ? `line ${where}: ` : ''}${m.external ? `external reference "${m.ref}" is not supported: bundle the description into one file (for example with redocly bundle)` : `reference "${m.ref}" points to nothing`}${missing.length > 1 ? ` (and ${missing.length - 1} more)` : ''}`,
		);
	}
	return { doc, line };
}

function resolvePointer(doc, ref) {
	return ref
		.slice(2)
		.split('/')
		.map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
		.reduce((node, key) => (node === undefined || node === null ? undefined : node[key]), doc);
}

/**
 * Build the page model.
 * @param {{ file: string, server?: string, base: string, locale: 'en' | 'fr', specUrl?: string, root?: string, label?: string }} options
 *   `root`: route of the reference, `/api` (default) or `/api/rest` next to a Python reference.
 */
export function loadOpenApi({ file, server, base, locale, specUrl, root = '/api', label }) {
	const { doc } = readOpenApi(file);
	const labels = LABELS[locale] ?? LABELS.en;
	const prefix = base.replace(/\/$/, '');
	// Descriptions are Markdown; absolute site links (/guides/…) get the base path, as in pages.
	const md = (text) =>
		text ? markdownToHtml(String(text)).html.trim().replace(/(<a\s[^>]*href=")\/(?!\/)/g, `$1${prefix}/`) : '';
	/**
	 * Block Markdown split into parts: prose as HTML, fenced code apart, so that pages render it with
	 * Expressive Code like the rest of the site.
	 */
	const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
	const mdParts = (text) => {
		const html = md(text);
		const parts = [];
		let last = 0;
		for (const m of html.matchAll(/<pre><code(?: class="language-([\w+#-]+)")?>([\s\S]*?)<\/code><\/pre>/g)) {
			if (m.index > last) parts.push({ html: html.slice(last, m.index) });
			parts.push({ code: decode(m[2]).replace(/\n$/, ''), lang: m[1] ?? 'txt' });
			last = m.index + m[0].length;
		}
		if (last < html.length) parts.push({ html: html.slice(last) });
		return parts;
	};
	/** Inline Markdown: a single paragraph without its <p>. */
	const mdInline = (text) => md(text).replace(/^<p>([\s\S]*)<\/p>$/, '$1');
	const deref = (node, seen = new Set()) => {
		while (node && typeof node === 'object' && typeof node.$ref === 'string') {
			if (seen.has(node.$ref)) return {};
			seen.add(node.$ref);
			node = resolvePointer(doc, node.$ref);
		}
		return node ?? {};
	};
	const schemaName = (node) => (typeof node?.$ref === 'string' && node.$ref.startsWith('#/components/schemas/') ? node.$ref.split('/').pop() : undefined);
	const schemaNames = Object.keys(doc.components?.schemas ?? {});
	const schemaSlug = (name) => `schemas/${slugify(name)}`;
	const schemaLink = (name) => `${root}/${schemaSlug(name)}/`;

	// ── Types and fields ───────────────────────────────────────────────────────

	/** Readable type of a schema; named schemas link to their page. */
	function typeOf(node, seen = new Set()) {
		const name = schemaName(node);
		if (name) return { text: name, link: schemaLink(name) };
		const s = deref(node, seen);
		const nullable = s.nullable === true || (Array.isArray(s.type) && s.type.includes('null'));
		const suffix = nullable ? ' | null' : '';
		for (const key of ['oneOf', 'anyOf']) {
			if (Array.isArray(s[key])) {
				const parts = s[key].map((v) => typeOf(v, seen)).filter((t) => t.text !== 'null');
				return { text: parts.map((p) => p.text).join(' | ') + suffix, parts };
			}
		}
		if (Array.isArray(s.allOf) && s.allOf.length === 1) return typeOf(s.allOf[0], seen);
		const types = (Array.isArray(s.type) ? s.type : [s.type]).filter((t) => t && t !== 'null');
		let text = types.join(' | ') || (s.properties || s.allOf ? 'object' : s.enum ? typeof s.enum[0] : 'any');
		if (types.includes('array')) {
			const item = typeOf(s.items ?? {}, seen);
			return { text: `${item.text}[]${suffix}`, link: item.link };
		}
		if (s.format) text += ` (${s.format})`;
		return { text: text + suffix };
	}

	/** Properties of an object schema, merging allOf. */
	function propertiesOf(node, seen) {
		const s = deref(node, new Set(seen));
		const props = { ...(s.properties ?? {}) };
		const required = new Set(s.required ?? []);
		for (const part of s.allOf ?? []) {
			const sub = propertiesOf(part, seen);
			Object.assign(props, sub.props);
			for (const r of sub.required) required.add(r);
		}
		return { props, required };
	}

	/** Field tree of a schema: object properties, array items, nested up to a few levels. */
	function fieldsOf(node, depth = 0, seen = new Set()) {
		const name = schemaName(node);
		if (name) {
			if (seen.has(name) || depth > 3) return [];
			seen = new Set([...seen, name]);
		}
		const s = deref(node);
		if (Array.isArray(s.type) ? s.type.includes('array') : s.type === 'array') return fieldsOf(s.items ?? {}, depth, seen);
		const { props, required } = propertiesOf(node, seen);
		return Object.entries(props).map(([key, prop]) => field(key, prop, required.has(key), depth, seen));
	}

	function field(name, prop, required, depth, seen) {
		const s = deref(prop);
		const constraints = [];
		if (s.minimum !== undefined || s.maximum !== undefined) constraints.push(`${s.minimum ?? '…'} to ${s.maximum ?? '…'}`);
		if (s.minLength !== undefined) constraints.push(`≥ ${s.minLength} chars`);
		if (s.maxLength !== undefined) constraints.push(`≤ ${s.maxLength} chars`);
		if (s.maxItems !== undefined) constraints.push(`≤ ${s.maxItems} items`);
		return {
			name,
			type: typeOf(prop),
			required,
			deprecated: s.deprecated === true,
			readOnly: s.readOnly === true,
			html: md(prop.description ?? s.description),
			enum: (s.enum ?? (Array.isArray(s.items?.enum) ? s.items.enum : undefined))?.map((v) => JSON.stringify(v)),
			default: s.default !== undefined ? JSON.stringify(s.default) : undefined,
			constraints: constraints.join(', '),
			children: fieldsOf(prop, depth + 1, seen),
		};
	}

	// ── Examples ───────────────────────────────────────────────────────────────

	function exampleOf(node, depth = 0, seen = new Set()) {
		const name = schemaName(node);
		if (name) {
			if (seen.has(name)) return {};
			seen = new Set([...seen, name]);
		}
		const s = deref(node);
		if (s.example !== undefined) return s.example;
		if (Array.isArray(s.examples) && s.examples.length) return s.examples[0];
		if (s.default !== undefined) return s.default;
		if (Array.isArray(s.enum) && s.enum.length) return s.enum[0];
		if (s.const !== undefined) return s.const;
		for (const key of ['oneOf', 'anyOf']) if (Array.isArray(s[key]) && s[key].length) return exampleOf(s[key].find((v) => deref(v).type !== 'null') ?? s[key][0], depth, seen);
		const type = (Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type) ?? (s.properties || s.allOf ? 'object' : undefined);
		if (type === 'array') return depth > 4 ? [] : [exampleOf(s.items ?? {}, depth + 1, seen)];
		if (type === 'object' || s.allOf) {
			if (depth > 4) return {};
			const { props } = propertiesOf(node, seen);
			const out = {};
			for (const [key, prop] of Object.entries(props)) {
				if (deref(prop).writeOnly) continue;
				out[key] = exampleOf(prop, depth + 1, seen);
			}
			if (!Object.keys(out).length && s.additionalProperties && typeof s.additionalProperties === 'object') {
				out.key = exampleOf(s.additionalProperties, depth + 1, seen);
			}
			return out;
		}
		if (type === 'integer') return s.minimum ?? 0;
		if (type === 'number') return s.minimum ?? 0;
		if (type === 'boolean') return true;
		if (type === 'string') {
			return (
				{
					'date-time': '2026-01-01T12:00:00Z',
					date: '2026-01-01',
					time: '12:00:00',
					email: 'user@example.com',
					uri: 'https://example.com',
					url: 'https://example.com',
					uuid: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
					binary: '<binary>',
				}[s.format] ?? 'string'
			);
		}
		return null;
	}

	/** Example of a media type: its own example(s), else built from the schema. */
	function mediaExample(media) {
		if (!media) return undefined;
		if (media.example !== undefined) return media.example;
		const first = media.examples && Object.values(media.examples)[0];
		if (first) return deref(first).value;
		if (media.schema) return exampleOf(media.schema);
		return undefined;
	}

	const pickJson = (content = {}) => {
		const entry = Object.entries(content).find(([type]) => /json/i.test(type)) ?? Object.entries(content)[0];
		return entry ? { type: entry[0], media: entry[1] ?? {} } : undefined;
	};

	// ── Security ───────────────────────────────────────────────────────────────

	const schemes = doc.components?.securitySchemes ?? {};
	function describeScheme(name) {
		const s = deref(schemes[name]);
		if (s.type === 'http' && s.scheme?.toLowerCase() === 'bearer') return { name, label: `Bearer${s.bearerFormat ? ` (${s.bearerFormat})` : ''}`, header: { key: 'Authorization', value: 'Bearer $TOKEN' } };
		if (s.type === 'http' && s.scheme?.toLowerCase() === 'basic') return { name, label: 'HTTP Basic', header: { key: 'Authorization', value: 'Basic $CREDENTIALS' } };
		if (s.type === 'apiKey' && s.in === 'header') return { name, label: `API key in the ${s.name} header`, header: { key: s.name, value: '$API_KEY' } };
		if (s.type === 'apiKey' && s.in === 'query') return { name, label: `API key in the ${s.name} query parameter`, query: { key: s.name, value: '$API_KEY' } };
		if (s.type === 'apiKey' && s.in === 'cookie') return { name, label: `Cookie ${s.name}` };
		if (s.type === 'oauth2') return { name, label: 'OAuth 2.0', header: { key: 'Authorization', value: 'Bearer $TOKEN' } };
		if (s.type === 'openIdConnect') return { name, label: 'OpenID Connect', header: { key: 'Authorization', value: 'Bearer $TOKEN' } };
		return { name, label: s.type ?? name };
	}
	const authOverview = Object.keys(schemes).map((name) => ({ ...describeScheme(name), html: md(deref(schemes[name]).description) }));

	/** Security requirements of an operation: lists of alternatives, each a list of scheme names. */
	const securityOf = (op) => (op.security ?? doc.security ?? []).map((req) => Object.keys(req));

	// ── Servers ────────────────────────────────────────────────────────────────

	const serverOf = (op, pathItem) => {
		const list = op.servers ?? pathItem.servers ?? doc.servers ?? [];
		let url = list[0]?.url ?? '';
		for (const [k, v] of Object.entries(list[0]?.variables ?? {})) url = url.replaceAll(`{${k}}`, v.default ?? '');
		if (server) {
			// docs.yml `api.server` gives the host of relative servers ("/api/v1") or replaces it.
			url = /^https?:\/\//.test(url) ? `${server.replace(/\/$/, '')}${new URL(url).pathname}` : `${server.replace(/\/$/, '')}${url.startsWith('/') ? url : `/${url}`}`;
		}
		return url.replace(/\/$/, '');
	};

	// ── Code samples ───────────────────────────────────────────────────────────

	const pyLiteral = (value, indent = 0) => {
		const pad = '    '.repeat(indent + 1);
		const end = '    '.repeat(indent);
		if (value === null || value === undefined) return 'None';
		if (value === true) return 'True';
		if (value === false) return 'False';
		if (typeof value === 'number') return String(value);
		if (typeof value === 'string') return JSON.stringify(value);
		if (Array.isArray(value)) return value.length ? `[\n${value.map((v) => `${pad}${pyLiteral(v, indent + 1)},`).join('\n')}\n${end}]` : '[]';
		const entries = Object.entries(value);
		return entries.length ? `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${pyLiteral(v, indent + 1)},`).join('\n')}\n${end}}` : '{}';
	};

	const indentJson = (value, spaces) => JSON.stringify(value, null, 2).replace(/\n/g, `\n${' '.repeat(spaces)}`);

	function samples({ method, url, headers, body, jsonResponse }) {
		const upper = method.toUpperCase();
		const curl = [`curl${upper === 'GET' ? '' : ` -X ${upper}`} "${url}"`];
		for (const [k, v] of Object.entries(headers)) curl.push(`  -H "${k}: ${v}"`);
		if (body !== undefined) curl.push(`  -d '${JSON.stringify(body, null, 2).replace(/'/g, "'\\''")}'`);

		// cURL reads secrets from shell variables ($TOKEN); the other samples show a placeholder to replace.
		const placeholder = (v) => v.replace(/\$([A-Z_]+)/g, '<$1>');
		const jsHeaders = Object.entries(headers).map(([k, v]) => `    ${/^[A-Za-z_]\w*$/.test(k) ? k : `'${k}'`}: '${placeholder(v)}',`);
		const js = [`const response = await fetch('${url}', {`];
		if (upper !== 'GET') js.push(`  method: '${upper}',`);
		if (jsHeaders.length) js.push('  headers: {', ...jsHeaders, '  },');
		if (body !== undefined) js.push(`  body: JSON.stringify(${indentJson(body, 2)}),`);
		js.push('});');
		js.push(jsonResponse ? 'const data = await response.json();' : 'console.log(response.status);');

		// requests sets Content-Type itself with json=.
		const pyHeaders = Object.entries(headers).filter(([k]) => !(k === 'Content-Type' && body !== undefined)).map(([k, v]) => `        "${k}": "${placeholder(v)}",`);
		const py = ['import requests', '', `response = requests.${method.toLowerCase()}(`, `    "${url}",`];
		if (pyHeaders.length) py.push('    headers={', ...pyHeaders, '    },');
		if (body !== undefined) py.push(`    json=${pyLiteral(body, 1)},`);
		py.push(')', 'response.raise_for_status()', jsonResponse ? 'print(response.json())' : 'print(response.status_code)');

		return [
			{ label: 'cURL', lang: 'bash', code: curl.join(' \\\n') },
			{ label: 'JavaScript', lang: 'js', code: js.join('\n') },
			{ label: 'Python', lang: 'python', code: py.join('\n') },
		];
	}

	// ── Operations ─────────────────────────────────────────────────────────────

	const tagMeta = new Map((doc.tags ?? []).map((t) => [t.name, t]));
	const groups = new Map();
	const operations = [];
	const usedOpIds = new Set();

	for (const [path, rawItem] of Object.entries(doc.paths)) {
		const pathItem = deref(rawItem);
		for (const method of METHODS) {
			const op = pathItem[method];
			if (!op) continue;
			const tag = op.tags?.[0] ?? 'default';
			if (!groups.has(tag)) {
				const meta = tagMeta.get(tag) ?? {};
				groups.set(tag, { tag, slug: slugify(tag), title: meta['x-displayName'] ?? humanize(tag), html: md(meta.description), operations: [] });
			}
			const group = groups.get(tag);

			let opSlug = slugify(op.operationId ?? `${method}-${path}`);
			while (usedOpIds.has(`${group.slug}/${opSlug}`)) opSlug += '-2';
			usedOpIds.add(`${group.slug}/${opSlug}`);

			const params = [...(pathItem.parameters ?? []), ...(op.parameters ?? [])].map((p) => deref(p));
			const merged = new Map(params.map((p) => [`${p.in}:${p.name}`, p])); // operation parameters override path-level ones
			const byLocation = { path: [], query: [], header: [], cookie: [] };
			for (const p of merged.values()) {
				byLocation[p.in]?.push({
					...field(p.name, { ...(p.schema ?? {}), description: p.description }, p.in === 'path' || p.required === true, 0, new Set()),
					example: p.example ?? (p.examples ? deref(Object.values(p.examples)[0]).value : undefined) ?? (p.schema ? exampleOf(p.schema) : undefined),
				});
			}

			const requestBody = deref(op.requestBody);
			const reqMedia = pickJson(requestBody.content);
			const bodyExample = reqMedia && /json/i.test(reqMedia.type) ? mediaExample(reqMedia.media) : undefined;
			const body = reqMedia
				? {
						contentType: reqMedia.type,
						required: requestBody.required === true,
						html: md(requestBody.description),
						type: reqMedia.media.schema ? typeOf(reqMedia.media.schema) : undefined,
						fields: reqMedia.media.schema ? fieldsOf(reqMedia.media.schema) : [],
						example: bodyExample !== undefined ? JSON.stringify(bodyExample, null, 2) : undefined,
					}
				: null;

			const responses = Object.entries(op.responses ?? {}).map(([status, raw]) => {
				const r = deref(raw);
				const media = pickJson(r.content);
				const example = media && /json/i.test(media.type) ? mediaExample(media.media) : undefined;
				return {
					status,
					ok: /^2/.test(status),
					html: md(r.description),
					contentType: media?.type,
					type: media?.media.schema ? typeOf(media.media.schema) : undefined,
					fields: media?.media.schema ? fieldsOf(media.media.schema) : [],
					example: example !== undefined ? JSON.stringify(example, null, 2) : undefined,
				};
			});

			const security = securityOf(op);
			// Samples use the first alternative a script can send (a header or a query key, not a browser cookie).
			const alternatives = security.filter((alt) => alt.length).map((alt) => describeScheme(alt[0]));
			const auth = alternatives.find((a) => a.header || a.query) ?? alternatives[0] ?? null;
			const headers = {};
			if (auth?.header) headers[auth.header.key] = auth.header.value;
			for (const p of byLocation.header) if (p.required) headers[p.name] = String(p.example ?? 'value');
			if (bodyExample !== undefined) headers['Content-Type'] = reqMedia.type;

			let urlPath = path;
			for (const p of byLocation.path) urlPath = urlPath.replaceAll(`{${p.name}}`, encodeURIComponent(String(p.example ?? `{${p.name}}`)));
			const query = byLocation.query.filter((p) => p.required).map((p) => `${encodeURIComponent(p.name)}=${encodeURIComponent(String(p.example ?? ''))}`);
			if (auth?.query) query.push(`${auth.query.key}=${auth.query.value}`);
			const url = `${serverOf(op, pathItem)}${urlPath}${query.length ? `?${query.join('&')}` : ''}`;
			const okResponse = responses.find((r) => r.ok);

			const page = {
				kind: 'operation',
				slug: `${group.slug}/${opSlug}`,
				title: op.summary ?? `${method.toUpperCase()} ${path}`,
				summary: plain(op.description ?? op.summary),
				method,
				path,
				deprecated: op.deprecated === true,
				parts: mdParts(op.description),
				security: security.length ? security.map((alt) => alt.map(describeScheme)) : [],
				params: byLocation,
				body,
				responses,
				samples: samples({ method, url, headers, body: bodyExample, jsonResponse: Boolean(okResponse?.contentType && /json/i.test(okResponse.contentType)) }),
				group: group.title,
			};
			operations.push(page);
			group.operations.push(page);
		}
	}

	// ── Schemas ────────────────────────────────────────────────────────────────

	const usage = new Map();
	for (const op of operations) {
		const names = new Set();
		const collect = (type) => {
			if (!type) return;
			if (type.link) names.add(type.link);
			for (const p of type.parts ?? []) collect(p);
		};
		collect(op.body?.type);
		for (const r of op.responses) collect(r.type);
		for (const link of names) usage.set(link, [...(usage.get(link) ?? []), { title: op.title, method: op.method, link: `${root}/${op.slug}/` }]);
	}

	const schemas = schemaNames.map((name) => {
		const node = { $ref: `#/components/schemas/${name}` };
		const s = deref(node);
		const fields = fieldsOf(node);
		const example = exampleOf(node);
		return {
			kind: 'schema',
			slug: schemaSlug(name),
			title: name,
			summary: plain(s.description) || name,
			parts: mdParts(s.description),
			type: fields.length ? undefined : typeOf(s),
			enum: s.enum?.map((v) => JSON.stringify(v)),
			fields,
			example: example !== undefined && example !== null ? JSON.stringify(example, null, 2) : undefined,
			usedBy: usage.get(schemaLink(name)) ?? [],
		};
	});

	// ── Introduction, sidebar ──────────────────────────────────────────────────

	const groupList = [...groups.values()];
	// Headings of a long description get anchors and join the table of contents.
	const introHeadings = [];
	const introParts = mdParts(doc.info?.description).map((part) =>
		part.html === undefined
			? part
			: {
					html: part.html.replace(/<h([23])>([\s\S]*?)<\/h\1>/g, (_, level, inner) => {
						const text = inner.replace(/<[^>]+>/g, '');
						let id = slugify(text);
						while (introHeadings.some((h) => h.slug === id)) id += '-2';
						introHeadings.push({ depth: Number(level), slug: id, text });
						return `<h${level} id="${id}">${inner}</h${level}>`;
					}),
				},
	);
	const intro = {
		kind: 'introduction',
		slug: undefined,
		title: doc.info?.title ?? labels.reference,
		summary: plain(doc.info?.description) || labels.overview,
		version: doc.info?.version,
		parts: introParts,
		headings: introHeadings,
		servers: (doc.servers ?? []).map((s) => ({ url: serverOf({ servers: [s] }, {}) || s.url, html: mdInline(s.description) })),
		auth: authOverview,
		specUrl,
		groups: groupList.map((g) => ({
			title: g.title,
			html: g.html,
			operations: g.operations.map((o) => ({ title: o.title, method: o.method, path: o.path, link: `${root}/${o.slug}/` })),
		})),
	};

	const sidebar = {
		label: label ?? labels.reference,
		collapsed: true,
		items: [
			{ label: labels.introduction, link: `${root}/` },
			...groupList.map((g) => ({
				label: g.title,
				collapsed: true,
				items: g.operations.map((o) => ({
					label: o.title,
					link: `${root}/${o.slug}/`,
					badge: { text: o.method.toUpperCase(), variant: METHOD_VARIANT[o.method] ?? 'default' },
					attrs: { class: 'kiln-oa-link' },
				})),
			})),
			...(schemas.length
				? [{ label: labels.schemas, collapsed: true, items: schemas.map((s) => ({ label: s.title, link: `${root}/${s.slug}/` })) }]
				: []),
		],
	};

	return { pages: [intro, ...operations, ...schemas], sidebar, labels, prefix };
}
