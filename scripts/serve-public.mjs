// Local preview only. Production runs the same Worker with platform D1/auth.
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {openDatabase} from './local-d1.mjs';
const root=path.resolve(import.meta.dirname,'..');await mkdir(path.join(root,'.deploy'),{recursive:true});
const {DB}=openDatabase(path.join(root,'.deploy/preview.sqlite'));
const source=await readFile(path.join(root,'dist/server/index.js'),'utf8'),worker=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const server=createServer(async(req,res)=>{try{
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1000000){res.writeHead(413);res.end();return;}chunks.push(chunk);}
  // Never trust client-supplied identity headers in a local preview.
  const headers={...req.headers};delete headers['oai-authenticated-user-email'];delete headers['oai-authenticated-user-id'];
  const request=new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
  const response=await worker.default.fetch(request,{DB});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch(error){res.writeHead(500);res.end(error.message);}});
server.listen(Number(process.env.PORT||8001),'127.0.0.1',()=>console.log(`Your Type preview http://127.0.0.1:${server.address().port}`));
