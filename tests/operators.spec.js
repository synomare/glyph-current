import { test, expect } from '@playwright/test';

const operators=['liquidRope','sinewTorque','repulsiveCurves','differentialType','marblingType','asemicDuctus'];

test('all six selected upstream operators produce visible pixels', async ({page},testInfo)=>{
  test.setTimeout(360000);
  test.skip(testInfo.project.name!=='chromium-desktop');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  for(const id of process.env.GC_OPERATOR?[process.env.GC_OPERATOR]:operators){
    const sequence=await page.evaluate(()=>window.__glyphCurrent.getRenderState().sequence);
    await page.evaluate(operator=>window.__glyphCurrent.selectOperator(operator),id);
    await expect.poll(()=>page.evaluate(()=>window.__glyphCurrent.getRenderState()),{timeout:110000}).toMatchObject({busy:false,completedOperator:id,error:false});
    expect(await page.evaluate(()=>window.__glyphCurrent.getRenderState().sequence)).toBeGreaterThanOrEqual(sequence);
    await expect(page.locator('#renderStatus')).not.toHaveClass(/is-error/);
    const pixels=await page.locator('#previewCanvas').evaluate(canvas=>{
      const context=canvas.getContext('2d'),data=context.getImageData(0,0,canvas.width,canvas.height).data,paper=[242,241,237];let changed=0;
      for(let i=0;i<data.length;i+=64)if(Math.abs(data[i]-paper[0])+Math.abs(data[i+1]-paper[1])+Math.abs(data[i+2]-paper[2])>18)changed++;
      return changed;
    });
    console.log(id, pixels, await page.evaluate(()=>({render:window.__glyphCurrent.getRenderState(),sample:(()=>{const canvas=document.querySelector('#previewCanvas'),d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let min=[255,255,255],maxAlpha=0,different3=0;for(let i=0;i<d.length;i+=4){min[0]=Math.min(min[0],d[i]);min[1]=Math.min(min[1],d[i+1]);min[2]=Math.min(min[2],d[i+2]);maxAlpha=Math.max(maxAlpha,d[i+3]);if(Math.abs(d[i]-242)+Math.abs(d[i+1]-241)+Math.abs(d[i+2]-237)>3)different3++;}return {min,maxAlpha,different3};})()})));
    await page.screenshot({path:testInfo.outputPath(`${id}.png`)});
    expect(pixels,`${id} should paint visible non-paper pixels`).toBeGreaterThan(30);
  }
  expect(errors).toEqual([]);
});

test('primary bar and Details edit the same real parameter at fixed full effect', async ({page},testInfo)=>{
  test.setTimeout(180000);test.skip(testInfo.project.name!=='chromium-desktop');
  const cases=[
    {id:'liquidRope',key:'ropeRadius',label:'Coil',min:'0.025',max:'0.35',step:'0.005',main:'0.2',detail:'0.205',format:3},
    {id:'sinewTorque',key:'sinewTorque',label:'Torque',min:'-540',max:'540',step:'2',main:'100',detail:'102',format:0},
    {id:'repulsiveCurves',key:'repulsiveForce',label:'Repulsion',min:'0.15',max:'2.5',step:'0.01',main:'1.25',detail:'1.26',format:2},
    {id:'differentialType',key:'differentialAge',label:'Growth',min:'0',max:'5',step:'0.025',main:'3',detail:'3.025',format:2},
    {id:'marblingType',key:'marblingAmount',label:'Flow',min:'0',max:'4',step:'0.01',main:'1.2',detail:'1.21',format:2},
    {id:'asemicDuctus',key:'asemicMemory',label:'Memory',min:'0',max:'1',step:'0.01',main:'0.4',detail:'0.41',format:2}
  ];
  await page.goto('/');await expect(page.locator('#strengthInput')).toHaveCount(0);await expect(page.getByText('DEFORM',{exact:true})).toHaveCount(0);
  for(const item of cases){
    await page.evaluate(id=>window.__glyphCurrent.selectOperator(id),item.id);
    await page.locator('#detailsButton').click();
    const primary=page.locator('#primaryInput'),detail=page.locator(`#param-${item.key}`),number=detail.locator('xpath=following-sibling::*[contains(@class,"number-input")]');
    await expect(page.locator('#primaryLabel')).toHaveText(item.label);await expect(primary).toHaveAttribute('min',item.min);await expect(primary).toHaveAttribute('max',item.max);await expect(primary).toHaveAttribute('step',item.step);
    const original=await detail.inputValue();await primary.focus();await primary.fill(item.main);await primary.blur();await expect(detail).toHaveValue(item.main);await expect(number).toHaveValue(item.main);await expect(page.locator('#primaryValue')).toHaveText(Number(item.main).toFixed(item.format));
    await page.locator('#undoButton').click();await expect(primary).toHaveValue(original);await expect(detail).toHaveValue(original);
    await page.locator('#redoButton').click();await expect(primary).toHaveValue(item.main);await expect(detail).toHaveValue(item.main);
    await number.focus();await number.fill(item.detail);await number.blur();await expect(primary).toHaveValue(item.detail);await expect(page.locator('#primaryValue')).toHaveText(Number(item.detail).toFixed(item.format));
    expect(await page.evaluate(({id,key})=>({strength:window.__glyphCurrent.getState().strength,value:window.__glyphCurrent.getState().operatorParams[id][key]}),item)).toEqual({strength:1,value:Number(item.detail)});
  }
});
