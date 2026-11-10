import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
// An installed launch needs only one cached document to paint and run.
const bundled=await build({entryPoints:['dist/app.js'],bundle:true,write:false,format:'iife',target:'chrome80',charset:'utf8',minify:true});
const [template,css,boot]=await Promise.all(['src/index.html','dist/style.css','src/boot.js'].map(p=>readFile(p,'utf8')));
const html=template.replace('<link rel="stylesheet" href="./style.css">',()=>`<script>${boot.replace(/<\/script/gi,'<\\/script')}</script><style>${css}</style>`)
  .replace('<script type="module" src="./app.js"></script>',()=>`<script>${bundled.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script>`);
await writeFile('dist/index.html',html);
// Browser-only entry uses the same origin and database, without promoting a WebAPK install.
const browserHtml=html.replace('<link rel="manifest" href="./manifest.webmanifest">','')
  .replace('<title>不务正豆工作台</title>','<title>不务正豆·浏览器兼容版</title>')
  .replace('不务正豆 · v1.3.0 ·','不务正豆 · 浏览器兼容版 v1.3.0 ·');
await writeFile('dist/browser.html',browserHtml);
console.log('Built self-contained PWA and browser-compatible shell v1.3.0');
