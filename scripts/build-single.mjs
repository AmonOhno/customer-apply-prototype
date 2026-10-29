// 1ファイルで動くHTML（dist-single/index.html）を作る。
// React は cdnjs の UMD 版を読み込み、アプリのJS/CSSはインライン化する。
// 共有用プレビューやファイル1つでの配布に使う。通常の開発・ビルドは `npm run dev` / `npm run build`。
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REACT_VERSION = '18.3.1';

const globals = {
  react: 'module.exports = window.React;',
  'react-dom': 'module.exports = window.ReactDOM;',
  'react-dom/client': 'module.exports = window.ReactDOM;',
  // 自動JSXランタイムを UMD 版 React.createElement で代替する
  'react/jsx-runtime': `
    const R = window.React;
    const jsx = (type, props, key) => R.createElement(type, key === undefined ? props : { ...props, key });
    module.exports = { jsx, jsxs: jsx, Fragment: R.Fragment };`,
};

const umdGlobals = {
  name: 'umd-globals',
  setup(b) {
    b.onResolve({ filter: /^react(-dom)?(\/client|\/jsx-runtime)?$/ }, (args) => ({ path: args.path, namespace: 'umd' }));
    b.onLoad({ filter: /.*/, namespace: 'umd' }, (args) => ({ contents: globals[args.path], loader: 'js' }));
    // CSS は別途インライン化する
    b.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: 'css-skip' }));
    b.onLoad({ filter: /.*/, namespace: 'css-skip' }, () => ({ contents: '', loader: 'js' }));
  },
};

const result = await build({
  entryPoints: [resolve(root, 'src/main.tsx')],
  bundle: true,
  write: false,
  minify: true,
  format: 'iife',
  target: 'es2020',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [umdGlobals],
  logLevel: 'warning',
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile(resolve(root, 'src/styles.css'), 'utf8');

const html = `<title>取引先マスタ</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+JP:wght@400;500;600;700&display=swap">
<style>
${css}
</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/${REACT_VERSION}/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/${REACT_VERSION}/umd/react-dom.production.min.js"></script>
<script>
${js}
</script>
`;

await mkdir(resolve(root, 'dist-single'), { recursive: true });
await writeFile(resolve(root, 'dist-single/index.html'), html);
console.log(`dist-single/index.html (${(html.length / 1024).toFixed(1)} KB)`);
