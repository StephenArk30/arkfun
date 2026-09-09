import { getDevConfig } from '@arkfun/pkg-cli';
import { RollupHtmlTemplateOptions, makeHtmlAttributes } from '@rollup/plugin-html';
import serve from 'rollup-plugin-serve';
import type { Plugin } from 'rollup';

const config = getDevConfig('example/index.ts', {
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
        .map((input) => `<meta${makeHtmlAttributes(input)}>`)
        .join('\n');

      return `
<!doctype html>
<html${makeHtmlAttributes(attributes.html)}>
  <head>
    ${metas}
    <title>snakegame-ai</title>
    <style>
      body { background: #111; color: #ddd; font-family: system-ui, sans-serif; margin: 24px; }
      canvas { background: #000; display: block; }
      .row { margin: 8px 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
      label { font-size: 13px; color: #aaa; }
      input, select { background: #222; color: #ddd; border: 1px solid #444; border-radius: 4px; padding: 4px 8px; }
      button { background: #2d6; color: #04110a; border: 0; border-radius: 4px; padding: 6px 16px; font-weight: 600; cursor: pointer; }
      button.stop { background: #d63; color: #1a0503; }
      #status { margin-left: 12px; color: #fc6; font-size: 13px; }
      #compare { display: none; margin-top: 24px; }
      #compare table { border-collapse: collapse; margin: 8px 0 16px; font-size: 13px; }
      #compare td, #compare tr { border: 1px solid #333; padding: 3px 10px; }
    </style>
    ${links}
  </head>
  <body>
    <div class="row">
      <label>地图 <input id="col" type="number" value="20" min="5" max="60" style="width:56px"> ×
        <input id="row" type="number" value="20" min="5" max="60" style="width:56px"></label>
      <label>障碍上限 <input id="barriers" type="number" value="10" min="0" max="200" style="width:56px"></label>
      <label>帧间隔 ms <input id="speed" type="number" value="80" min="0" max="2000" style="width:64px"></label>
    </div>
    <div class="row">
      <label>策略 <select id="strategy"></select></label>
      <label>自定义模型 <input id="file" type="file" accept=".onnx"></label>
      <button id="start">开始</button>
      <button id="stop" class="stop">停止</button>
      <span id="status">加载中...</span>
    </div>
    <canvas id="snake_container" width="600" height="600"></canvas>
    <div id="compare"></div>${scripts}
  </body>
</html>`;
    },
  },
});

// 把 getDevConfig 内置的 serve('dist') 替换为多目录：
// dist（构建产物）优先，models/（onnx 模型 + compare.json）兜底，
// node_modules/onnxruntime-web/dist（ort 运行时 + wasm）兜底，
// demo 用根相对路径（'ppo.onnx'、'ort.min.js'）加载，无需拷贝步骤、无 CDN 依赖
config.plugins = (config.plugins as Plugin[]).map(
  (plugin) => (plugin && plugin.name === 'serve'
    ? serve({ contentBase: ['dist', 'models', 'node_modules/onnxruntime-web/dist'] })
    : plugin),
);

export default config;
