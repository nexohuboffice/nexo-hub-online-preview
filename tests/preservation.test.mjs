import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
test('entire published v0.7.3 is preserved, including all eight sections and Voice Demo',()=>{
  const html=readFileSync(new URL('index.html',root),'utf8');
  const original=html.replace('<link rel="stylesheet" href="./live.css">','')
    .replace('<script src="./public-config.js"></script>','').replace('<script src="./live.js"></script>','')
    .replace(/\r\n/g,'\n').trimEnd();
  assert.equal(createHash('sha256').update(original).digest('hex'),'61d3ee6f7e3e2be2b17d0c79df13268d1a207b269471b4935335aeaddf7b9bcf');
  assert.ok(html.indexOf('public-config.js')<html.indexOf('const M=NexoModel'));
});
test('public configuration is inactive; private data has no storage, markup or demo-state sink',()=>{
  const config=readFileSync(new URL('public-config.js',root),'utf8');
  assert.match(config,/gatewayOrigin: ''/);
  const live=readFileSync(new URL('live.js',root),'utf8');
  assert.doesNotMatch(live,/localStorage|sessionStorage|indexedDB|innerHTML|\.write\(|state\.missions/);
});
