import { OPERATORS } from './operators.js';

const WORKER_URL = new URL('./engine/surface-worker.js', document.baseURI);
const MAX_ENVELOPE = 512;
const MAX_RENDERED_GLYPHS = 96;
const DEFAULT_EXPORT_PIXELS = 24_000_000;
const DEFAULT_EXPORT_SIDE = 12_288;

function segment(text) {
  if (typeof Intl.Segmenter === 'function') return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(item => item.segment);
  return Array.from(text);
}

function assertTextBudget(text) {
  const count=segment(String(text||'')).filter(value=>!/\s/u.test(value)).length;
  if(count>MAX_RENDERED_GLYPHS)throw new Error(`Preview supports up to ${MAX_RENDERED_GLYPHS} visible glyphs. Your full text is still kept in the project.`);
}

function activeParams(state) {
  const id = state.operator;
  const values = { ...state.params, ...state.operatorParams[id], activeOperator: id, fontFamily: state.font.family };
  values[OPERATORS[id].colorKey] = state.params.ink;
  values.ink = state.params.ink;
  values.paper = state.params.paper;
  return values;
}

function fontMetrics(context, params) {
  context.font = `${params.fontWeight} ${params.fontSize}px ${params.fontFamily}`;
  const measured = context.measureText('国Hg');
  return {
    ascent: Number(measured.fontBoundingBoxAscent) || params.fontSize * .88,
    descent: Number(measured.fontBoundingBoxDescent) || params.fontSize * .12
  };
}

function glyphSnapshot(state, canvas) {
  const params = activeParams(state), context = canvas.getContext('2d'), fm = fontMetrics(context, params);
  context.font = `${params.fontWeight} ${params.fontSize}px ${params.fontFamily}`;
  context.textAlign = 'left'; context.textBaseline = 'alphabetic';
  const lines = String(state.text || ' ').replace(/\r\n?/g, '\n').split('\n');
  const glyphs = [], lineHeight = (fm.ascent + fm.descent) * 1.16;
  let widest = 0;
  const measuredLines = lines.map(line => {
    let width = 0;
    const items = segment(line);
    for (const ch of items) width += context.measureText(ch).width;
    widest = Math.max(widest, width);
    return { items, width };
  });
  measuredLines.forEach((line, lineIndex) => {
    let x = -line.width / 2;
    const y = lineIndex * lineHeight - measuredLines.length * lineHeight / 2;
    for (const ch of line.items) {
      const measure = context.measureText(ch), width = Math.max(.01, measure.width);
      if (!/^\s$/u.test(ch)) {
        const inkLeft = Number(measure.actualBoundingBoxLeft), inkRight = Number(measure.actualBoundingBoxRight), inkAscent = Number(measure.actualBoundingBoxAscent), inkDescent = Number(measure.actualBoundingBoxDescent);
        const layoutY = y, baseline = y + fm.ascent;
        const inkX0 = Number.isFinite(inkLeft) ? x - inkLeft : x;
        const inkX1 = Number.isFinite(inkRight) ? x + inkRight : x + width;
        const inkY0 = Number.isFinite(inkAscent) ? baseline - inkAscent : y;
        const inkY1 = Number.isFinite(inkDescent) ? baseline + inkDescent : y + lineHeight;
        const bx = Math.min(x, inkX0), by = Math.min(layoutY, inkY0), br = Math.max(x + width, inkX1), bb = Math.max(layoutY + lineHeight, inkY1);
        const surface = { [state.operator]: 1 };
        if (state.operator === 'sinewTorque') surface.sinewTorqueAmount = state.operatorParams.sinewTorque.sinewTorque;
        glyphs.push({
          ch, fontFamily: params.fontFamily, fontWeight: params.fontWeight, fontAxes: null, sourceText: ch, line: lineIndex, word: 0,
          opacity: 1, x, y: layoutY, w: width, h: lineHeight, bx, by, bw: Math.max(1, br - bx), bh: Math.max(1, bb - by), grid: false,
          ox: x + width / 2, oy: layoutY + lineHeight * .75, tx: 0, ty: 0, rot: 0, skewX: 0, skewY: 0, scaleX: 1, scaleY: 1,
          misregX: 0, misregY: 0, moshPassAX: 0, moshPassAY: 0, moshPassBX: 0, moshPassBY: 0, surface
        });
      }
      x += width;
    }
  });
  return { glyphs, fm, params, world: { width: Math.max(params.fontSize, widest), height: Math.max(lineHeight, measuredLines.length * lineHeight) } };
}

