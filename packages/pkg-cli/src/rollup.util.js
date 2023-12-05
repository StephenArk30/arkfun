import * as path from 'path';
import typescript from '@rollup/plugin-typescript';
import { getBabelOutputPlugin } from '@rollup/plugin-babel';
import { nodeResolve } from '@rollup/plugin-node-resolve';

import serve from 'rollup-plugin-serve';
import html from '@rollup/plugin-html';

export function getConfig(input, {
  useTs,
  babelOptions = (options) => options,
} = {}) {
  const baseName = path.parse(input).name;
  return {
    input,
    plugins: [
      nodeResolve({
        extensions: ['.js', '.ts'],
      }),
      ...(useTs ? [typescript()] : []),
    ],
    output: [
      {
        file: `dist/${baseName}.cjs`,
        format: 'cjs',
        plugins: [getBabelOutputPlugin(babelOptions({ presets: ['@babel/preset-env'] }))],
      },
      {
        file: `dist/${baseName}.mjs`,
        format: 'es',
      },
    ],
  };
}

export function getDevConfig(input, {
  htmlOptions,
  ...options
} = {}) {
  const { plugins } = getConfig(input, options);
  return {
    input,
    output: {
      dir: 'dist',
    },
    plugins: [
      ...plugins,
      html(htmlOptions),
      serve('dist'),
    ],
  };
}
