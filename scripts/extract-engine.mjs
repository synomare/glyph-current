import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const sourceRepo = process.env.TYPE_DEFORMER_SOURCE || 'C:/Users/soran/Documents/Codex/2026-08-03/synomare-type-deformer-https-github-com/work/type-deformer';
const sourcePath = path.join(sourceRepo, 'index.html');
if (!fs.existsSync(sourcePath)) throw new Error(`Type Deformer source not found: ${sourcePath}`);
const sourceRevision = '501f8b5dddcab795d8f12cee51fca1b0b894610f';
const targetIds = ['liquidRope','sinewTorque','repulsiveCurves','differentialType','marblingType','asemicDuctus'];
const normalized = value => String(value).replace(/\r\n/g, '\n');

const acorn = {};
new Function('exports', 'module', process.binding('natives')['internal/deps/acorn/acorn/dist/acorn'])(acorn, { exports: acorn });
const html = fs.readFileSync(sourcePath, 'utf8');
const offset = html.lastIndexOf('<script>') + 8;
const bodySource = html.slice(offset, html.indexOf('</script>', offset));
const ast = acorn.parse(bodySource, { ecmaVersion: 'latest' });
const text = node => bodySource.slice(node.start, node.end);
let body;
function find(node) {
  if (!node || typeof node !== 'object' || body) return;
  if (node.type === 'FunctionExpression' && node.body.body.some(statement => statement.type === 'FunctionDeclaration' && statement.id.name === 'renderSurfaceFxLayer')) {
    body = node.body.body;
    return;
  }
  Object.values(node).forEach(value => Array.isArray(value) ? value.forEach(find) : find(value));
}
find(ast);
if (!body) throw new Error('Could not find Type Deformer editor closure.');