function contentBounds(glyphs) {
  if (!glyphs.length) return { x: -100, y: -100, w: 200, h: 200 };
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for (const g of glyphs) { minX=Math.min(minX,g.bx);minY=Math.min(minY,g.by);maxX=Math.max(maxX,g.bx+g.bw);maxY=Math.max(maxY,g.by+g.bh); }
  return { x:minX,y:minY,w:Math.max(1,maxX-minX),h:Math.max(1,maxY-minY) };
}

function estimatedPad(state, params) {
  const font = params.fontSize, p = state.operatorParams[state.operator];
  if (state.operator === 'sinewTorque') return 50 + Math.min(1800, Math.abs(p.sinewPull) + font * (.8 + Math.abs(p.sinewTorque) / 72 + Math.max(0, Math.exp(Math.max(0,p.sinewWaist)*.42)-1)));
  if (state.operator === 'asemicDuctus') return Math.min(2400, p.asemicFlourish + p.asemicWeight*(2+p.asemicContrast) + font*Math.abs(p.asemicFlow)*.18) + 40;
  if (state.operator === 'differentialType') return 70 + font * (.45 + p.differentialAge * .2);
  if (state.operator === 'marblingType') return 70 + font * (.25 + p.marblingAmount * .28);
  if (state.operator === 'liquidRope') return 60 + font * (.32 + p.ropeRadius * 1.8 + p.ropeSpread * .18);
  if (state.operator === 'repulsiveCurves') return 70 + font * (.3 + (p.repulsiveLength-1)*.7 + p.repulsiveDepth*.5);
  return font;
}

function makePlan(state, snapshot, envelopeScale = 1, draft = false) {
  const content = contentBounds(snapshot.glyphs), pad = estimatedPad(state, snapshot.params);
  const initial = { x:content.x-pad,y:content.y-pad,w:content.w+pad*2,h:content.h+pad*2 };
  const grown = { x:initial.x-(initial.w*(envelopeScale-1))/2,y:initial.y-(initial.h*(envelopeScale-1))/2,w:initial.w*envelopeScale,h:initial.h*envelopeScale };
  const maxSide=draft?280:1440,maxPixels=draft?55000:2400000,maxDensity=draft ? .32 : 1.5;
  const density=Math.max(.000001,Math.min(maxDensity,maxSide/grown.w,maxSide/grown.h,Math.sqrt(maxPixels/Math.max(1,grown.w*grown.h))));
  return { bounds:grown,density,width:Math.max(1,Math.ceil(grown.w*density)),height:Math.max(1,Math.ceil(grown.h*density)),layout:{w:grown.w,h:grown.h,s:1,dx:-grown.x,dy:-grown.y},envelopeScale };
}

