import { RollupBabelOutputPluginOptions } from '@rollup/plugin-babel';

type IBabelOptions = RollupBabelOutputPluginOptions | undefined;

declare function getConfig(
    useTs: boolean,
    input: string,
    babelOptions?: (options: IBabelOptions) => IBabelOptions): any;

export { getConfig };
