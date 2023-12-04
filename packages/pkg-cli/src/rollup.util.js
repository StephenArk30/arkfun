import typescript from '@rollup/plugin-typescript';
import { getBabelOutputPlugin } from '@rollup/plugin-babel';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import * as path from 'path';

export default function getConfig(useTs, input, babelOptions = (options) => options) {
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