function frameFor(state, canvas, width, height, dpr, options = {}) {
  const draft=!!options.draft,draftState=state;
  const snapshot = glyphSnapshot(draftState, canvas), plan = makePlan(draftState, snapshot, options.envelopeScale || 1,draft), b = plan.bounds;
  const thumbnail = !!options.thumbnail;
  const marginX = options.export || thumbnail ? 0 : Math.min(112, width * .13), marginTop = options.export || thumbnail ? 0 : 68, marginBottom = options.export || thumbnail ? 0 : (width < 720 ? 142 : 104);
  const fit = Math.min((width-marginX*2)/b.w,(height-marginTop-marginBottom)/b.h);
  const baseScale = Math.max(.0001, fit);
  const zoom = options.export ? options.outputScale : 1;
  const s = options.export ? options.outputScale : baseScale * zoom;
  const dx = options.export ? -b.x*s : width/2 - (b.x+b.w/2)*s;
  const dy = options.export ? -b.y*s : marginTop+(height-marginTop-marginBottom)/2 - (b.y+b.h/2)*s;
  const renderDpr=draft?Math.min(.25,dpr):dpr;
  return {
    snapshot, plan, fit:baseScale,
    frame: {
      kind:'frame', purpose:options.export?'export':'edit', mode:draft?'draft':'exact', geometryMode:draft&&state.operator==='differentialType'?'exact':(draft?'draft':'exact'), operator:state.operator, operators:[state.operator], strength:1, params:snapshot.params, text:state.text,
      glyphs:snapshot.glyphs, fm:snapshot.fm, fonts:options.fontRecord?[options.fontRecord]:[], surfacePhase:0,
      width:Math.max(1,Math.round(width*renderDpr)),height:Math.max(1,Math.round(height*renderDpr)),scale:renderDpr,layout:{w:width,h:height,s,dx,dy},plan,tileMode:options.tileMode||'auto'
    }
  };
}

function createOneShot(frame, jobs) {
  return new Promise((resolve,reject) => {
    const worker = new Worker(WORKER_URL), id = 1;
    const job={cancel(){worker.terminate();jobs?.delete(job);reject(new Error('Auxiliary render cancelled for export.'));}};jobs?.add(job);
    const cleanup=()=>{worker.terminate();jobs?.delete(job);};
    worker.onmessage = event => { if(event.data.id!==id)return;cleanup(); event.data.type==='error'?reject(new Error(event.data.message)):resolve(event.data.result); };
    worker.onerror = event => { cleanup(); reject(new Error(event.message||'Worker failed.')); };
    worker.postMessage({id,payload:frame});
  });
}

class ExportWorkerSession {
  constructor(timeoutMs=180000){this.worker=new Worker(WORKER_URL);this.nextId=0;this.pending=new Map();this.closed=false;this.timeoutMs=timeoutMs;this.worker.onmessage=event=>{const pending=this.pending.get(event.data.id);if(!pending)return;this.pending.delete(event.data.id);clearTimeout(pending.timer);event.data.type==='error'?pending.reject(new Error(event.data.message||'Export Worker failed.')):pending.resolve(event.data.result);};this.worker.onerror=event=>this.close(new Error(event.message||'Export Worker failed.'));}
  render(payload){if(this.closed)return Promise.reject(new Error('Export Worker is closed.'));const id=++this.nextId;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Export rendering timed out.'));this.close();},this.timeoutMs);this.pending.set(id,{resolve,reject,timer});try{this.worker.postMessage({id,payload});}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error);}});}
  close(error){if(this.closed)return;this.closed=true;this.worker.terminate();for(const pending of this.pending.values()){clearTimeout(pending.timer);if(error)pending.reject(error);}this.pending.clear();}
}

function exportRetryable(error){return /memory|allocation|allocate|canvas|bitmap|image|blob|size|too large|メモリ|割り当て|描画面|サイズ|大きすぎ/i.test(String(error?.message||error));}

async function blobToBase64Parts(blob){
  const bytes=new Uint8Array(await blob.arrayBuffer()),parts=[],chunk=0x6000;
  for(let offset=0;offset<bytes.length;offset+=chunk)parts.push(btoa(String.fromCharCode(...bytes.subarray(offset,Math.min(bytes.length,offset+chunk)))));
  return parts;
}

async function encodeBitmapFallback(bitmap){
  const canvas=document.createElement('canvas');
  try{
    canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext('2d');if(!context)throw new Error('The PNG fallback canvas could not be allocated.');context.drawImage(bitmap,0,0);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?.size?resolve(value):reject(new Error('PNG fallback encoding returned an empty file.')),'image/png'));
    return blob;
  }finally{bitmap.close?.();canvas.width=canvas.height=1;}
}

