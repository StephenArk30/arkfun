import typescript from '@rollup/plugin-typescript';
import { getBabelOutputPlugin } from '@rollup/plugin-babel';
import { nodeResolve } from '@rollup/plugin-node-resolve';

export default function getConfig(useTs, input, babelOptions = (options) => options) {
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
        file: `dist/${input}.umd.js`,
        format: 'umd',
        plugins: [getBabelOutputPlugin(babelOptions({ presets: ['@babel/preset-env'] }))],
      },
      {
        file: `dist/${input}.esm.js`,
        format: 'es',
      },
    ],
  };
}
