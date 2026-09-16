'use strict';
importScripts('render-context.js','render-envelope.js','parameter-model.js','parameter-definitions.js','font-axes.js');
self.window=self; self.TypeDeformerWorkerRuntime=true;
self.document={fonts:self.fonts,createElement:function(tag){if(tag!=='canvas')throw new Error('Unsupported worker element '+tag);return new OffscreenCanvas(1,1);},getElementById:function(){return null;}};
self.matchMedia=function(){return {matches:false};};
importScripts('metamorphic-body-operators.js','gravity-lens-operator.js','liquid-rope-body.js','repulsive-curves-body.js','field-material-operators.js');
var workerFontMetrics={}, params={}, compositionState={enabled:false,phase:0}, renderedSourceText='', surfaceFxPhase=0, dataMoshFrame=0, blobTrackState={blobs:[]}, surfaceFxScratchCanvases={}, surfaceEnvelopeScale=1, textInput={value:''};
var workerFontRuntime=TypeDeformerAxes.createRuntime(), workerFontKeys=new Set();self.TypeDeformerWorkerFontRevision=0;
var axisFieldEditor={font:function(g,size){return workerFontRuntime.activate(params,g,size);}};
importScripts('surface-worker-kernels.js');

async function loadFonts(records){
  for(const record of records||[]){
    const digest=await crypto.subtle.digest('SHA-256',record.buffer), key=record.family+'/'+Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
    if(workerFontKeys.has(key))continue;
    const face=new FontFace(record.family,record.buffer,{weight:'100 900',style:'normal'}); await face.load(); self.fonts.add(face); await workerFontRuntime.register(record); workerFontKeys.add(key);self.TypeDeformerWorkerFontRevision++;self.TypeDeformerFieldMaterials?.clearCache?.();
  }
}