export class GlyphRenderer {
  constructor(canvas, handlers = {}) {
    this.canvas=canvas; this.context=canvas.getContext('2d'); this.handlers=handlers; this.worker=null;this.draftWorker=new Worker(WORKER_URL);this.exactWorker=new Worker(WORKER_URL); this.sequence=0; this.requestVersion=0;this.displayRevision=0; this.bitmap=null; this.alphaBounds=null; this.lastState=null; this.lastFrame=null; this.fontRecord=null;this.fontRevision=0;this.workerFontRevisions=new WeakMap(); this.busy=false;this.active=null;this.queuedDraft=null;this.queuedSharedExact=null;this.auxiliaryJobs=new Set();
    this.metrics={draftCount:0,exactCount:0,coalescedDrafts:0,lastDraftMs:null,lastExactMs:null,lastCompletedMode:null,events:[],lastExport:null};
    this.measureCanvas=document.createElement('canvas');
  }
  setFontRecord(record){this.fontRecord=record;this.fontRevision++;this.workerFontRevisions=new WeakMap();}
  getMetrics(){return {...this.metrics,events:this.metrics.events.slice(),activeMode:this.active?.mode||null,queuedDraft:!!this.queuedDraft,queuedExact:!!this.queuedSharedExact};}
  resize(){const rect=this.canvas.parentElement.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h;const sw=`${rect.width}px`,sh=`${rect.height}px`;if(this.canvas.style.width!==sw)this.canvas.style.width=sw;if(this.canvas.style.height!==sh)this.canvas.style.height=sh;this.redraw();return {width:rect.width,height:rect.height,dpr};}
  redraw(){
    const ctx=this.context, state=this.lastState;ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=state?.params.paper||'#f2f1ed';ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
    if(this.bitmap){
      const b=this.alphaBounds||{x:0,y:0,w:this.bitmap.width,h:this.bitmap.height},cssWidth=this.canvas.clientWidth||this.canvas.width,mobile=cssWidth<720;
      const dpr=this.canvas.width/cssWidth,marginX=(mobile?54:112)*dpr,marginTop=(mobile?64:68)*dpr,marginBottom=(mobile?142:104)*dpr;
      const fit=Math.min((this.canvas.width-marginX*2)/b.w,(this.canvas.height-marginTop-marginBottom)/b.h),zoom=state?.camera.zoom||1;
      const dw=b.w*fit*zoom,dh=b.h*fit*zoom,dx=this.canvas.width/2-dw/2+(state?.camera.x||0)*dpr,dy=marginTop+(this.canvas.height-marginTop-marginBottom)/2-dh/2+(state?.camera.y||0)*dpr;
      ctx.drawImage(this.bitmap,b.x,b.y,b.w,b.h,dx,dy,dw,dh);
    }
  }
  _ensureDraftWorker(){if(!this.draftWorker)this.draftWorker=new Worker(WORKER_URL);return this.draftWorker;}
  _ensureExactWorker(){if(!this.exactWorker)this.exactWorker=new Worker(WORKER_URL);return this.exactWorker;}
  _interrupt({preserveDraft=false}={}){this.sequence++;if(this.worker){if(this.worker===this.draftWorker&&!preserveDraft){this.draftWorker=null;this.worker.terminate();}else if(this.worker===this.exactWorker){this.exactWorker=null;this.worker.terminate();}}this.worker=null;this.active=null;}
  cancel(){this.requestVersion++;this.queuedDraft=null;this.queuedSharedExact=null;this._interrupt();this.busy=false;this.handlers.status?.({busy:false,text:'CANCELLED'});}
  _suspendForExport(){
    if((this.active||this.queuedDraft||this.queuedSharedExact)&&this.lastState&&!this.deferredAfterExport)this.deferredAfterExport={state:structuredClone(this.lastState),mode:'exact',options:{}};
    this.requestVersion++;this.queuedDraft=null;this.queuedSharedExact=null;this._interrupt();
    for(const job of [...this.auxiliaryJobs])job.cancel();this.auxiliaryJobs.clear();
    if(this.draftWorker){this.draftWorker.terminate();this.draftWorker=null;}
    if(this.exactWorker){this.exactWorker.terminate();this.exactWorker=null;}
    this.worker=null;this.active=null;this.busy=false;
  }
  _request(state,mode,options={}){
    this.lastState=state;
    try{assertTextBudget(state.text);}catch(error){this.requestVersion++;this.queuedDraft=null;this.queuedSharedExact=null;this._interrupt();this.busy=false;this.redraw();this.handlers.status?.({error:true,text:error.message});return;}
    if(this.exporting){this.deferredAfterExport={state:structuredClone(state),mode,options};this.handlers.status?.({busy:true,text:'EXPORTING'});return;}
    const request={state:structuredClone(state),mode,options,version:++this.requestVersion,requestedAt:performance.now()};
    if(mode==='draft')this.queuedSharedExact=null;
    if(mode==='exact'&&state.operator==='differentialType'&&this.active?.mode==='draft'&&this.active.operator==='differentialType'&&this.worker===this.exactWorker){this.queuedDraft=null;this.queuedSharedExact=request;this.handlers.status?.({busy:true,text:'REFINING',cancel:true});return;}
    if(mode==='draft'&&this.active?.mode==='draft'){
      this.queuedDraft=request;this.metrics.coalescedDrafts++;this.handlers.status?.({busy:true,text:'LIVE',cancel:true});return;
    }
    this.queuedDraft=null;this.queuedSharedExact=null;
    if(this.active)this._interrupt({preserveDraft:mode==='exact'&&this.active.mode==='draft'&&this.active.operator==='differentialType'});
    this._start(request);
  }
  requestDraft(state){this._request(state,'draft');}
  requestExact(state,options){this._request(state,'exact',options);}
  render(state){this.requestExact(state);}
  _start(request,envelopeScale=1,refit=null){
    const {state,mode}=request,{width,height,dpr}=this.resize();const built=frameFor(state,this.measureCanvas,width,height,dpr,{envelopeScale,draft:mode==='draft',tileMode:request.options?.tileMode});
    if(refit){
      const old=refit.frame.layout,b=refit.alpha,scale=refit.frame.scale,mobile=width<720,marginX=(mobile?54:112)*scale,marginTop=(mobile?64:68)*scale,marginBottom=(mobile?142:104)*scale;
      const ratio=Math.min(12,Math.min((built.frame.width-marginX*2)/b.w,(built.frame.height-marginTop-marginBottom)/b.h)*.985),worldX=(b.x+b.w/2-refit.frame.scale*old.dx)/(refit.frame.scale*old.s),worldY=(b.y+b.h/2-refit.frame.scale*old.dy)/(refit.frame.scale*old.s),nextS=old.s*ratio;
      built.frame.layout={...built.frame.layout,s:nextS,dx:width/2-worldX*nextS,dy:marginTop/scale+(height-marginTop/scale-marginBottom/scale)/2-worldY*nextS};
    }
    this.lastFrame=built;
    this.worker=mode==='draft'&&state.operator!=='differentialType'?this._ensureDraftWorker():this._ensureExactWorker();const jobWorker=this.worker,id=++this.sequence;this.busy=true;const started=performance.now();this.active={id,mode,operator:state.operator,version:request.version,started};this.handlers.status?.({busy:true,text:mode==='draft'?'LIVE':'REFINING',cancel:true});
    if(this.fontRecord&&this.workerFontRevisions.get(jobWorker)!==this.fontRevision){built.frame.fonts=[this.fontRecord];this.workerFontRevisions.set(jobWorker,this.fontRevision);}else built.frame.fonts=[];
    jobWorker.onmessage=async event=>{
      if(event.data.id!==id||id!==this.sequence||this.active?.id!==id){event.data.result?.bitmap?.close?.();return;}
      if(request.version!==this.requestVersion&&this.queuedSharedExact){event.data.result?.bitmap?.close?.();this.worker=null;this.active=null;const next=this.queuedSharedExact;this.queuedSharedExact=null;this._start(next);return;}
      if(event.data.type==='error'){
        this.busy=false;this.queuedSharedExact=null;
        if(refit?.bitmap){if(this.bitmap&&this.bitmap!==refit.bitmap)this.bitmap.close();this.bitmap=refit.bitmap;this.alphaBounds=refit.alpha;this.completedOperator=state.operator;this.completedMode=mode;this.redraw();this._finish(request,built,{kind:'frame',fallback:true,diagnostics:{fallbackError:event.data.message}},started,'READY · LIMITED RESOLUTION');return;}
        if(jobWorker===this.draftWorker)this.draftWorker=null;if(jobWorker===this.exactWorker)this.exactWorker=null;jobWorker.terminate();this.worker=null;this.active=null;this.handlers.status?.({error:true,text:event.data.message});this._continueDraft();return;
      }
      const result=event.data.result;
      if(result.kind==='envelope'){
        this.worker=null;
        request.envelopeTries=(request.envelopeTries||0)+1;
        if(mode==='draft'&&request.envelopeTries>=2){this.active=null;this.handlers.status?.({busy:true,text:'LIVE',cancel:true});this._continueDraft();return;}
        if(result.requiredScale>MAX_ENVELOPE){this.busy=false;this.queuedSharedExact=null;this.handlers.status?.({error:true,text:'THE FULL FORM EXCEEDS THE RENDER LIMIT'});return;}
        this.handlers.status?.({busy:true,text:mode==='draft'?'LIVE':'REFINING'});this._start(request,result.requiredScale,refit);return;
      }
      const alpha=result.alphaBounds||this.scanAlpha(result.bitmap);
      if(mode==='exact'&&!refit){
        const mobile=width<720,marginX=(mobile?54:112)*dpr,marginTop=(mobile?64:68)*dpr,marginBottom=(mobile?142:104)*dpr,ratio=Math.min((built.frame.width-marginX*2)/alpha.w,(built.frame.height-marginTop-marginBottom)/alpha.h);
        if(Number.isFinite(ratio)&&ratio>1.04){
          const fallbackBitmap=await createImageBitmap(result.bitmap);result.bitmap.close();
          if(id!==this.sequence){fallbackBitmap.close();return;}
          if(this.bitmap)this.bitmap.close();this.bitmap=fallbackBitmap;this.alphaBounds=alpha;this.redraw();this.worker=null;this.handlers.status?.({busy:true,text:'REFINING'});this._start(request,envelopeScale,{frame:built.frame,alpha,bitmap:fallbackBitmap});return;
        }
      }
      this.worker=null;if(this.bitmap&&this.bitmap!==refit?.bitmap)this.bitmap.close();if(refit?.bitmap&&refit.bitmap!==result.bitmap)refit.bitmap.close();this.bitmap=result.bitmap;this.alphaBounds=alpha;this.completedOperator=state.operator;this.completedMode=mode;this.redraw();this._finish(request,built,result,started);
    };
    jobWorker.onerror=event=>{if(id!==this.sequence)return;this.busy=false;this.queuedSharedExact=null;if(jobWorker===this.draftWorker)this.draftWorker=null;if(jobWorker===this.exactWorker)this.exactWorker=null;jobWorker.terminate();if(refit?.bitmap){if(this.bitmap&&this.bitmap!==refit.bitmap)this.bitmap.close();this.bitmap=refit.bitmap;this.alphaBounds=refit.alpha;this.completedOperator=state.operator;this.completedMode=mode;this.redraw();this._finish(request,built,{kind:'frame',fallback:true,diagnostics:{fallbackError:event.message||'WORKER ERROR'}},started,'READY · LIMITED RESOLUTION');return;}this.worker=null;this.active=null;this.handlers.status?.({error:true,text:event.message||'WORKER ERROR'});this._continueDraft();};
    this.worker.postMessage({id,payload:built.frame});
  }
  _finish(request,built,result,started,statusText){
    const elapsed=performance.now()-request.requestedAt,mode=request.mode,event={mode,operator:request.state.operator,version:request.version,operatorParams:{...request.state.operatorParams[request.state.operator]},duration:elapsed,workerDuration:result.duration??null,diagnostics:result.diagnostics||null,completedAt:performance.now()};
    this.displayRevision++;
    this.metrics.events.push(event);if(this.metrics.events.length>80)this.metrics.events.shift();this.metrics.lastCompletedMode=mode;if(mode==='draft'){this.metrics.draftCount++;this.metrics.lastDraftMs=elapsed;}else{this.metrics.exactCount++;this.metrics.lastExactMs=elapsed;}
    if(mode==='exact')this._ensureDraftWorker();this.worker=null;this.active=null;this.busy=mode==='draft'&&!!this.queuedDraft;this.handlers.rendered?.(built,{...result,mode,duration:elapsed});
    if(mode==='draft'){this.handlers.status?.({busy:true,text:'LIVE',cancel:true});this._continueDraft();}
    else this.handlers.status?.({text:statusText||`READY ${Math.round(performance.now()-started)}MS`});
  }
  _continueDraft(){
    if(!this.queuedDraft){this.busy=false;return;}
    const next=this.queuedDraft;this.queuedDraft=null;setTimeout(()=>{if(!this.active&&next.version===this.requestVersion)this._start(next);},0);
  }
  scanAlpha(bitmap){
    const c=this.measureCanvas;c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(bitmap,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;
    let minX=c.width,minY=c.height,maxX=-1,maxY=-1;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(data[(y*c.width+x)*4+3]>1){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    return maxX<0?{x:0,y:0,w:c.width,h:c.height}:{x:Math.max(0,minX-3),y:Math.max(0,minY-3),w:Math.min(c.width,maxX+4)-Math.max(0,minX-3),h:Math.min(c.height,maxY+4)-Math.max(0,minY-3)};
  }
  async export(state,{scale=2,background=true,format='png',maxPixels=DEFAULT_EXPORT_PIXELS,maxSide=DEFAULT_EXPORT_SIDE,minScale=.125,timeoutMs=180000,forceMainThreadEncode=false}={}){
    if(this.exporting)throw new Error('An export is already in progress.');
    const exportStarted=performance.now(),requestedScale=Math.max(.01,Number(scale)||1),pixelBudget=Math.max(65_536,Number(maxPixels)||DEFAULT_EXPORT_PIXELS),sideBudget=Math.max(256,Number(maxSide)||DEFAULT_EXPORT_SIDE);
    assertTextBudget(state.text);if(!['png','svg'].includes(format))throw new Error('Unsupported export format.');
    this.exporting=true;this._suspendForExport();this.handlers.status?.({busy:true,text:'EXPORTING'});
    let session=null;
    try{
      const fontRecord=this.fontRecord,snapshot=glyphSnapshot(state,this.measureCanvas),base=makePlan(state,snapshot,1),safeScale=Math.min(requestedScale,sideBudget/base.bounds.w,sideBudget/base.bounds.h,Math.sqrt(pixelBudget/Math.max(1,base.bounds.w*base.bounds.h)));
      let actualScale=Math.max(Math.min(requestedScale,safeScale),Math.min(requestedScale,minScale)),lastError=null,result=null,reduced=actualScale<requestedScale-.0001,reductionReason=reduced?'safe output memory budget':null,fontSent=false;
      session=new ExportWorkerSession(timeoutMs);
      for(let resolutionTry=0;resolutionTry<12&&!result;resolutionTry++){
        let envelopeScale=1;
        try{
          for(let envelopeTry=0;envelopeTry<10;envelopeTry++){
            const plan=makePlan(state,snapshot,envelopeScale),width=Math.max(1,Math.ceil(plan.bounds.w*actualScale)),height=Math.max(1,Math.ceil(plan.bounds.h*actualScale));
            if(width>sideBudget||height>sideBudget||width*height>pixelBudget)throw new Error(`Output allocation ${width} × ${height}px exceeds the safe memory budget.`);
            const built=frameFor(state,this.measureCanvas,width,height,1,{export:true,outputScale:actualScale,envelopeScale,fontRecord});
            built.frame.fonts=!fontSent&&fontRecord?[fontRecord]:[];built.frame.backgroundColor=background?state.params.paper:null;built.frame.encode='image/png';built.frame.forceMainThreadEncode=!!forceMainThreadEncode;
            const rendered=await session.render(built.frame);
            fontSent=true;
            if(rendered.kind==='envelope'){envelopeScale=rendered.requiredScale;if(envelopeScale>MAX_ENVELOPE)throw new Error('The full form exceeds the render limit.');continue;}
            if(rendered.kind==='encoding-fallback'&&rendered.bitmap){rendered.blob=await encodeBitmapFallback(rendered.bitmap);rendered.bitmap=null;rendered.kind='encoded';}
            if(rendered.kind!=='encoded'||!rendered.blob?.size)throw new Error('The export renderer did not return an encoded image.');
            result=rendered;
            break;
          }
          if(!result)throw new Error('The export could not contain the full form.');
        }catch(error){
          lastError=error;
          if(!exportRetryable(error)||actualScale<=minScale+.0001)throw error;
          const nextScale=Math.max(minScale,actualScale*.72);if(Math.abs(nextScale-actualScale)<.0001)throw error;
          session.close();session=new ExportWorkerSession(timeoutMs);fontSent=false;actualScale=nextScale;reduced=true;reductionReason='browser memory limit';
        }
      }
      if(!result)throw lastError||new Error('Export failed.');
      let blob=result.blob;
      if(format==='svg'){
        const base64=await blobToBase64Parts(blob),prefix=`<svg xmlns="http://www.w3.org/2000/svg" width="${result.width}" height="${result.height}" viewBox="0 0 ${result.width} ${result.height}"><image width="${result.width}" height="${result.height}" href="data:image/png;base64,`,suffix='"/></svg>';
        blob=new Blob([prefix,...base64,suffix],{type:'image/svg+xml'});
      }
      if(!blob?.size)throw new Error('The encoded export is empty.');
      this.metrics.lastExport={mode:'exact',operator:state.operator,duration:performance.now()-exportStarted,width:result.width,height:result.height,requestedScale,actualScale,reduced,format};
      return {blob,width:result.width,height:result.height,mode:'exact',requestedScale,actualScale,reduced,reductionReason,format};
    }finally{
      session?.close();this.exporting=false;
      const deferred=this.deferredAfterExport;this.deferredAfterExport=null;
      if(deferred)this._request(deferred.state,deferred.mode,deferred.options);else this.handlers.status?.({text:'READY'});
    }
  }
  async thumbnail(state,canvas){
    if(this.exporting)return;
    const local={...state,camera:{zoom:1,x:0,y:0,autoFit:true}};const rect={width:canvas.width||160,height:canvas.height||104};let built=frameFor(local,this.measureCanvas,rect.width,rect.height,1,{thumbnail:true,envelopeScale:1,fontRecord:this.fontRecord});let result=await createOneShot(built.frame,this.auxiliaryJobs);
    if(result.kind==='envelope'){built=frameFor(local,this.measureCanvas,rect.width,rect.height,1,{thumbnail:true,envelopeScale:result.requiredScale,fontRecord:this.fontRecord});result=await createOneShot(built.frame,this.auxiliaryJobs);}
    if(result.bitmap){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);const b=this.scanAlpha(result.bitmap),fit=Math.min((canvas.width-8)/b.w,(canvas.height-8)/b.h),w=b.w*fit,h=b.h*fit;ctx.drawImage(result.bitmap,b.x,b.y,b.w,b.h,(canvas.width-w)/2,(canvas.height-h)/2,w,h);result.bitmap.close();}
  }
}

export function downloadBlob(blob, filename){const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
