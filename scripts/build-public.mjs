import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const shared=['modes/soundscape-visual.js','modes/questions/config.js','modes/questions/input.js','modes/questions/morse.js','modes/questions/data.js','modes/questions/dots.js','modes/questions/demo-seed.js'];
const prelude=(await Promise.all(shared.map(p=>readFile(path.join(root,p),'utf8')))).join('\n');
const entries=[];
async function walk(dir){for(const item of await readdir(path.join(root,dir),{withFileTypes:true})){const p=`${dir}/${item.name}`;if(item.isDirectory())await walk(p);else entries.push(p);}}
for(const dir of ['assets','common','modes'])await walk(dir);
entries.push('index.html','styles.css','app.js','admin.html','admin.js');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wav':'audio/wav','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
const assets={};
for(const p of entries){let bytes=await readFile(path.join(root,p));if(p==='index.html')bytes=Buffer.from(bytes.toString().replace('<head>','<head><script>globalThis.YOUR_TYPE_PUBLIC=true;</script>'));assets['/'+p]=[mime[path.extname(p)]||'application/octet-stream',bytes.toString('base64')];}
const api=await readFile(path.join(root,'server/api.mjs'),'utf8');
const wrapper=`\nconst ASSETS=${JSON.stringify(assets)};\nexport default {async fetch(request,env){const url=new URL(request.url);if(url.pathname.startsWith('/api/'))return api(request,env);if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});let p=url.pathname;if(p==='/')p='/index.html';if(p==='/admin')p='/admin.html';const asset=ASSETS[p];if(!asset)return new Response('Not found',{status:404});const b=Uint8Array.from(atob(asset[1]),c=>c.charCodeAt(0));return new Response(request.method==='HEAD'?null:b,{headers:{'Content-Type':asset[0],'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':'no-cache'}});}};`;
await mkdir(path.join(root,'dist/server'),{recursive:true});await mkdir(path.join(root,'dist/.openai'),{recursive:true});
await writeFile(path.join(root,'dist/server/index.js'),prelude+'\n'+api+wrapper);
await writeFile(path.join(root,'dist/.openai/hosting.json'),await readFile(path.join(root,'.openai/hosting.json')));
console.log(`Built ${entries.length} assets and shared validation into Worker ESM`);