async function renderFrame(frame){
  const jobStarted=performance.now();
  const draft=frame.mode==='draft',draftGeometry=draft&&frame.geometryMode!=='exact';self.TypeDeformerDraftMode=draftGeometry;
  params=frame.params;
  if(draftGeometry&&frame.operator==='differentialType')params={...params,differentialGrain:Math.max(14,Number(params.differentialGrain||0))};
  renderedSourceText=frame.text; surfaceFxPhase=frame.surfacePhase||0; surfaceEnvelopeScale=frame.plan?.envelopeScale||1; textInput.value=frame.text;
  frame.glyphs.forEach(g=>{if(g.surface)g.surface=Object.assign(Object.create(params),g.surface);});
  await loadFonts(frame.fonts); workerFontMetrics=frame.fm;
  const fontsReady=performance.now();
  differentialPrepare(frame.glyphs); marblingPrepare(frame.glyphs);
  const solverStarted=performance.now();
  while(true){
    try{differentialAssertReady(frame.glyphs);marblingAssertReady(frame.glyphs);break;}
    catch(error){
      if(!/_PENDING$/.test(error.code||''))throw error;
      if(performance.now()-solverStarted>100000)throw new Error('The operator exceeded its calculation budget.');
      if(differentialController.state.memoryPaused||differentialController.state.error)throw new Error(differentialController.state.error||'Growth history exceeded the memory budget.');
      differentialController.advance(50); marblingPool.advance({maxWork:65536,maxMs:30});
    }
  }
  const plan=frame.plan||surfaceCanonicalRasterPlan(frame.glyphs), L=frame.layout, scale=frame.scale;
  const factor=scale*L.s/plan.density, projectedX=scale*(L.dx+plan.bounds.x*L.s), projectedY=scale*(L.dy+plan.bounds.y*L.s);
  const width=plan.width,height=plan.height, viewX=Math.max(0,Math.floor(-projectedX)),viewY=Math.max(0,Math.floor(-projectedY));
  const viewW=Math.max(0,Math.min(Math.ceil(width*factor),Math.ceil(frame.width-projectedX))-viewX), viewH=Math.max(0,Math.min(Math.ceil(height*factor),Math.ceil(frame.height-projectedY))-viewY);
  const solvedAt=performance.now(), singlePass=frame.tileMode==='single'||(frame.tileMode!=='legacy'&&(frame.purpose||'edit')==='edit'&&viewW<=1536&&viewH<=1536&&viewW*viewH<=2400000);
  const tiles=(singlePass?[{x:0,y:0,width:viewW,height:viewH}]:TypeDeformerRenderContext.tiles(viewW,viewH,1024)).map(t=>(t.x+=viewX,t.y+=viewY,t));
  const id=frame.operator;
  if(!workerRenderers[id])throw new Error('Worker renderer missing: '+id);
  const canvas=new OffscreenCanvas(frame.width,frame.height), target=canvas.getContext('2d');
  if(!target)throw new Error('The output canvas could not be allocated.');
  if(frame.backgroundColor){target.save();target.fillStyle=frame.backgroundColor;target.fillRect(0,0,canvas.width,canvas.height);target.restore();}
  try{
  for(const tile of tiles){
    const context=TypeDeformerRenderContext.make({purpose:frame.purpose||'edit',presentation:'standard',width:frame.width,height:frame.height,viewScale:scale*L.s,factor:factor,tile:tile,referenceWidth:width,referenceHeight:height,overscan:Math.ceil(64*factor)});
    let contact=null;
    TypeDeformerRenderContext.withContext(context,function(){
      const layer=surfaceScratch('worker-layer',width,height,true);
      workerRenderers[id](layer.ctx,frame.glyphs,width,height,plan.density,plan.layout,frame.fm,false,false,context);
      contact=TypeDeformerRenderEnvelope.scanCanvas(layer.canvas,{gutter:3,threshold:1});
      if(TypeDeformerRenderEnvelope.touches(contact))return;
      target.save();target.setTransform(factor,0,0,factor,projectedX,projectedY);
      const tx=tile.x/factor,ty=tile.y/factor,tw=tile.width/factor,th=tile.height/factor;
      TypeDeformerRenderContext.drawImage(target,layer.canvas,tx,ty,tw,th,tx,ty,tw,th);target.restore();
    });
    if(contact&&TypeDeformerRenderEnvelope.touches(contact)){return {kind:'envelope',contact,requiredScale:TypeDeformerRenderEnvelope.nextScale(plan.envelopeScale||1,contact),duration:performance.now()-jobStarted,diagnostics:{fontMs:fontsReady-jobStarted,prepareMs:solvedAt-fontsReady,drawMs:performance.now()-solvedAt,tiles:tiles.length,tileMode:singlePass?'single':'legacy'}};}
  }
  const sourceAlpha=Math.max(0,Math.min(1,1-(Number(frame.strength)||0)));
  if(sourceAlpha>.001)for(const glyph of frame.glyphs)drawSurfaceGlyph(target,glyph,frame.scale,frame.layout,frame.fm,sourceAlpha,params.ink);
  if(typeof target.isContextLost==='function'&&target.isContextLost())throw new Error('The output canvas context was lost during rendering.');
  let alphaBounds=null;
  if((frame.purpose||'edit')==='edit'){
    const pixels=target.getImageData(0,0,canvas.width,canvas.height).data;let minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;
    for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]>1){if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y;}
    alphaBounds=maxX<0?{x:0,y:0,w:canvas.width,h:canvas.height}:{x:Math.max(0,minX-3),y:Math.max(0,minY-3),w:Math.min(canvas.width,maxX+4)-Math.max(0,minX-3),h:Math.min(canvas.height,maxY+4)-Math.max(0,minY-3)};
  }
  const drawnAt=performance.now(),diagnostics={fontMs:fontsReady-jobStarted,prepareMs:solvedAt-fontsReady,drawMs:drawnAt-solvedAt,tiles:tiles.length,tileMode:singlePass?'single':'legacy',fieldCache:self.TypeDeformerFieldMaterials?.cacheStats?.()||null,repulsiveCache:self.TypeDeformerRepulsiveCurves?.cacheStats?.()||null};
  if(frame.encode==='image/png'){
    const width=canvas.width,height=canvas.height;
    if(typeof canvas.convertToBlob!=='function'||frame.forceMainThreadEncode)return {kind:'encoding-fallback',mode:'exact',bitmap:canvas.transferToImageBitmap(),width,height,duration:performance.now()-jobStarted,diagnostics};
    const blob=await canvas.convertToBlob({type:'image/png'});
    if(!blob||!blob.size)throw new Error('PNG encoding returned an empty file.');
    return {kind:'encoded',mode:'exact',blob,width,height,duration:performance.now()-jobStarted,diagnostics};
  }
  const bitmap=canvas.transferToImageBitmap();
  return {kind:'frame',mode:draft?'draft':'exact',bitmap,alphaBounds,duration:performance.now()-jobStarted,diagnostics};
  }finally{canvas.width=canvas.height=1;}
}
var renderActive=false,pendingRender=null;
async function pumpRenderQueue(){if(renderActive)return;renderActive=true;while(pendingRender){await new Promise(function(resolve){setTimeout(resolve,0);});if(!pendingRender)continue;const {id,payload}=pendingRender;pendingRender=null;try{const result=await renderFrame(payload),transfers=result.bitmap?[result.bitmap]:[];self.postMessage({type:'result',id,result},transfers);}catch(error){self.postMessage({type:'error',id,message:error.message,stack:error.stack});}}renderActive=false;}
self.onmessage=function(event){pendingRender=event.data;pumpRenderQueue();};
