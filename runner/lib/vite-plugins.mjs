import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * In dev, /api/ is served from public/api: this middleware resolves directory index.html files
 * (`/api/` → `/api/index.html`), as GitHub Pages does in production.
 */
export function apiIndex({ apiDir, base }) {
	const prefix = `${base.replace(/\/$/, '')}/api`;
	return {
		name: 'docs-api-index',
		configureServer(server) {
			server.middlewares.use((req, _res, next) => {
				const [path, query] = req.url.split('?');
				if (path === prefix || path.startsWith(`${prefix}/`)) {
					const rel = decodeURIComponent(path.slice(prefix.length)).replace(/\/?$/, '/');
					const dir = join(apiDir, rel);
					if (existsSync(dir) && statSync(dir).isDirectory() && existsSync(join(dir, 'index.html'))) {
						req.url = `${prefix}${rel}index.html${query ? `?${query}` : ''}`;
					}
				}
				next();
			});
		},
	};
}

/** Filter out the harmless warning Vite 8 emits for every MDX page. */
export function onBuildWarning(warning, warn) {
	if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning);
}
