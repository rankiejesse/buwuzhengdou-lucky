import {mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
const dir=homedir().replaceAll('\\','/')+'/.codex/app-signing/buwuzhengdou';
await mkdir(dir,{recursive:true});
if(existsSync(dir+'/signing.properties')){console.log('Reusing private Android signing identity');process.exit(0);}
if(existsSync(dir+'/release.p12'))throw Error('Found an existing keystore without its properties. Restore the original signing configuration; do not overwrite it.');
const password=randomBytes(32).toString('hex');
execFileSync('keytool',['-genkeypair','-keystore',dir+'/release.p12','-storetype','PKCS12','-storepass:env','BEAN_STORE_PASS','-keypass:env','BEAN_STORE_PASS','-alias','luckybean','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=Buwuzhengdou Lucky, O=Buwuzhengdou, C=CN'],{env:{...process.env,BEAN_STORE_PASS:password},stdio:['ignore','ignore','ignore']});
await writeFile(dir+'/signing.properties',`storeFile=${dir}/release.p12\nstorePassword=${password}\nkeyAlias=luckybean\nkeyPassword=${password}\n`,{mode:0o600});
console.log('Created signing identity outside the public project. Back it up privately for future upgrades.');
