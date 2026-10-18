import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
export function openDatabase(filename=':memory:'){
  const fresh=filename===':memory:'||!existsSync(filename),sqlite=new DatabaseSync(filename);
  if(fresh)sqlite.exec(readFileSync(path.resolve(import.meta.dirname,'../drizzle/0000_your_type.sql'),'utf8').replaceAll('--> statement-breakpoint',''));
  const DB={prepare(sql){return {args:[],bind(...args){this.args=args;return this;},async first(){return sqlite.prepare(sql).get(...this.args)||null;},async all(){return {results:sqlite.prepare(sql).all(...this.args)};},async run(){return {meta:sqlite.prepare(sql).run(...this.args)};}};},async batch(statements){sqlite.exec('BEGIN');try{const values=[];for(const s of statements)values.push(await s.run());sqlite.exec('COMMIT');return values;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
  return {DB,sqlite};
}
