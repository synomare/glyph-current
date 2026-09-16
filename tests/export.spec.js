import { test, expect } from '@playwright/test';

const operators=['liquidRope','sinewTorque','repulsiveCurves','differentialType','marblingType','asemicDuctus'];

async function inspectExport(page,operator,options={}){
  return page.evaluate(async ({operator,options})=>{
    const state=structuredClone(window.__glyphCurrent.getState());state.operator=operator;state.params.activeOperator=operator;state.text='S';
    const result=await window.__glyphCurrent.renderer.export(state,options),bitmap=await createImageBitmap(result.blob),canvas=new OffscreenCanvas(bitmap.width,bitmap.height),context=canvas.getContext('2d');context.drawImage(bitmap,0,0);bitmap.close();
    const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;let alpha=0,transparent=0;
    for(let i=3;i<pixels.length;i+=Math.max(4,Math.floor(pixels.length/6000/4)*4)){if(pixels[i]>2)alpha++;else transparent++;}
    return {size:result.blob.size,width:result.width,height:result.height,requestedScale:result.requestedScale,actualScale:result.actualScale,reduced:result.reduced,reductionReason:result.reductionReason,alpha,transparent,type:result.blob.type,exporting:window.__glyphCurrent.renderer.exporting};
  },{operator,options});
}

test('all six operators encode a decodable nonblank PNG in the Worker',async({page},testInfo)=>{
  test.setTimeout(240000);test.skip(testInfo.project.name!=='chromium-desktop');await page.goto('/');
  for(const operator of operators){const result=await inspectExport(page,operator,{scale:.25,background:false,format:'png'});expect(result.type).toBe('image/png');expect(result.size).toBeGreaterThan(300);expect(result.width).toBeGreaterThan(20);expect(result.height).toBeGreaterThan(20);expect(result.alpha,operator).toBeGreaterThan(2);expect(result.exporting).toBe(false);}
});

test('Repulsive 4x stays exact and constrained output falls back visibly',async({page},testInfo)=>{
  test.setTimeout(180000);test.skip(testInfo.project.name!=='chromium-desktop');await page.goto('/');
  const full=await inspectExport(page,'repulsiveCurves',{scale:4,background:true,format:'png'});expect(full.actualScale).toBe(4);expect(full.reduced).toBe(false);expect(full.width*full.height).toBeLessThanOrEqual(24_000_000);expect(full.alpha).toBeGreaterThan(2);expect(full.transparent).toBe(0);
  const constrained=await inspectExport(page,'repulsiveCurves',{scale:4,background:false,format:'png',maxPixels:120000,maxSide:512,minScale:.03});expect(constrained.reduced).toBe(true);expect(constrained.actualScale).toBeLessThan(4);expect(constrained.width*constrained.height).toBeLessThanOrEqual(120000);expect(constrained.alpha).toBeGreaterThan(2);expect(constrained.transparent).toBeGreaterThan(0);
});

test('allocation failure unlocks export and persistent download link can retry',async({page},testInfo)=>{
  test.setTimeout(120000);test.skip(testInfo.project.name!=='chromium-desktop');await page.goto('/');
  const recovered=await page.evaluate(async()=>{
    const state=structuredClone(window.__glyphCurrent.getState());state.text='S';let message='';
    try{await window.__glyphCurrent.renderer.export(state,{scale:4,maxPixels:65536,maxSide:256,minScale:4,format:'png'});}catch(error){message=error.message;}
    const result=await window.__glyphCurrent.renderer.export(state,{scale:.25,background:false,format:'png'});return {message,size:result.blob.size,exporting:window.__glyphCurrent.renderer.exporting};
  });
  expect(recovered.message).toContain('safe memory budget');expect(recovered.size).toBeGreaterThan(300);expect(recovered.exporting).toBe(false);
  await page.locator('#exportButton').click();await page.locator('#exportScale').selectOption('1');const first=page.waitForEvent('download');await page.locator('#pngButton').click();await first;
  await expect(page.locator('#pngButton')).toBeEnabled();await expect(page.locator('#svgButton')).toBeEnabled();await expect(page.locator('#exportDownload')).toBeVisible();await expect(page.locator('#exportNote')).toContainText('Ready:');
  const retry=page.waitForEvent('download');await page.locator('#exportDownload').click();await retry;
});

test('a real Worker allocation error recreates the Worker and retries smaller',async({page},testInfo)=>{
  test.setTimeout(120000);test.skip(testInfo.project.name!=='chromium-desktop');
  await page.route('**/engine/surface-worker.js',async route=>{const response=await route.fetch(),source=await response.text(),needle="const canvas=new OffscreenCanvas(frame.width,frame.height)";expect(source).toContain(needle);await route.fulfill({response,body:source.replace(needle,"if(frame.encode==='image/png'&&frame.width*frame.height>180000)throw new RangeError('Simulated memory allocation failure');const canvas=new OffscreenCanvas(frame.width,frame.height)")});});
  await page.goto('/');const result=await inspectExport(page,'liquidRope',{scale:1,background:false,format:'png',minScale:.03});expect(result.reduced).toBe(true);expect(result.reductionReason).toBe('browser memory limit');expect(result.width*result.height).toBeLessThanOrEqual(180000);expect(result.alpha).toBeGreaterThan(2);expect(result.exporting).toBe(false);
});

test('SVG reuses the Worker PNG and preserves exact dimensions',async({page},testInfo)=>{
  test.setTimeout(120000);test.skip(testInfo.project.name!=='chromium-desktop');await page.goto('/');
  const result=await page.evaluate(async()=>{const state=structuredClone(window.__glyphCurrent.getState());state.text='S';const exported=await window.__glyphCurrent.renderer.export(state,{scale:.25,background:false,format:'svg'}),text=await exported.blob.text();return {size:exported.blob.size,width:exported.width,height:exported.height,text};});
  expect(result.size).toBeGreaterThan(400);expect(result.text).toContain(`width="${result.width}"`);expect(result.text).toContain(`height="${result.height}"`);expect(result.text).toContain('data:image/png;base64,');
});

test('small PNG has a bounded main-thread encoding fallback',async({page},testInfo)=>{
  test.setTimeout(120000);test.skip(testInfo.project.name!=='chromium-desktop');await page.goto('/');
  const result=await inspectExport(page,'liquidRope',{scale:.25,background:false,format:'png',forceMainThreadEncode:true});expect(result.type).toBe('image/png');expect(result.size).toBeGreaterThan(300);expect(result.alpha).toBeGreaterThan(2);expect(result.exporting).toBe(false);
});
