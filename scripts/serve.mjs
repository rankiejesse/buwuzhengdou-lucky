import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('dist');const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');let file=decodeURIComponent(url.pathname);if(file.endsWith('/'))file+='index.html';const path=resolve(root,'.'+file);if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}const b=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'}).end(b);}catch{res.writeHead(404).end('Not found');}}).listen(4173,'0.0.0.0',()=>console.log('Local: http://localhost:4173'));
