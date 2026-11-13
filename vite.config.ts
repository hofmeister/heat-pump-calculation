import { defineConfig, type Plugin } from 'vite';
import { buildGuide } from './src/aiGuide';

/** Serves and emits /llms.txt — instructions for AI assistants, generated from the same help texts as the UI. */
function llmsTxt(): Plugin {
  return {
    name: 'llms-txt',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.endsWith('/llms.txt')) return next();
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(buildGuide());
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'llms.txt', source: buildGuide() });
    },
  };
}

// Relative base so the build works from any static host or sub-path (e.g. GitHub Pages).
export default defineConfig({ base: './', plugins: [llmsTxt()] });
