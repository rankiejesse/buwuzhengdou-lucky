import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
// An installed launch needs only one cached document to paint and run.
const bundled=await build({entryPoints:['dist/app.js'],bundle:true,write:false,format:'iife',target:'chrome80',charset:'utf8',minify:true});
const [template,css,boot]=await Promise.all(['src/index.html','dist/style.css','src/boot.js'].map(p=>readFile(p,'utf8')));
const html=template.replace('<link rel="stylesheet" href="./style.css">',()=>`<script>${boot.replace(/<\/script/gi,'<\\/script')}</script><style>${css}</style>`)
  .replace('<script type="module" src="./app.js"></script>',()=>`<script>${bundled.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')}</script>`);
await writeFile('dist/index.html',html);
console.log('Built self-contained PWA shell v1.0.1');
