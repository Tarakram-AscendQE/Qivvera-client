import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHealthServer } from '../scripts/health-server.mjs';

test('health endpoint runs on a real local socket and does not claim product readiness',async t=>{
  const server=createHealthServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const address=server.address();const base=`http://127.0.0.1:${address.port}`;
  const response=await fetch(`${base}/healthz`);
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.service,'qivvera-foundation');
  assert.equal(body.productReady,false);
  assert.equal(body.process,'running');
  assert.equal(response.headers.get('cache-control'),'no-store');
});

test('there is no unauthenticated assurance-decision endpoint',async t=>{
  const server=createHealthServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base=`http://127.0.0.1:${server.address().port}`;
  for (const path of ['/api/evaluate','/api/changes','/']) {
    const response=await fetch(`${base}${path}`,{method:'POST',body:'{}'});
    assert.equal(response.status,404);
  }
});
