import { readFileSync } from 'node:fs';
import { markdownToHtml } from 'satteri';

/**
 * Python API reference: turn a griffe JSON dump (`griffe dump <package> --docstyle google --full`)
 * into a page model for the /api/ routes.
 *
 * Kiln never runs Python: the dump is produced beforehand (by the reusable workflow, or by the
 * project), and only read here.
 */

const LABELS = {
	en: {
		reference: 'API reference',
		modules: 'Modules',
		classes: 'Classes',
		functions: 'Functions',
		attributes: 'Attributes',
		methods: 'Methods',
		properties: 'Properties',
		parameters: 'Parameters',
		returns: 'Returns',
		yields: 'Yields',
		raises: 'Raises',
		bases: 'Bases',
		name: 'Name',
		type: 'Type',
		default: 'Default',
		description: 'Description',
		value: 'Value',
		source: 'Source',
		overview: 'Every module of the package, generated from the docstrings.',
	},
	fr: {
		reference: 'Référence API',
		modules: 'Modules',
		classes: 'Classes',
		functions: 'Fonctions',
		attributes: 'Attributs',
		methods: 'Méthodes',
		properties: 'Propriétés',
		parameters: 'Paramètres',
		returns: 'Renvoie',
		yields: 'Produit',
		raises: 'Lève',
		bases: 'Hérite de',
		name: 'Nom',
		type: 'Type',
		default: 'Par défaut',
		description: 'Description',
		value: 'Valeur',
		source: 'Source',
		overview: 'Tous les modules du paquet, générés à partir des docstrings.',
	},
};

export function apiLabels(locale) {
	return LABELS[locale] ?? LABELS.en;
}

const escapeHtml = (text) =>
	String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* ── Expressions ───────────────────────────────────────────────────────────── */

const OPERATORS = { '|': ' | ' };

/**
 * Render a griffe expression (annotation, default value, base class…) as Python source.
 * `name` lets the caller wrap names, e.g. to link them; it receives the raw name and returns HTML.
 */
function renderExpr(expr, name) {
	const r = (e) => renderExpr(e, name);
	if (expr === null || expr === undefined) return '';
	if (typeof expr === 'string') return name.text(expr);
	switch (expr.cls) {
		case 'ExprName':
			return name.ref(expr.name);
		case 'ExprAttribute':
			return expr.values.map(r).join('.');
		case 'ExprSubscript':
			return `${r(expr.left)}[${r(expr.slice)}]`;
		case 'ExprTuple': {
			const inner = expr.elements.map(r).join(', ');
			return expr.implicit ? inner : `(${inner}${expr.elements.length === 1 ? ',' : ''})`;
		}
		case 'ExprList':
			return `[${expr.elements.map(r).join(', ')}]`;
		case 'ExprSet':
			return `{${expr.elements.map(r).join(', ')}}`;
		case 'ExprDict':
			return `{${expr.keys.map((k, i) => (k === null ? `**${r(expr.values[i])}` : `${r(k)}: ${r(expr.values[i])}`)).join(', ')}}`;
		case 'ExprBinOp':
			return `${r(expr.left)}${name.text(OPERATORS[expr.operator] ?? ` ${expr.operator} `)}${r(expr.right)}`;
		case 'ExprBoolOp':
			return expr.values.map(r).join(name.text(` ${expr.operator} `));
		case 'ExprUnaryOp':
			return `${name.text(expr.operator === 'not' ? 'not ' : expr.operator)}${r(expr.value)}`;
		case 'ExprCompare':
			return [r(expr.left), ...expr.operators.map((op, i) => `${name.text(` ${op} `)}${r(expr.comparators[i])}`)].join('');
		case 'ExprCall':
			return `${r(expr.function)}(${expr.arguments.map(r).join(', ')})`;
		case 'ExprKeyword':
			return `${name.text(expr.name)}=${r(expr.value)}`;
		case 'ExprVarPositional':
			return `*${r(expr.value)}`;
		case 'ExprVarKeyword':
			return `**${r(expr.value)}`;
		case 'ExprIfExp':
			return `${r(expr.body)}${name.text(' if ')}${r(expr.test)}${name.text(' else ')}${r(expr.orelse)}`;
		case 'ExprLambda':
			return name.text('lambda …');
		case 'ExprListComp':
			return `[${r(expr.element)} ${expr.generators.map(r).join(' ')}]`;
		case 'ExprSetComp':
			return `{${r(expr.element)} ${expr.generators.map(r).join(' ')}}`;
		case 'ExprGeneratorExp':
			return `(${r(expr.element)} ${expr.generators.map(r).join(' ')})`;
		case 'ExprDictComp':
			return `{${r(expr.key)}: ${r(expr.value)} ${expr.generators.map(r).join(' ')}}`;
		case 'ExprComprehension':
			return `${name.text(expr.is_async ? 'async for ' : 'for ')}${r(expr.target)}${name.text(' in ')}${r(expr.iterable)}${expr.conditions
				.map((c) => `${name.text(' if ')}${r(c)}`)
				.join('')}`;
		case 'ExprJoinedStr':
			return `f"${expr.values.map((v) => (typeof v === 'string' ? name.text(v.replace(/^['"]|['"]$/g, '')) : r(v))).join('')}"`;
		case 'ExprFormatted':
			return `{${r(expr.value)}}`;
		case 'ExprSlice':
			return [expr.lower, expr.upper, expr.step].map((p) => (p ? r(p) : '')).join(':');
		case 'ExprNamedExpr':
			return `${r(expr.target)} := ${r(expr.value)}`;
		case 'ExprYield':
			return `yield ${r(expr.value)}`;
		case 'ExprAwait':
			return `await ${r(expr.value)}`;
		default:
			return name.text('…');
	}
}

