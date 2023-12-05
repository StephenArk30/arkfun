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
      ...(useTs ? [typescript({
        sourceMap: process.env.NODE_ENV !== 'production',
      })] : []),
    ],
    output: [
      {
        file: `dist/${baseName}.cjs`,
        format: 'cjs',
        plugins: [getBabelOutputPlugin(babelOptions({ presets: ['@babel/preset-env'] }))],
        sourcemap: process.env.NODE_ENV !== 'production',
      },
      {
        file: `dist/${baseName}.mjs`,
        format: 'es',
        sourcemap: process.env.NODE_ENV !== 'production',
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
      sourcemap: process.env.NODE_ENV !== 'production',
    },
    plugins: [
      ...plugins,
      html(htmlOptions),
      serve('dist'),
    ],
  };
}
