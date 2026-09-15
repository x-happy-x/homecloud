import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  html: {
    template: './public/index.html',
  },
  source: {
    entry: {
      index: './src/main.tsx',
    },
  },
  output: {
    distPath: {
      root: 'dist',
    },
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4180',
      '/media': 'http://127.0.0.1:4180',
    },
  },
});
