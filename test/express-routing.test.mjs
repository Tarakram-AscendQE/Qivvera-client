import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { defineEndpoint, get, post, onlyWhen, routerFor } from '../dist/api/common/routing.js';
import { reply } from '../dist/api/common/respond.js';
import { idParams } from '../dist/api/common/validate.js';
import { handleErrors, notFound, InputError } from '../dist/api/common/errors.js';

const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
const echo = defineEndpoint({ params: idParams('itemId'), handle: async ({ params, query }) => reply({ params, query }) });
const created = defineEndpoint({ handle: async ({ readBody }) => reply({ body: await readBody(8) }, 201) });
const failing = defineEndpoint({ handle: async () => { throw new InputError('BROKEN', 'Broken on purpose.', 409); } });
const queried = defineEndpoint({
  query: search => { if (search.has('bad')) throw new InputError('QUERY_BAD', 'Bad query.'); return { page: search.get('page') }; },
  handle: async ({ query }) => reply(query)
});

async function serve(t, routes, services = {}) {
  const app = express();
  app.use((req, res, next) => { res.locals.requestId = 'req-1'; res.locals.url = new URL(req.url, 'http://internal'); next(); });
  app.use(routerFor(routes, services));
  app.use(notFound);
  app.use(handleErrors);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  return (path, init) => fetch(`http://127.0.0.1:${server.address().port}${path}`, init);
}

test('express routing / sends the endpoint reply and checks path ids with Zod', async t => {
  const call = await serve(t, [get('/items/:itemId', echo)]);
  const ok = await call(`/items/${id}`);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { params: { itemId: id } });
  assert.equal(ok.headers.get('content-type'), 'application/json; charset=utf-8');
  // A malformed or upper-case id is not this route: the normal 404, not a validation error.
  for (const bad of ['/items/abc', `/items/${id.toUpperCase()}`]) assert.equal((await call(bad)).status, 404);
});

test('express routing / only the declared method runs: no automatic HEAD or OPTIONS replies', async t => {
  const call = await serve(t, [get('/items/:itemId', echo)]);
  for (const method of ['HEAD', 'OPTIONS', 'PUT', 'POST']) {
    const res = await call(`/items/${id}`, { method });
    assert.equal(res.status, 404, method);
    assert.equal(res.headers.get('allow'), null, method);
  }
});

test('express routing / a percent-escaped path is never decoded into a valid-looking id', async t => {
  const call = await serve(t, [get('/items/:itemId', echo)]);
  assert.equal((await call(`/items/${id.replace('f', '%66')}`)).status, 404);
});

test('express routing / query functions and endpoint errors use the standard error body', async t => {
  const call = await serve(t, [get('/search', queried), get('/fail', failing)]);
  assert.deepEqual(await (await call('/search?page=2&page=3')).json(), { page: '2' });
  const bad = await call('/search?bad=1');
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: 'QUERY_BAD', message: 'Bad query.', requestId: 'req-1' });
  const failed = await call('/fail');
  assert.equal(failed.status, 409);
  assert.deepEqual(await failed.json(), { error: 'BROKEN', message: 'Broken on purpose.', requestId: 'req-1' });
});

test('express routing / request bodies keep the JSON, size and content-type rules', async t => {
  const call = await serve(t, [post('/things', created)]);
  const json = body => call('/things', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  assert.deepEqual(await (await json('[1]')).json(), { body: [1] });
  assert.equal((await json('[1,2,3,4,5]')).status, 413);
  assert.equal((await json('{x')).status, 400);
  assert.equal((await call('/things', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '1' })).status, 415);
});

test('express routing / a feature route exists only when its feature is configured', async t => {
  const call = await serve(t, onlyWhen(services => !!services.feature, [get('/feature', queried)]), { feature: null });
  assert.equal((await call('/feature')).status, 404);
});