const declarations = new Map();
for (const node of body) {
  if (node.type === 'FunctionDeclaration') declarations.set(node.id.name, { node, code: text(node), start: node.start });
  else if (node.type === 'VariableDeclaration') for (const declaration of node.declarations) if (declaration.id.type === 'Identifier') declarations.set(declaration.id.name, { node: declaration.init, code: `var ${text(declaration)};`, start: declaration.start });
}
function pattern(node, set) {
  if (!node) return;
  if (node.type === 'Identifier') set.add(node.name);
  else if (node.type === 'ObjectPattern') node.properties.forEach(property => pattern(property.value || property.argument, set));
  else if (node.type === 'ArrayPattern') node.elements.forEach(item => pattern(item, set));
  else if (node.type === 'AssignmentPattern') pattern(node.left, set);
  else if (node.type === 'RestElement') pattern(node.argument, set);
}
function locals(node, set, initial = true) {
  if (!node || typeof node !== 'object') return;
  if (!initial && ['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type)) { if (node.type === 'FunctionDeclaration') pattern(node.id, set); return; }
  if (node.type === 'VariableDeclarator') pattern(node.id, set);
  if (node.type === 'CatchClause') pattern(node.param, set);
  for (const [key, value] of Object.entries(node)) if (key !== 'start' && key !== 'end') Array.isArray(value) ? value.forEach(item => locals(item, set, false)) : locals(value, set, false);
}
function refs(node) {
  const found = new Set();
  function walk(current, bound, parent, property) {
    if (!current || typeof current !== 'object') return;
    if (['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(current.type)) {
      bound = new Set(bound); pattern(current.id, bound); current.params.forEach(param => pattern(param, bound)); locals(current.body, bound);
    }
    if (current.type === 'Identifier') {
      const ignore = parent && (parent.type === 'MemberExpression' && property === 'property' && !parent.computed || ['Property','MethodDefinition'].includes(parent.type) && property === 'key' && !parent.computed || ['VariableDeclarator','FunctionDeclaration','FunctionExpression'].includes(parent.type) && property === 'id' || ['LabeledStatement','BreakStatement','ContinueStatement'].includes(parent.type) && property === 'label');
      if (!ignore && !bound.has(current.name)) found.add(current.name);
      return;
    }
    for (const [key, value] of Object.entries(current)) if (key !== 'start' && key !== 'end') Array.isArray(value) ? value.forEach(item => walk(item, bound, current, key)) : value && typeof value === 'object' && walk(value, bound, current, key);
  }
  walk(node, new Set());
  return found;
}

const renderFn = declarations.get('renderSurfaceFxLayer').node;
const rendererObject = renderFn.body.body.find(node => node.type === 'VariableDeclaration' && node.declarations.some(declaration => declaration.id.name === 'renderers')).declarations.find(declaration => declaration.id.name === 'renderers').init;
const entries = rendererObject.properties.filter(property => targetIds.includes(property.key.name));
if (entries.length !== targetIds.length) throw new Error(`Expected ${targetIds.length} renderers, found ${entries.length}.`);

const supplied = new Set(['params','compositionState','renderedSourceText','surfaceFxPhase','dataMoshFrame','axisFieldEditor','blobTrackState','surfaceFxScratchCanvases','workerFontMetrics','textInput','window','document','navigator','performance','ImageData','Path2D','DOMMatrix','FontFace','OffscreenCanvas','console','globalThis','setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame','atob','btoa','fetch','AbortController','ArrayBuffer','DataView','Uint8Array','Uint8ClampedArray','Int32Array','Uint32Array','Float32Array','Float64Array','Uint16Array','Int16Array','Worker','Symbol','Intl','Math','Object','Number','Array','String','Boolean','Map','Set','WeakMap','WeakSet','JSON','Infinity','NaN','Promise','Error','TypeError','RangeError','Date','RegExp','isFinite','parseFloat','parseInt','encodeURIComponent','decodeURIComponent','URL','URLSearchParams','undefined','arguments']);
const override = {
  differentialScheduleWork: 'function differentialScheduleWork(){}',
  marblingScheduleWork: 'function marblingScheduleWork(){}',
  differentialUpdateStatus: 'function differentialUpdateStatus(){return differentialController.state;}',
  marblingUpdateStatus: 'function marblingUpdateStatus(){return marblingPool.state();}',
  differentialSourceKey: `function differentialSourceKey(ch,g){var sourceSize=globalThis.TypeDeformerDraftMode?64:192;return differentialFontRevision+':'+sourceSize+':' +(g&&g.fontAxes?glyphFontSpec(g,sourceSize).key:params.fontWeight+' '+sourceSize+'px '+params.fontFamily)+'\\u0000'+ch;}`,
  differentialGlyphData: `function differentialGlyphData(ch,fontSpec){
    var sourceSize=globalThis.TypeDeformerDraftMode?64:192,unit=sourceSize/192,key=fontSpec?fontSpec.key:differentialSourceKey(ch);
    if(differentialMaskCache.has(key))return differentialMaskCache.get(key);
    var canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true}),font=fontSpec&&fontSpec.glyph?glyphFontSpec(fontSpec.glyph,sourceSize).font:params.fontWeight+' '+sourceSize+'px '+params.fontFamily;
    ctx.font=font;var measure=ctx.measureText(ch);ctx.textBaseline='middle';var middle=ctx.measureText(ch),middleOffset=Number.isFinite(middle.actualBoundingBoxAscent)&&Number.isFinite(measure.actualBoundingBoxAscent)?(measure.actualBoundingBoxAscent-middle.actualBoundingBoxAscent)/unit:192*.35;
    var left=Math.ceil(Math.max(0,measure.actualBoundingBoxLeft||0))+4,ascent=Math.ceil(Math.max(1,measure.actualBoundingBoxAscent||sourceSize))+4;canvas.width=Math.max(8,Math.min(4096,left+Math.ceil(Math.max(measure.width,measure.actualBoundingBoxRight||0))+4));canvas.height=ascent+Math.ceil(Math.max(0,measure.actualBoundingBoxDescent||0))+4;
    ctx.font=font;ctx.textBaseline='alphabetic';ctx.fillStyle='#fff';ctx.fillText(ch,left,ascent);var contours=spectralTraceContours(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height),count=0;
    contours=contours.map(function(contour){count+=contour.points.length;return {area:contour.area/(unit*unit),points:contour.points.map(function(p){return {x:(p.x-left)/unit,y:(p.y-ascent)/unit};})};});
    var result={contours:contours,advance:measure.width/unit,middleOffset:middleOffset,ascent:(ascent-4)/unit,descent:Math.max(0,measure.actualBoundingBoxDescent||0)/unit,pointCount:count};
    while(differentialMaskCache.size&&(differentialMaskCache.size>=32||differentialMaskPoints+count>65536)){var oldest=differentialMaskCache.keys().next().value;differentialMaskPoints-=differentialMaskCache.get(oldest).pointCount;differentialMaskCache.delete(oldest);}if(count<=65536){differentialMaskCache.set(key,result);differentialMaskPoints+=count;}return result;
  }`,
  marblingSource: `function marblingSource(ch,g){
    var sourceSize=globalThis.TypeDeformerDraftMode?64:768;
    var spec=g&&g.fontAxes?glyphFontSpec(g,sourceSize):null,font=params.fontWeight+' '+sourceSize+'px '+params.fontFamily;
    return {key:(spec?spec.key:font)+'\\u0000'+ch,revision:String(marblingFontRevision),load:marblingGlyphData.bind(null,ch,{font:font,glyph:g&&g.fontAxes?g:null})};
  }`,
  marblingGlyphData: `function marblingGlyphData(ch,fontSpec,allowance){
    var sourceSize=globalThis.TypeDeformerDraftMode?64:768,unit=sourceSize/192;
    var canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
    if(!ctx)throw new Error('Marbling Typeの字形Canvasを作成できません。');
    var font=fontSpec.glyph?glyphFontSpec(fontSpec.glyph,sourceSize).font:fontSpec.font;
    try{ctx.font=font;var measure=ctx.measureText(ch),left=Math.ceil(Math.max(0,measure.actualBoundingBoxLeft||0))+16,ascent=Math.ceil(Math.max(1,measure.actualBoundingBoxAscent||sourceSize))+16,right=Math.ceil(Math.max(measure.width,measure.actualBoundingBoxRight||0))+16,descent=Math.ceil(Math.max(0,measure.actualBoundingBoxDescent||0))+16;
      if(left+right>4096||ascent+descent>4096)throw new RangeError('Marbling Typeの字形ソースは4096pxが上限です。');
      canvas.width=Math.max(8,left+right);canvas.height=Math.max(8,ascent+descent);ctx.font=font;ctx.textBaseline='alphabetic';ctx.fillStyle='#fff';ctx.fillText(ch,left,ascent);
      var traced=spectralTraceContours(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height),count=0,contours=traced.map(function(ring){count+=ring.points.length;return {points:ring.points.map(function(p){return {x:(p.x-left)/unit,y:(p.y-ascent)/unit};})};});
      if(count>allowance.maxPoints)throw new RangeError('Marbling Typeの字形メモリ上限です。適用する文字種を減らしてください。');
      ctx.textBaseline='middle';var middle=ctx.measureText(ch),middleOffset=Number.isFinite(middle.actualBoundingBoxAscent)&&Number.isFinite(measure.actualBoundingBoxAscent)?(measure.actualBoundingBoxAscent-middle.actualBoundingBoxAscent)/unit:192*.35;
      return Object.freeze(Object.assign({},MarblingType.prepareMarblingGlyph(contours),{nativeMetrics:Object.freeze({advance:measure.width/unit,middleOffset:middleOffset,ascent:Math.max(1,measure.actualBoundingBoxAscent||sourceSize)/unit,descent:Math.max(0,measure.actualBoundingBoxDescent||0)/unit})}));
    }finally{canvas.width=0;canvas.height=0;}
  }`,
  fontMetrics: 'function fontMetrics(){return workerFontMetrics;}',
  updateDifferentialStatus: 'function updateDifferentialStatus(){}',
  updateMarblingStatus: 'function updateMarblingStatus(){}',
  glyphFontSpec: 'function glyphFontSpec(g,size){return axisFieldEditor.font(g,size);}',
  isIOSLike: 'function isIOSLike(){return false;}',
  scheduleSurfaceFxDraw: 'function scheduleSurfaceFxDraw(){}',
  surfaceCanonicalRasterPlan: `function surfaceCanonicalRasterPlan(glyphs){
    var bounds=contentBounds(glyphs,Math.max(64,differentialEffectPad(glyphs),marblingEffectPad(glyphs,0)));
    if(globalThis.TypeDeformerRenderEnvelope)bounds=globalThis.TypeDeformerRenderEnvelope.expandBounds(bounds,typeof surfaceEnvelopeScale==='number'?surfaceEnvelopeScale:1);
    var density=Math.max(.000001,Math.min(1.5,1440/bounds.w,1440/bounds.h,Math.sqrt(2400000/Math.max(1,bounds.w*bounds.h))));
    return {bounds:bounds,density:density,width:Math.max(1,Math.ceil(bounds.w*density)),height:Math.max(1,Math.ceil(bounds.h*density)),layout:{w:bounds.w,h:bounds.h,s:1,dx:-bounds.x,dy:-bounds.y},envelopeScale:typeof surfaceEnvelopeScale==='number'?surfaceEnvelopeScale:1};
  }`
};
const roots = ['surfaceCanonicalRasterPlan','differentialEffectPad','marblingEffectPad','differentialPrepare','marblingPrepare','differentialAssertReady','marblingAssertReady','differentialGlyphData','differentialFontRevision','differentialMaskCache','differentialMaskPoints','marblingGlyphData','spectralTraceContours'];
const needed = new Set();
const unknown = new Set();
const stack = entries.flatMap(property => [...refs(property.value)]).concat(roots);
while (stack.length) {
  const name = stack.pop();
  if (needed.has(name) || supplied.has(name) || name.startsWith('TypeDeformer')) continue;
  if (override[name]) { needed.add(name); continue; }
  const declaration = declarations.get(name);
  if (!declaration) { unknown.add(name); continue; }
  needed.add(name);
  refs(declaration.node).forEach(dependency => stack.push(dependency));
}
if (unknown.size) throw new Error(`Worker dependencies are not supplied: ${[...unknown].join(', ')}`);

const generated = [...needed].sort((a,b) => (declarations.get(a)?.start || 0) - (declarations.get(b)?.start || 0)).map(name => override[name] || declarations.get(name).code).join('\n\n');
const rendererCode = entries.map(property => property.key.name === 'marblingType'
  ? `marblingType:function(ctx,glyphs,width,height,pixelScale,L,fm,coverBase,livePreview){return ${text(property.value)}(ctx,glyphs,pixelScale,L,fm,livePreview);}`
  : text(property)).join(',\n');
const result = `${generated}\nvar workerRenderers={${rendererCode}};\n`;
const manifest = JSON.stringify({ sourceRevision, operators: targetIds, functions: [...needed], unknown: [...unknown], bytes: result.length }, null, 2) + '\n';
const target = path.join(repo, 'public/engine/surface-worker-kernels.js');
const manifestTarget = path.join(repo, 'public/engine/upstream-manifest.json');
if (process.argv.includes('--check')) {
  if (normalized(fs.readFileSync(target, 'utf8')) !== normalized(result)) throw new Error('Extracted worker differs from upstream source. Run npm run extract:engine.');
  if (normalized(fs.readFileSync(manifestTarget, 'utf8')) !== normalized(manifest)) throw new Error('Worker manifest differs. Run npm run extract:engine.');
} else {
  fs.writeFileSync(target, result);
  fs.writeFileSync(manifestTarget, manifest);
}
console.log(JSON.stringify({ sourceRevision, operators: targetIds.length, functions: needed.size, bytes: result.length }));
