import { getDevConfig } from '@arkfun/pkg-cli';
import { RollupHtmlTemplateOptions, makeHtmlAttributes } from '@rollup/plugin-html';

export default {
  ...getDevConfig('example/index.ts', {
    useTs: true,
    htmlOptions: {
      template: ({
        attributes,
        files,
        meta,
        publicPath,
      }: RollupHtmlTemplateOptions) => {
        const scripts = (files.js || [])
          .map(({ fileName }) => {
            const attrs = makeHtmlAttributes(attributes.script);
            return `<script src="${publicPath}${fileName}"${attrs}></script>`;
          })
          .join('\n');

        const links = (files.css || [])
          .map(({ fileName }) => {
            const attrs = makeHtmlAttributes(attributes.link);
            return `<link href="${publicPath}${fileName}" rel="stylesheet"${attrs}>`;
          })
          .join('\n');

        const metas = meta
          .map((input) => {
            const attrs = makeHtmlAttributes(input);
            return `<meta${attrs}>`;
          })
          .join('\n');

        return `
<!doctype html>
<html${makeHtmlAttributes(attributes.html)}>
  <head>
    ${metas}
    <title>snakegame</title>
    ${links}
  </head>
  <body>
      <canvas id="snake_container" width="500" height="500"></canvas>${scripts}
  </body>
</html>`;
      },
    },
  }),
};
