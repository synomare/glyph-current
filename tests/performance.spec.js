import { test, expect } from '@playwright/test';

async function waitExact(page,id,after=-1){
  await expect.poll(()=>page.evaluate(({id,after})=>{const s=window.__glyphCurrent.getRenderState();return !s.busy&&!s.error&&s.completedOperator===id&&s.completedMode==='exact'&&s.sequence>after;},{id,after}),{timeout:110000}).toBe(true);
}

async function bitmapFingerprint(page){
  return page.evaluate(()=>{const bitmap=window.__glyphCurrent.renderer.bitmap,canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);const data=context.getImageData(0,0,canvas.width,canvas.height).data;let hash=2166136261;for(let i=0;i<data.length;i++)hash=Math.imul(hash^data[i],16777619);return {hash:hash>>>0,width:canvas.width,height:canvas.height,bounds:window.__glyphCurrent.renderer.alphaBounds};});
}

test('range gestures coalesce real drafts and release the latest exact state',async({page},testInfo)=>{
  test.setTimeout(150000);test.skip(testInfo.project.name!=='chromium-desktop');await page.goto('/');await waitExact(page,'liquidRope');await page.waitForTimeout(200);if(await page.evaluate(()=>window.__glyphCurrent.getRenderState().busy))await waitExact(page,'liquidRope');
  const original=await page.locator('#primaryInput').inputValue(),before=await page.evaluate(()=>window.__glyphCurrent.getRenderMetrics());
  const completedRevision=await page.evaluate(()=>window.__glyphCurrent.getRenderState().displayRevision);
  await page.locator('#primaryInput').dispatchEvent('pointerdown',{button:0,pointerId:1});
  for(const [index,value] of [.12,.14,.16,.18,.20,.22,.24,.26,.28,.30].entries()){
    await page.locator('#primaryInput').evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},value);
    if(index===0)expect(await page.evaluate(()=>window.__glyphCurrent.getRenderState().displayRevision)).toBe(completedRevision);
    await page.waitForTimeout(45);
  }
  await expect.poll(()=>page.evaluate(count=>window.__glyphCurrent.getRenderMetrics().draftCount-count,before.draftCount),{timeout:15000}).toBeGreaterThanOrEqual(2);
  const live=await page.evaluate(()=>window.__glyphCurrent.getRenderState());expect(live.completedMode).toBe('draft');expect(live.metrics.coalescedDrafts-before.coalescedDrafts).toBeGreaterThan(0);expect(live.bitmap.width).toBeLessThan(500);await page.screenshot({path:testInfo.outputPath('live-draft-desktop.png')});
  const sequence=live.sequence;await page.locator('body').dispatchEvent('pointerup',{button:0,pointerId:1});await waitExact(page,'liquidRope',sequence);
  const final=await page.evaluate(()=>window.__glyphCurrent.getRenderState()),events=final.metrics.events.slice(before.events.length);expect(final.status).toMatch(/^READY/);expect(final.metrics.lastCompletedMode).toBe('exact');expect(events.some(event=>event.mode==='draft')).toBe(true);expect(events.at(-1).mode).toBe('exact');expect(events.at(-1).operatorParams.ropeRadius).toBe(.3);await page.screenshot({path:testInfo.outputPath('exact-desktop.png')});
  await page.locator('#undoButton').click();expect(await page.locator('#primaryInput').inputValue()).toBe(original);await page.evaluate(()=>window.__glyphCurrent.renderer.cancel());
});

test('Details ranges for every operator send visible drafts through the shared queue',async({page},testInfo)=>{
  test.setTimeout(60000);test.skip(testInfo.project.name!=='chromium-desktop');await page.goto('/');
  const operators=[['liquidRope','ropeRadius'],['sinewTorque','sinewTorque'],['repulsiveCurves','repulsiveForce'],['differentialType','differentialAge'],['marblingType','marblingAmount'],['asemicDuctus','asemicMemory']],durations={},series={};
  for(const [id,key] of operators){
    await page.evaluate(id=>window.__glyphCurrent.selectOperator(id),id);await page.locator('#detailsButton').click();
    const slider=page.locator(`#param-${key}`),samples=[];let expected;
    for(const fraction of [.31,.43,.55]){const before=await page.evaluate(()=>window.__glyphCurrent.getRenderMetrics().draftCount);expected=await slider.evaluate((input,fraction)=>{const min=Number(input.min),max=Number(input.max),step=Number(input.step),value=Math.round((min+(max-min)*fraction)/step)*step;input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));return value;},fraction);await expect.poll(()=>page.evaluate(before=>window.__glyphCurrent.getRenderMetrics().draftCount>before,before),{timeout:30000}).toBe(true);samples.push(await page.evaluate(()=>window.__glyphCurrent.getRenderMetrics().lastDraftMs));}
    const render=await page.evaluate(()=>window.__glyphCurrent.getRenderState());expect(render.completedOperator).toBe(id);expect(render.completedMode).toBe('draft');expect(render.error).toBe(false);expect(render.alphaBounds.w*render.alphaBounds.h).toBeGreaterThan(20);series[id]=samples.slice();durations[id]=samples.slice().sort((a,b)=>a-b)[1];
    expect(Number(await slider.inputValue())).toBeCloseTo(expected,5);await page.locator('#detailsButton').click();
  }
  await page.locator('#textInput').fill('S');await page.evaluate(()=>window.__glyphCurrent.selectOperator('repulsiveCurves'));const repBefore=await page.evaluate(()=>window.__glyphCurrent.getRenderMetrics().draftCount);await page.locator('#primaryInput').evaluate(input=>{input.value='1.1';input.dispatchEvent(new Event('input',{bubbles:true}));});await expect.poll(()=>page.evaluate(before=>window.__glyphCurrent.getRenderMetrics().draftCount>before,repBefore),{timeout:10000}).toBe(true);expect(await page.evaluate(()=>{const b=window.__glyphCurrent.getRenderState().alphaBounds;return b.w*b.h;})).toBeGreaterThan(20);await page.screenshot({path:testInfo.outputPath('repulsive-one-glyph-draft.png')});
  console.log('DETAIL_DRAFT_MS',JSON.stringify({medians:durations,series}));await page.evaluate(()=>window.__glyphCurrent.renderer.cancel());
});

