import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = { console, Math, Map, Set, Uint8Array, Int32Array, Float64Array };
context.globalThis = context;
context.TypeDeformerMetamorphicBody = { internals: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(new URL('../public/engine/repulsive-curves-body.js', import.meta.url), 'utf8'), context);
const R = context.TypeDeformerRepulsiveCurves.internals;

test('repulsive pre-index preserves nested edge-pair order, locality and weight', () => {
  const edges = [
    { a: 0, b: 1, rest: .2, loop: 0 },
    { a: 1, b: 2, rest: .3, loop: 0 },
    { a: 2, b: 3, rest: .4, loop: 0 },
    { a: 4, b: 5, rest: .5, loop: 1 }
  ];
  const model = { edges, loops: [{ count: 4 }, { count: 2 }] };
  R.indexPairs(model);
  const expected = [];
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const A = edges[i], B = edges[j];
    if (A.a === B.a || A.a === B.b || A.b === B.a || A.b === B.b) continue;
    expected.push([i, j, R.localPair(A, B, model), .2 * Math.sqrt(A.rest * B.rest)]);
  }
  assert.equal(JSON.stringify(model.pairs.map(p => [p.i, p.j, p.local, p.weight])), JSON.stringify(expected));
});

test('tube AABB skip is mathematically conservative for the exact segment cap', () => {
  let seed = 123456789;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * 4 - 2;
  for (let sample = 0; sample < 500; sample++) {
    const x = Float64Array.from({ length: 12 }, random);
    const A = { a: 0, b: 1 }, B = { a: 2, b: 3 };
    const lower = R.boxDistance(R.edgeBox(x, A), R.edgeBox(x, B));
    const exact = R.segmentDistance(x, A, B).distance;
    assert.ok(lower <= exact + 1e-12, `AABB lower bound ${lower} exceeded ${exact}`);
    const radius = random() * .05 + .11;
    if (.4 * lower >= radius) assert.equal(Math.min(radius, .4 * exact), radius);
  }
});
