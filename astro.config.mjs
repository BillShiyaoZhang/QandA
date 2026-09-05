import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  outDir: process.env.BUILD_OUT_DIR || './dist',
  site: process.env.SITE_URL || 'https://billshiyaozhang.github.io',
  base: process.env.SITE_BASE || '/',
  trailingSlash: 'always',
  build: { format: 'directory' },
  vite: { define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) } },
});