const asText = { text: (t) => t, ref: (t) => t };
export const exprToText = (expr) => renderExpr(expr, asText);

/* ── Docstrings ────────────────────────────────────────────────────────────── */

/**
 * Split Markdown into prose and code blocks, so the page renders code with Expressive Code
 * (the site's code style) and prose as HTML. Doctest lines (`>>> …`) become Python blocks.
 */
function toParts(markdown) {
	if (!markdown) return [];
	const lines = markdown.replace(/\r\n/g, '\n').split('\n');
	const parts = [];
	let prose = [];
	const flushProse = () => {
		const text = prose.join('\n').trim();
		if (text) parts.push({ html: markdownToHtml(text).html });
		prose = [];
	};
	for (let i = 0; i < lines.length; i++) {
		const fence = /^(\s*)(```+|~~~+)\s*([\w+-]*)/.exec(lines[i]);
		if (fence) {
			flushProse();
			const [, indent, marker, lang] = fence;
			const code = [];
			for (i++; i < lines.length && !lines[i].trimStart().startsWith(marker); i++) code.push(lines[i].slice(indent.length));
			parts.push({ code: code.join('\n'), lang: lang || 'python' });
			continue;
		}
		if (/^\s*>>>/.test(lines[i])) {
			flushProse();
			const code = [];
			for (; i < lines.length && lines[i].trim() !== ''; i++) code.push(lines[i].trim());
			i--;
			parts.push({ code: code.join('\n'), lang: 'python' });
			continue;
		}
		prose.push(lines[i]);
	}
	flushProse();
	return parts;
}

const inlineHtml = (markdown) => {
	if (!markdown) return '';
	const html = markdownToHtml(markdown).html.trim();
	// A single paragraph renders inline, e.g. in a table cell.
	const single = /^<p>([\s\S]*)<\/p>$/.exec(html);
	return single && !single[1].includes('<p>') ? single[1] : html;
};

/* ── Model ─────────────────────────────────────────────────────────────────── */

const isPublicName = (name) => !name.startsWith('_') || (name.startsWith('__') && name.endsWith('__') && name !== '__init__');
const SIGNATURE_WIDTH = 80;

function slugify(text) {
	return text
		.toLowerCase()
		.replace(/[^\w]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * Build the reference model.
 *
 * @param {{ file: string, exclude?: string[], base: string, locale: string }} options
 * @returns {{ modules: object[], sidebar: object, labels: object }}
 */
export function loadPythonApi({ file, exclude = [], base, locale }) {
	const labels = apiLabels(locale);
	let dump;
	try {
		dump = JSON.parse(readFileSync(file, 'utf8'));
	} catch (err) {
		throw new Error(`api.python: cannot read ${file}: ${err.message}`);
	}

	const roots = Object.values(dump).filter((o) => o && o.kind === 'module');
	if (!roots.length) throw new Error(`api.python: ${file} holds no Python package. Was it written by "griffe dump"?`);

	// Without --docstyle and --full, griffe keeps docstrings as raw text: Args/Returns sections are not split.
	const sample = JSON.stringify(roots[0]).slice(0, 2_000_000);
	if (sample.includes('"docstring"') && !sample.includes('"parsed"')) {
		console.warn(`\x1b[33mkiln ›\x1b[0m ${file} has no parsed docstrings: generate it with "griffe dump <package> --docstyle google --full".`);
	}

	const excluded = (path) => exclude.some((e) => path === e || path.startsWith(`${e}.`));
	const prefix = `${base.replace(/\/$/, '')}/api`;
	const moduleUrl = (path) => `${prefix}/${path.split('.').join('/')}/`;

	// Pass 1: collect documented modules and classes, to link type names to their page.
	const modules = [];
	const collect = (mod) => {
		if (excluded(mod.path) || !isPublicName(mod.name)) return;
		modules.push(mod);
		for (const member of Object.values(mod.members ?? {})) {
			if (member.kind === 'module') collect(member);
		}
	};
	for (const root of roots) collect(root);

	const targets = new Map();
	const ambiguous = new Set();
	for (const mod of modules) {
		for (const member of Object.values(mod.members ?? {})) {
			if (member.kind !== 'class' || !isPublicName(member.name)) continue;
			if (targets.has(member.name)) ambiguous.add(member.name);
			targets.set(member.name, `${moduleUrl(mod.path)}#${slugify(member.name)}`);
		}
	}
	const linked = {
		text: escapeHtml,
		ref: (name) => {
			const url = !ambiguous.has(name) && targets.get(name);
			return url ? `<a href="${url}">${escapeHtml(name)}</a>` : escapeHtml(name);
		},
	};
	const exprHtml = (expr) => renderExpr(expr, linked);

	// Pass 2: pages.
	const docOf = (obj) => obj.docstring?.parsed ?? (obj.docstring?.value ? [{ kind: 'text', value: obj.docstring.value }] : []);

	function sections(obj) {
		const out = { parts: [], params: new Map(), returns: [], yields: [], raises: [], attributes: [], notes: [] };
		for (const section of docOf(obj)) {
			switch (section.kind) {
				case 'text':
					out.parts.push(...toParts(section.value));
					break;
				case 'parameters':
				case 'other parameters':
					for (const p of section.value) out.params.set(p.name.replace(/^\*+/, ''), p);
					break;
				case 'returns':
				case 'yields':
				case 'raises':
				case 'warns':
					for (const item of section.value) {
						const entry = { type: exprHtml(item.annotation), html: inlineHtml(item.description) };
						(out[section.kind] ?? out.raises).push(entry);
					}
					break;
				case 'attributes':
					out.attributes.push(...section.value);
					break;
				case 'admonition':
				case 'examples':
					out.notes.push({
						title: section.title ?? (section.kind === 'examples' ? 'Examples' : ''),
						kind: section.value?.annotation ?? 'note',
						parts:
							section.kind === 'examples'
								? section.value.flatMap(([kind, text]) => (kind === 'examples' ? [{ code: text, lang: 'python' }] : toParts(text)))
								: toParts(section.value?.description ?? ''),
					});
					break;
				default:
					break;
			}
		}
		return out;
	}

	function signature(fn, { keyword = 'def', name = fn.name, skipFirst = false } = {}) {
		const params = [...(fn.parameters ?? [])];
		if (skipFirst && ['self', 'cls'].includes(params[0]?.name)) params.shift();
		const text = params.map((p) => {
			const star = p.kind === 'variadic positional' ? '*' : p.kind === 'variadic keyword' ? '**' : '';
			const annotation = p.annotation ? `: ${exprToText(p.annotation)}` : '';
			const hasDefault = p.default !== null && p.default !== undefined && !star;
			const value = hasDefault ? `${annotation ? ' = ' : '='}${exprToText(p.default)}` : '';
			return `${star}${p.name}${annotation}${value}`;
		});
		// Keyword-only markers, as written in the source.
		const firstKw = params.findIndex((p) => p.kind === 'keyword-only');
		if (firstKw !== -1 && !params.some((p) => p.kind === 'variadic positional')) text.splice(firstKw, 0, '*');
		const lastPos = params.map((p) => p.kind).lastIndexOf('positional-only');
		if (lastPos !== -1) text.splice(lastPos + 1, 0, '/');

		const returns = fn.returns ? ` -> ${exprToText(fn.returns)}` : '';
		const prefix = `${(fn.labels ?? []).includes('async') ? 'async ' : ''}${keyword} ${name}`;
		const oneLine = `${prefix}(${text.join(', ')})${returns}${keyword === 'class' ? '' : ':'}`;
		if (oneLine.length <= SIGNATURE_WIDTH || !text.length) return oneLine;
		return `${prefix}(\n${text.map((t) => `    ${t},`).join('\n')}\n)${returns}${keyword === 'class' ? '' : ':'}`;
	}

	function paramTable(fn, docs, skipFirst) {
		const params = (fn.parameters ?? []).filter((p, i) => !(skipFirst && i === 0 && ['self', 'cls'].includes(p.name)));
		return params
			.map((p) => {
				const doc = docs.params.get(p.name);
				const star = p.kind === 'variadic positional' ? '*' : p.kind === 'variadic keyword' ? '**' : '';
				return {
					name: `${star}${p.name}`,
					type: exprHtml(p.annotation ?? doc?.annotation),
					default: star || p.default === null || p.default === undefined ? '' : escapeHtml(exprToText(p.default)),
					html: inlineHtml(doc?.description),
				};
			})
			.filter((p) => p.type || p.default || p.html);
	}

	function functionModel(fn, { anchorPrefix = '', method = false } = {}) {
		const docs = sections(fn);
		const labelList = (fn.labels ?? []).filter((l) => ['async', 'classmethod', 'staticmethod', 'abstractmethod'].includes(l));
		const skipFirst = method && !labelList.includes('staticmethod');
		return {
			kind: 'function',
			name: fn.name,
			anchor: slugify(`${anchorPrefix}${fn.name}`),
			labels: labelList,
			signature: signature(fn, { skipFirst }),
			parts: docs.parts,
			params: paramTable(fn, docs, skipFirst),
			returns: docs.returns.filter((r) => r.type || r.html),
			yields: docs.yields,
			raises: docs.raises,
			notes: docs.notes,
			source: fn.source_link ?? null,
		};
	}

	function attributeModel(attr, { anchorPrefix = '', doc } = {}) {
		const docs = sections(attr);
		return {
			kind: 'attribute',
			name: attr.name,
			anchor: slugify(`${anchorPrefix}${attr.name}`),
			labels: (attr.labels ?? []).filter((l) => ['property', 'class-attribute', 'writable'].includes(l)),
			type: exprHtml(attr.annotation ?? attr.returns ?? doc?.annotation),
			value: attr.value !== undefined && attr.value !== null && !(attr.labels ?? []).includes('property') ? escapeHtml(exprToText(attr.value)) : '',
			parts: docs.parts.length ? docs.parts : doc?.description ? toParts(doc.description) : [],
		};
	}

	function classModel(cls) {
		const docs = sections(cls);
		const members = Object.values(cls.members ?? {});
		const init = members.find((m) => m.name === '__init__' && m.kind === 'function');
		const initDocs = init ? sections(init) : null;
		// Google style documents the constructor either in the class docstring or in __init__.
		for (const [key, value] of initDocs?.params ?? []) if (!docs.params.has(key)) docs.params.set(key, value);
		const documentedAttributes = new Map(docs.attributes.map((a) => [a.name, a]));

		const methods = [];
		const properties = [];
		const attributes = [];
		const anchorPrefix = `${cls.name}-`;
		for (const m of members) {
			if (!isPublicName(m.name) || m.kind === 'alias' || m.is_imported) continue;
			if (m.kind === 'function' && m.name.startsWith('__') && m.name !== '__call__') continue;
			if (m.kind === 'function') methods.push(functionModel(m, { anchorPrefix, method: true }));
			else if (m.kind === 'attribute' && (m.labels ?? []).includes('property')) properties.push(attributeModel(m, { anchorPrefix }));
			else if (m.kind === 'attribute') attributes.push(attributeModel(m, { anchorPrefix, doc: documentedAttributes.get(m.name) }));
		}
		const bases = (cls.bases ?? []).map(exprHtml).filter(Boolean);
		return {
			kind: 'class',
			name: cls.name,
			anchor: slugify(cls.name),
			labels: (cls.labels ?? []).filter((l) => l === 'dataclass'),
			signature: init ? signature(init, { keyword: 'class', name: cls.name, skipFirst: true }) : `class ${cls.name}`,
			bases,
			parts: [...docs.parts, ...(initDocs?.parts ?? [])],
			params: init ? paramTable(init, docs, true) : [],
			notes: [...docs.notes, ...(initDocs?.notes ?? [])],
			raises: initDocs?.raises ?? [],
			attributes,
			properties,
			methods,
			source: cls.source_link ?? null,
		};
	}

	const pages = modules.map((mod) => {
		const docs = sections(mod);
		const members = Object.values(mod.members ?? {}).filter((m) => isPublicName(m.name) && m.kind !== 'alias' && !m.is_imported);
		const classes = members.filter((m) => m.kind === 'class').map(classModel);
		const functions = members.filter((m) => m.kind === 'function').map((f) => functionModel(f));
		const attributes = members
			.filter((m) => m.kind === 'attribute' && !(m.name.startsWith('__') && m.name.endsWith('__')))
			.map((a) => attributeModel(a));
		const submodules = modules
			.filter((m) => m.path.startsWith(`${mod.path}.`) && !m.path.slice(mod.path.length + 1).includes('.'))
			.map((m) => ({ path: m.path, url: moduleUrl(m.path), summary: summaryOf(m) }));
		return {
			path: mod.path,
			slug: mod.path.split('.').join('/'),
			url: moduleUrl(mod.path),
			summary: summaryOf(mod),
			parts: docs.parts,
			notes: docs.notes,
			submodules,
			classes,
			functions,
			attributes,
		};
	});

	// Sidebar: one group per package, collapsed, in module order.
	const byPath = new Map(pages.map((p) => [p.path, p]));
	const children = (path) => pages.filter((p) => p.path.startsWith(`${path}.`) && !p.path.slice(path.length + 1).includes('.'));
	const node = (page) => {
		const kids = children(page.path);
		const leaf = { label: page.path.split('.').pop(), link: `/api/${page.slug}/` };
		if (!kids.length) return leaf;
		return { label: leaf.label, collapsed: true, items: [{ ...leaf, label: page.path }, ...kids.map(node)] };
	};
	const rootsInPages = pages.filter((p) => !p.path.includes('.') || !byPath.has(p.path.slice(0, p.path.lastIndexOf('.'))));
	const sidebar = {
		label: labels.reference,
		collapsed: true,
		items: [{ label: labels.modules, link: '/api/' }, ...rootsInPages.map(node)],
	};

	return { pages, sidebar, labels };

	function summaryOf(mod) {
		const first = docOf(mod).find((s) => s.kind === 'text')?.value ?? '';
		return inlineHtml(first.split(/\n\s*\n/)[0]);
	}
}
