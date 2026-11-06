import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
if(!existsSync('.env.local') && !process.env.DATABASE_URL) {
 mkdirSync('.data',{recursive:true});
 writeFileSync('.env.local',`NEXUS_LOCAL_DB=1\nNEXUS_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}\n`,{mode:0o600});
 console.log('Banco local PostgreSQL embarcado habilitado; use DATABASE_URL para produção.');
}
const args=process.argv.slice(2).filter(arg=>arg!=='--strictPort').map(arg=>arg==='--host'?'--hostname':arg);
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev',...args],{stdio:'inherit'});
child.on('exit',code=>process.exit(code??1));
