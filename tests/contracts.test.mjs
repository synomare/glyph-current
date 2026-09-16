import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const operators = fs.readFileSync(new URL('../src/operators.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../public/engine/surface-worker-kernels.js', import.meta.url), 'utf8');
const manifest = JSON.parse(fs.readFileSync(new URL('../public/engine/upstream-manifest.json', import.meta.url), 'utf8'));

test('the independent engine contains exactly the selected six operators', () => {
  const expected=['liquidRope','sinewTorque','repulsiveCurves','differentialType','marblingType','asemicDuctus'];
  assert.deepEqual(manifest.operators, expected);
  for (const id of expected) { assert.match(operators, new RegExp(`${id}:`)); assert.match(worker, new RegExp(`${id}:`)); }
});

test('the extracted engine records the approved upstream revision', () => {
  assert.equal(manifest.sourceRevision, '501f8b5dddcab795d8f12cee51fca1b0b894610f');
  assert.deepEqual(manifest.unknown, []);
});

test('renderer fixes effect strength at one while keeping sinew torque separate', () => {
  const renderer=fs.readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
  assert.match(renderer,/const surface = \{ \[state\.operator\]: 1 \}/);
  assert.match(renderer,/strength:1,/);
  assert.match(renderer,/surface\.sinewTorqueAmount = state\.operatorParams\.sinewTorque\.sinewTorque/);
});

test('legacy partial-strength projects normalize and serialize at full effect', async () => {
  const { createInitialState, normalizeProject, serializableState }=await import('../src/state.js');
  const legacy=createInitialState();legacy.strength=0;
  assert.equal(normalizeProject(legacy).strength,1);
  assert.equal(serializableState(legacy).strength,1);
});

test('project normalization preserves long multiline text instead of truncating it', async () => {
  const { createInitialState, normalizeProject, serializableState }=await import('../src/state.js');
  const state=createInitialState();state.text=`${'線'.repeat(120)}\n${'flow '.repeat(30)}`;
  assert.equal(normalizeProject(serializableState(state)).text,state.text);
});

test('render context release clears accounting from reuse and creator contexts', () => {
  class FakeCanvas {
    constructor(width=1,height=1){this.width=width;this.height=height;}
    getContext(){return {setTransform(){},getTransform(){return {a:1,b:0,c:0,d:1,e:0,f:0};}};}
  }
  const sandbox={OffscreenCanvas:FakeCanvas,globalThis:null};sandbox.globalThis=sandbox;
  vm.runInNewContext(fs.readFileSync(new URL('../public/engine/render-context.js',import.meta.url),'utf8'),sandbox);
  const R=sandbox.TypeDeformerRenderContext,a=R.make({factor:2,memoryBudget:1024*1024}),b=R.make({factor:2,memoryBudget:1024*1024});
  let canvas;R.withContext(a,()=>{canvas=R.createCanvas(10,10);});
  assert.ok(a.bytes>0);
  R.withContext(b,()=>{R.account(canvas);assert.ok(b.bytes>0);R.release(canvas);});
  assert.equal(a.bytes,0);assert.equal(b.bytes,0);
});
