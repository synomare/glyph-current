import { test, expect } from '@playwright/test';
import fs from 'node:fs';

async function waitForOperator(page,id,after=-1){
  await expect.poll(()=>page.evaluate(({id,after})=>{const state=window.__glyphCurrent.getRenderState();return state.completedOperator===id&&!state.busy&&!state.error&&state.sequence>after;},{id,after}),{timeout:110000}).toBe(true);
}

test('app loads, renders, switches operator and opens details', async ({ page },testInfo) => {
  test.skip(testInfo.project.name!=='chromium-desktop');
  const errors=[];page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle('GLYPH CURRENT');
  await expect(page.locator('#activeOperator')).toHaveText('Liquid Rope');await waitForOperator(page,'liquidRope');
  await expect(page.locator('#renderStatus')).not.toHaveClass(/is-error/);
  await page.locator('#operatorMenuButton').click();const sequence=await page.evaluate(()=>window.__glyphCurrent.getRenderState().sequence);
  await page.locator('[data-operator="sinewTorque"]').click();await expect(page.locator('#activeOperator')).toHaveText('Sinew Torque');await waitForOperator(page,'sinewTorque',sequence);
  await page.locator('#detailsButton').click();await expect(page.locator('#detailsPanel')).toBeVisible();await expect(page.locator('#parameterControls input[type="number"]')).toHaveCount(5);
  const before=await page.evaluate(()=>window.__glyphCurrent.getState().operatorParams.sinewTorque.sinewPull);
  await page.locator('#param-sinewPull + .number-input').evaluate(input=>{input.value='';input.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(await page.evaluate(()=>window.__glyphCurrent.getState().operatorParams.sinewTorque.sinewPull)).toBe(before);await expect(page.locator('body')).not.toHaveCSS('overflow-x','auto');expect(errors).toEqual([]);
});

test('text, undo, project round trip, font import, PNG and SVG work', async ({ page }, testInfo) => {
  test.setTimeout(240000);test.skip(testInfo.project.name!=='chromium-desktop');
  await page.goto('/');await waitForOperator(page,'liquidRope');
  const input=page.locator('#textInput');await input.fill('線\nFLOW');await input.blur();await expect.poll(()=>page.evaluate(()=>window.__glyphCurrent.getState().text)).toBe('線\nFLOW');
  await page.locator('#undoButton').click();await expect.poll(()=>page.evaluate(()=>window.__glyphCurrent.getState().text)).not.toBe('線\nFLOW');
  await page.locator('#redoButton').click();await expect.poll(()=>page.evaluate(()=>window.__glyphCurrent.getState().text)).toBe('線\nFLOW');

  const fontPath='C:/Windows/Fonts/arial.ttf';test.skip(!fs.existsSync(fontPath),'Arial test font is unavailable on this Windows host.');
  await page.locator('#detailsButton').click();await page.locator('#fontInput').setInputFiles(fontPath);
  await expect.poll(()=>page.evaluate(()=>window.__glyphCurrent.getState().font.imported),{timeout:30000}).toBe(true);await expect(page.locator('#statusText')).toContainText(/FONT READY|READY/, {timeout:100000});
  const importedFamily=await page.evaluate(()=>window.__glyphCurrent.getState().font.family);
  await page.locator('#undoButton').click();await expect.poll(()=>page.evaluate(()=>window.__glyphCurrent.getState().font.imported)).toBe(false);
  await page.locator('#redoButton').click();await expect.poll(()=>page.evaluate(()=>window.__glyphCurrent.getState().font.family)).toBe(importedFamily);await expect.poll(()=>page.evaluate(()=>window.__glyphCurrent.renderer.fontRecord?.family||null)).not.toBe(null);

  await page.locator('#exportButton').click();const projectDownload=page.waitForEvent('download');await page.locator('#saveProjectButton').click();const project=await projectDownload;const projectPath=testInfo.outputPath('glyph-current-project.json');await project.saveAs(projectPath);
  const saved=JSON.parse(fs.readFileSync(projectPath,'utf8'));expect(saved.schema).toBe('glyph-current/project@1');expect(saved.text).toBe('線\nFLOW');expect(saved.font.imported).toBe(true);
  await page.locator('#loadProjectInput').setInputFiles(projectPath);await expect(page.locator('#statusText')).toContainText('RESELECT THE IMPORTED FONT');expect(await page.evaluate(()=>window.__glyphCurrent.renderer.fontRecord)).toBe(null);

  await page.locator('#exportButton').click();await page.locator('#exportScale').selectOption('1');
  const pngDownload=page.waitForEvent('download');await page.locator('#pngButton').click();const png=await pngDownload;const pngPath=testInfo.outputPath('glyph-current.png');await png.saveAs(pngPath);expect(fs.statSync(pngPath).size).toBeGreaterThan(1000);
  expect(await page.evaluate(()=>window.__glyphCurrent.getRenderMetrics().lastExport?.mode)).toBe('exact');
  const svgDownload=page.waitForEvent('download');await page.locator('#svgButton').click();const svg=await svgDownload;const svgPath=testInfo.outputPath('glyph-current.svg');await svg.saveAs(svgPath);const svgText=fs.readFileSync(svgPath,'utf8');expect(svgText).toContain('<image');expect(svgText).toContain('data:image/png;base64,');expect(await page.evaluate(()=>window.__glyphCurrent.getRenderMetrics().lastExport?.mode)).toBe('exact');
});

test('latest render wins and cancel preserves the completed frame', async ({page},testInfo)=>{
  test.setTimeout(150000);test.skip(testInfo.project.name!=='chromium-desktop');await page.goto('/');await waitForOperator(page,'liquidRope');
  const checksum=()=>page.locator('#previewCanvas').evaluate(canvas=>{const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let n=0;for(let i=0;i<d.length;i+=4096)n=(n+d[i]*31+d[i+1]*17+d[i+2])>>>0;return n;});const before=await checksum();
  await page.evaluate(()=>window.__glyphCurrent.selectOperator('repulsiveCurves'));await expect.poll(()=>page.evaluate(()=>window.__glyphCurrent.getRenderState().busy)).toBe(true);await page.locator('#cancelButton').click();await expect(page.locator('#statusText')).toHaveText('CANCELLED');expect(await page.evaluate(()=>window.__glyphCurrent.getRenderState().completedOperator)).toBe('liquidRope');expect(await checksum()).toBeGreaterThan(0);
  const sequence=await page.evaluate(()=>window.__glyphCurrent.getRenderState().sequence);await page.evaluate(()=>{window.__glyphCurrent.selectOperator('differentialType');window.__glyphCurrent.selectOperator('marblingType');});await waitForOperator(page,'marblingType',sequence);expect(await page.evaluate(()=>window.__glyphCurrent.getState().operator)).toBe('marblingType');
});

test('mobile keeps controls and details in the viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name!=='chromium-mobile');await page.goto('/');await waitForOperator(page,'liquidRope');await expect(page.locator('.control-bar')).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);expect(overflow).toBe(0);
  for(const id of ['undoButton','redoButton','detailsButton']){const box=await page.locator(`#${id}`).boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);expect(box.y+box.height).toBeLessThanOrEqual(844);}
  for(const [id,label] of [['liquidRope','Coil'],['sinewTorque','Torque'],['repulsiveCurves','Repulsion'],['differentialType','Growth'],['marblingType','Flow'],['asemicDuctus','Memory']]){await page.evaluate(value=>window.__glyphCurrent.selectOperator(value),id);await expect(page.locator('#primaryLabel')).toHaveText(label);expect(await page.locator('.primary-readout').evaluate(node=>({fits:node.scrollWidth<=node.clientWidth,nowrap:getComputedStyle(node).whiteSpace==='nowrap'}))).toEqual({fits:true,nowrap:true});expect((await page.locator('#primaryInput').boundingBox()).width).toBeGreaterThanOrEqual(28);}
  await page.evaluate(()=>window.__glyphCurrent.selectOperator('repulsiveCurves'));await page.locator('#detailsButton').click();await expect(page.locator('#closeDetailsButton')).toBeInViewport();await page.screenshot({path:testInfo.outputPath('mobile.png')});
});