test('single-pass preview tiling is pixel-identical to the bounded legacy tiles',async({page},testInfo)=>{
  test.setTimeout(120000);test.skip(testInfo.project.name!=='chromium-desktop');await page.goto('/');await waitExact(page,'liquidRope');
  let revision=await page.evaluate(()=>window.__glyphCurrent.getRenderState().displayRevision);await page.evaluate(()=>window.__glyphCurrent.renderer.requestExact(window.__glyphCurrent.getState(),{tileMode:'legacy'}));await expect.poll(()=>page.evaluate(r=>window.__glyphCurrent.getRenderState().displayRevision>r,revision),{timeout:110000}).toBe(true);const legacy=await bitmapFingerprint(page),legacyEvent=await page.evaluate(()=>window.__glyphCurrent.getRenderMetrics().events.at(-1));
  revision=await page.evaluate(()=>window.__glyphCurrent.getRenderState().displayRevision);await page.evaluate(()=>window.__glyphCurrent.renderer.requestExact(window.__glyphCurrent.getState(),{tileMode:'single'}));await expect.poll(()=>page.evaluate(r=>window.__glyphCurrent.getRenderState().displayRevision>r,revision),{timeout:110000}).toBe(true);const single=await bitmapFingerprint(page),singleEvent=await page.evaluate(()=>window.__glyphCurrent.getRenderMetrics().events.at(-1));
  expect(legacyEvent.diagnostics.tileMode).toBe('legacy');expect(legacyEvent.diagnostics.tiles).toBeGreaterThan(1);expect(singleEvent.diagnostics.tileMode).toBe('single');expect(singleEvent.diagnostics.tiles).toBe(1);expect(single).toEqual(legacy);
});

test('Differential LIVE replays prepared exact-geometry history across gestures',async({page},testInfo)=>{
  test.setTimeout(120000);test.skip(testInfo.project.name!=='chromium-desktop');await page.goto('/');await waitExact(page,'liquidRope');await page.evaluate(()=>window.__glyphCurrent.selectOperator('differentialType'));await waitExact(page,'differentialType');
  const slider=page.locator('#primaryInput');await slider.dispatchEvent('pointerdown',{pointerId:4,button:0});let before=await page.evaluate(()=>{window.__differentialExactWorker=window.__glyphCurrent.renderer.exactWorker;return window.__glyphCurrent.getRenderMetrics().draftCount;});await slider.evaluate(input=>{input.value='4.2';input.dispatchEvent(new Event('input',{bubbles:true}));});await expect.poll(()=>page.evaluate(n=>window.__glyphCurrent.getRenderMetrics().draftCount>n,before),{timeout:30000}).toBe(true);const cold=await page.evaluate(()=>window.__glyphCurrent.getRenderMetrics().lastDraftMs);
  await page.locator('body').dispatchEvent('pointerup',{pointerId:4});await waitExact(page,'differentialType');const release=await page.evaluate(()=>window.__glyphCurrent.getRenderMetrics().lastExactMs);expect(await page.evaluate(()=>window.__glyphCurrent.renderer.exactWorker===window.__differentialExactWorker)).toBe(true);
  await slider.dispatchEvent('pointerdown',{pointerId:5,button:0});before=await page.evaluate(()=>window.__glyphCurrent.getRenderMetrics().draftCount);await slider.evaluate(input=>{input.value='3.1';input.dispatchEvent(new Event('input',{bubbles:true}));});await expect.poll(()=>page.evaluate(n=>window.__glyphCurrent.getRenderMetrics().draftCount>n,before),{timeout:30000}).toBe(true);const warm=await page.evaluate(()=>window.__glyphCurrent.getRenderMetrics().lastDraftMs);expect(warm).toBeLessThan(cold);console.log('DIFFERENTIAL_HISTORY_MS',JSON.stringify({cold,release,warm}));await page.locator('body').dispatchEvent('pointerup',{pointerId:5});await waitExact(page,'differentialType');
  const revision=await page.evaluate(()=>window.__glyphCurrent.getRenderState().displayRevision);await slider.dispatchEvent('pointerdown',{pointerId:6,button:0});await slider.evaluate(input=>{input.value='4.8';input.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('body').dispatchEvent('pointerup',{pointerId:6});await expect.poll(()=>page.evaluate(r=>{const state=window.__glyphCurrent.getRenderState(),event=state.metrics.events.at(-1);return state.displayRevision>r&&!state.busy&&!state.metrics.queuedExact&&state.completedMode==='exact'&&event?.operatorParams?.differentialAge===4.8;},revision),{timeout:30000}).toBe(true);
});
