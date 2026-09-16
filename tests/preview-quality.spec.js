import { test, expect } from '@playwright/test';

async function waitExact(page,id,after=-1){
  await expect.poll(()=>page.evaluate(({id,after})=>{const s=window.__glyphCurrent.getRenderState();return !s.busy&&!s.error&&s.completedOperator===id&&s.completedMode==='exact'&&s.displayRevision>after;},{id,after}),{timeout:120000}).toBe(true);
}

async function quality(page){
  return page.evaluate(()=>{const r=window.__glyphCurrent.renderer,c=r.canvas,b=r.alphaBounds,dpr=c.width/c.clientWidth,mobile=c.clientWidth<720,marginX=(mobile?54:112)*dpr,marginTop=(mobile?64:68)*dpr,marginBottom=(mobile?142:104)*dpr;return {canvas:[c.width,c.height],bounds:b,upscale:Math.min((c.width-marginX*2)/b.w,(c.height-marginTop-marginBottom)/b.h),clipped:b.x<=3||b.y<=3||b.x+b.w>=c.width-3||b.y+b.h>=c.height-3,status:window.__glyphCurrent.getRenderState().status};});
}

test('exact preview refits real pixels at DPR2 and stays exact after release',async({browser},testInfo)=>{
  test.setTimeout(120000);test.skip(testInfo.project.name!=='chromium-desktop');const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2}),page=await context.newPage();await page.goto('/');await waitExact(page,'liquidRope');
  const word=await quality(page);expect(word.canvas).toEqual([2880,1800]);expect(word.upscale).toBeLessThanOrEqual(1.1);expect(word.clipped).toBe(false);expect(word.status).toMatch(/^READY \d+MS$/);
  await page.locator('#textInput').fill('S');await page.evaluate(()=>window.__glyphCurrent.selectOperator('repulsiveCurves'));await waitExact(page,'repulsiveCurves');const single=await quality(page);expect(single.upscale).toBeLessThanOrEqual(1.1);expect(single.clipped).toBe(false);expect(single.status).toMatch(/^READY \d+MS$/);
  const revision=await page.evaluate(()=>window.__glyphCurrent.getRenderState().displayRevision),slider=page.locator('#primaryInput');await slider.dispatchEvent('pointerdown',{pointerId:7,button:0});await slider.evaluate(input=>{input.value='1.3';input.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('body').dispatchEvent('pointerup',{pointerId:7});await waitExact(page,'repulsiveCurves',revision);const released=await quality(page);expect(released.upscale).toBeLessThanOrEqual(1.1);expect(released.clipped).toBe(false);expect(await page.evaluate(()=>window.__glyphCurrent.getRenderMetrics().events.at(-1).operatorParams.repulsiveForce)).toBe(1.3);await page.screenshot({path:testInfo.outputPath('repulsive-dpr2-exact.png')});await context.close();
});

test('single-glyph Repulsive exact preview also refits at DPR1',async({browser},testInfo)=>{
  test.setTimeout(120000);test.skip(testInfo.project.name!=='chromium-desktop');const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1}),page=await context.newPage();await page.goto('/');await page.locator('#textInput').fill('S');await page.evaluate(()=>window.__glyphCurrent.selectOperator('repulsiveCurves'));await waitExact(page,'repulsiveCurves');const result=await quality(page);expect(result.canvas).toEqual([1440,900]);expect(result.upscale).toBeLessThanOrEqual(1.1);expect(result.clipped).toBe(false);expect(result.status).toMatch(/^READY \d+MS$/);await context.close();
});
