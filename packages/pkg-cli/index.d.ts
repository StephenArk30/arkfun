import { RollupBabelOutputPluginOptions } from '@rollup/plugin-babel';
import { RollupHtmlOptions } from '@rollup/plugin-html';

type IBabelOptions = RollupBabelOutputPluginOptions | undefined;

interface IConfigOptions {
  useTs?: boolean,
  babelOptions?: (options: IBabelOptions) => IBabelOptions,
}

declare function getConfig(input: string, configOptions?: IConfigOptions) : any;

interface IDevConfigOptions extends IConfigOptions {
  htmlOptions?: RollupHtmlOptions,
}

declare function getDevConfig(input: string, configOptions?: IDevConfigOptions): any;

export { getConfig, getDevConfig };
