import {defineConfig} from '@rsbuild/core';
import {pluginReact} from '@rsbuild/plugin-react';
import {pluginSass} from '@rsbuild/plugin-sass';
export default defineConfig({plugins:[pluginReact(),pluginSass()], source:{entry:{index:'./.codex-dialog-check/main.tsx'}},output:{distPath:{root:'.codex-dialog-check/dist'}}});
