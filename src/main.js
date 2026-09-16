import './style.css';
import { OPERATORS, OPERATOR_ORDER, primaryControl } from './operators.js';
import { createInitialState, createHistory, loadAutosave, normalizeProject, saveAutosave, serializableState } from './state.js';
import { GlyphRenderer, downloadBlob } from './renderer.js';

const $ = selector => document.querySelector(selector);
const app = $('#app'), stage = $('#stage'), canvas = $('#previewCanvas');
const textInput = $('#textInput'), primaryInput = $('#primaryInput'), primaryValue = $('#primaryValue'), primaryLabel = $('#primaryLabel');
const operatorMenu = $('#operatorMenu'), detailsPanel = $('#detailsPanel'), parameterControls = $('#parameterControls');
const renderStatus = $('#renderStatus'), statusText = $('#statusText'), cancelButton = $('#cancelButton');
const history = createHistory();
let state = loadAutosave() || createInitialState();
let autosaveTimer = 0, renderTimer = 0, draftTimer = 0, composing = false, thumbnailCycle = 0, drag = null, controlSnapshotTaken = false, sessionFontRecord = null;

const renderer = new GlyphRenderer(canvas, {
  status(value) {
    renderStatus.classList.toggle('is-busy', !!value.busy);
    renderStatus.classList.toggle('is-error', !!value.error);
    statusText.textContent = !value.busy&&!value.error&&state?.font?.needsReselect ? 'RESELECT THE IMPORTED FONT' : String(value.text || 'READY').toUpperCase();
    cancelButton.hidden = !value.cancel;
  },
  rendered() { app.setAttribute('aria-busy', 'false'); }
});

function cloneState() { return normalizeProject(serializableState(state)); }
function setRangeProgress(input) { const min=Number(input.min)||0,max=Number(input.max)||100,value=Number(input.value)||0;input.style.setProperty('--range-progress',`${(value-min)/(max-min)*100}%`); }
function scheduleSave() { clearTimeout(autosaveTimer); autosaveTimer=setTimeout(()=>saveAutosave(state),300); }
function scheduleRender(delay=35) { clearTimeout(draftTimer);draftTimer=0;clearTimeout(renderTimer);renderTimer=setTimeout(()=>{renderTimer=0;renderer.requestExact(state);},delay);scheduleSave(); }
function scheduleDraft() { clearTimeout(renderTimer);renderTimer=0;if(!draftTimer)draftTimer=setTimeout(()=>{draftTimer=0;renderer.requestDraft(state);},24);scheduleSave(); }
function historyStart() { if(controlSnapshotTaken)return;history.push(state);controlSnapshotTaken=true;syncHistory(); }
function historyEnd() { controlSnapshotTaken=false;syncHistory(); }
function syncHistory(){const status=history.status();$('#undoButton').disabled=!status.undo;$('#redoButton').disabled=!status.redo;}

function formatParameter(control,value){return Number(value).toFixed(control.format);}
function displayLabel(value){const text=String(value||'').toLocaleLowerCase();return text.charAt(0).toLocaleUpperCase()+text.slice(1);}
function syncPrimaryControl(){
  const control=primaryControl(state.operator),value=state.operatorParams[state.operator][control.key];
  primaryLabel.textContent=displayLabel(control.primaryLabel);primaryInput.min=control.min;primaryInput.max=control.max;primaryInput.step=control.step;primaryInput.value=value;primaryInput.dataset.key=control.key;primaryInput.setAttribute('aria-label',control.primaryLabel);primaryValue.textContent=formatParameter(control,value);setRangeProgress(primaryInput);
}
function syncDetailRange(control){
  const slider=$(`#param-${control.key}`);if(!slider)return;const value=state.operatorParams[state.operator][control.key],number=slider.parentElement.querySelector('.number-input'),output=slider.closest('.parameter-row').querySelector('output');slider.value=value;if(number)number.value=value;if(output)output.textContent=formatParameter(control,value);setRangeProgress(slider);
}
function applyPrimaryValue(raw,mode='exact'){
  const control=primaryControl(state.operator),parsed=Number(raw);if(!Number.isFinite(parsed))return;const value=Math.max(control.min,Math.min(control.max,parsed));state.operatorParams[state.operator][control.key]=value;primaryInput.value=value;primaryValue.textContent=formatParameter(control,value);setRangeProgress(primaryInput);syncDetailRange(control);mode==='draft'?scheduleDraft():scheduleRender();
}

function bindRange(input,apply){
  let adjusting=null,lastFinish=0,pointerId=null;
  const outsideFinish=event=>{if(pointerId==null||event.pointerId===pointerId)finish();};
  const begin=(mode,event)=>{if(!adjusting){historyStart();adjusting=mode;if(mode==='pointer'){pointerId=event.pointerId;window.addEventListener('pointerup',outsideFinish,{capture:true});window.addEventListener('pointercancel',outsideFinish,{capture:true});}}};
  const finish=()=>{if(!adjusting)return;adjusting=null;pointerId=null;window.removeEventListener('pointerup',outsideFinish,{capture:true});window.removeEventListener('pointercancel',outsideFinish,{capture:true});lastFinish=performance.now();historyEnd();scheduleRender(0);};
  input.addEventListener('pointerdown',event=>begin('pointer',event));
  input.addEventListener('pointerup',finish);input.addEventListener('pointercancel',finish);input.addEventListener('lostpointercapture',finish);
  input.addEventListener('focus',historyStart);
  input.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))begin('keyboard',event);});
  input.addEventListener('keyup',event=>{if(adjusting==='keyboard'&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key))finish();});
  input.addEventListener('input',()=>apply(input.value,'draft'));
  input.addEventListener('change',()=>{if(!adjusting&&performance.now()-lastFinish>80){historyEnd();scheduleRender(0);}});
  input.addEventListener('blur',()=>{if(adjusting)finish();else historyEnd();});
}

function operatorIndex(id){return OPERATOR_ORDER.indexOf(id);}
function syncOperatorChrome(){
  const operator=OPERATORS[state.operator],index=operatorIndex(state.operator)+1,label=String(index).padStart(2,'0');
  $('#operatorNumber').textContent=label;$('#activeVerb').textContent=operator.verb;$('#activeOperator').textContent=operator.name;
  $('#detailsIndex').textContent=`${label} / 06`;$('#detailsTitle').textContent=operator.name;
  [...operatorMenu.querySelectorAll('.operator-option')].forEach(button=>button.setAttribute('aria-current',button.dataset.operator===state.operator?'true':'false'));
}

function closeOperatorMenu(restoreFocus=false){operatorMenu.hidden=true;$('#operatorMenuButton').setAttribute('aria-expanded','false');if(restoreFocus)requestAnimationFrame(()=>$('#operatorMenuButton').focus());}
function closeMenus(){closeOperatorMenu();detailsPanel.hidden=true;$('#detailsButton').setAttribute('aria-expanded','false');}
function buildOperatorMenu(){
  operatorMenu.replaceChildren(...OPERATOR_ORDER.map((id,index)=>{
    const operator=OPERATORS[id],button=document.createElement('button');button.type='button';button.className='operator-option';button.dataset.operator=id;
    button.innerHTML=`<span class="option-number">${String(index+1).padStart(2,'0')}</span><canvas class="option-preview" width="160" height="104" aria-hidden="true"></canvas><span class="option-copy"><strong>${operator.name}</strong><span>${operator.verb} — ${operator.description}</span></span>`;
    const preview=button.querySelector('canvas'),ctx=preview.getContext('2d');ctx.strokeStyle='#2758d7';ctx.lineWidth=2;ctx.beginPath();for(let i=0;i<8;i++){const x=12+i*18,y=52+Math.sin(i*.9+index)*17;ctx[i?'lineTo':'moveTo'](x,y);}ctx.stroke();
    button.addEventListener('click',()=>selectOperator(id));return button;
  }));
}

function selectOperator(id){
  if(id===state.operator){closeMenus();return;}
  history.push(state);state.operator=id;state.params.activeOperator=id;state.camera={zoom:1,x:0,y:0,autoFit:true};syncAll();closeMenus();requestAnimationFrame(()=>$('#operatorMenuButton').focus());scheduleRender(0);refreshThumbnail(id);
}

function buildDetails(){
  const operator=OPERATORS[state.operator], values=state.operatorParams[state.operator];parameterControls.replaceChildren();
  for(const control of operator.controls){
    const row=document.createElement('div');row.className='parameter-row';
    if(control.type==='select'){
      row.innerHTML=`<label for="param-${control.key}"><span>${control.label}</span></label><select id="param-${control.key}">${control.options.map(option=>`<option value="${option[0]}">${option[1]}</option>`).join('')}</select>`;
      const input=row.querySelector('select');input.value=values[control.key];input.addEventListener('pointerdown',historyStart);input.addEventListener('keydown',historyStart);input.addEventListener('change',()=>{values[control.key]=input.value;historyEnd();scheduleRender();});
    }else{
      row.innerHTML=`<label for="param-${control.key}"><span>${control.label}</span><output>${Number(values[control.key]).toFixed(control.format)}</output></label><div class="parameter-pair"><input id="param-${control.key}" type="range" min="${control.min}" max="${control.max}" step="${control.step}" value="${values[control.key]}"><input class="number-input" type="number" min="${control.min}" max="${control.max}" step="${control.step}" value="${values[control.key]}" aria-label="${control.label} value"></div>`;
      const [slider,number]=row.querySelectorAll('input'),output=row.querySelector('output');setRangeProgress(slider);
      const apply=(value,mode='exact')=>{const parsed=Number(value);if(String(value).trim()===''||!Number.isFinite(parsed)){number.value=values[control.key];return;}const normalized=Math.max(control.min,Math.min(control.max,parsed));values[control.key]=normalized;slider.value=normalized;number.value=normalized;output.textContent=formatParameter(control,normalized);setRangeProgress(slider);if(control.key===primaryControl(state.operator).key)syncPrimaryControl();mode==='draft'?scheduleDraft():scheduleRender();};
      bindRange(slider,apply);
      number.addEventListener('focus',historyStart);number.addEventListener('change',()=>{apply(number.value,'exact');historyEnd();});
    }
    parameterControls.append(row);
  }
}

function syncAll(){
  textInput.value=state.text;syncPrimaryControl();
  $('#inkColor').value=state.params.ink;$('#paperColor').value=state.params.paper;
  const fontSelect=$('#fontFamily');if(![...fontSelect.options].some(option=>option.value===state.font.family)){const option=new Option(state.font.name,state.font.family);fontSelect.add(option);}fontSelect.value=state.font.family;
  syncOperatorChrome();buildDetails();syncHistory();renderer.lastState=state;renderer.redraw();
}

async function refreshThumbnail(id){
  const cycle=++thumbnailCycle,canvas=operatorMenu.querySelector(`[data-operator="${id}"] canvas`);if(!canvas)return;
  const copy=cloneState();copy.operator=id;copy.params.activeOperator=id;copy.strength=1;
  try{await renderer.thumbnail(copy,canvas);}catch(error){if(cycle===thumbnailCycle)console.warn('Thumbnail render failed',id,error);}
}
async function refreshAllThumbnails(){
  const cycle=++thumbnailCycle;
  for(const id of OPERATOR_ORDER){if(cycle!==thumbnailCycle||operatorMenu.hidden)return;const canvas=operatorMenu.querySelector(`[data-operator="${id}"] canvas`),copy=cloneState();copy.operator=id;copy.params.activeOperator=id;copy.strength=1;try{await renderer.thumbnail(copy,canvas);}catch(error){console.warn('Thumbnail render failed',id,error);}}
}

function showOperatorMenu(moveFocus=true){if(!operatorMenu.hidden)return;closeMenus();operatorMenu.hidden=false;$('#operatorMenuButton').setAttribute('aria-expanded','true');refreshAllThumbnails();if(moveFocus)requestAnimationFrame(()=>operatorMenu.querySelector('[aria-current="true"]')?.focus());}
function openOperatorMenu(){if(operatorMenu.hidden)showOperatorMenu();else closeOperatorMenu(true);}
function openDetails(force){const open=typeof force==='boolean'?force:detailsPanel.hidden;operatorMenu.hidden=true;$('#operatorMenuButton').setAttribute('aria-expanded','false');detailsPanel.hidden=!open;$('#detailsButton').setAttribute('aria-expanded',String(open));if(open){buildDetails();requestAnimationFrame(()=>$('#closeDetailsButton').focus());}else requestAnimationFrame(()=>$('#detailsButton').focus());}
function restore(next, options={}){state=next;if(options.disk){sessionFontRecord=null;renderer.setFontRecord(null);}else renderer.setFontRecord(state.font.imported?sessionFontRecord:null);syncAll();scheduleRender(0);}

buildOperatorMenu();syncAll();

let textBeforeFocus=null;
textInput.addEventListener('focus',()=>{textBeforeFocus=cloneState();});
textInput.addEventListener('compositionstart',()=>{composing=true;});
textInput.addEventListener('compositionend',()=>{composing=false;state.text=textInput.value;scheduleRender();});
textInput.addEventListener('input',()=>{state.text=textInput.value;if(!composing)scheduleRender(120);});
textInput.addEventListener('blur',()=>{if(textBeforeFocus&&textBeforeFocus.text!==state.text)history.push(textBeforeFocus);textBeforeFocus=null;syncHistory();});
bindRange(primaryInput,applyPrimaryValue);

$('#operatorMenuButton').addEventListener('click',openOperatorMenu);$('#operatorReadout').addEventListener('click',openOperatorMenu);
$('#detailsButton').addEventListener('click',()=>openDetails());$('#closeDetailsButton').addEventListener('click',()=>openDetails(false));
$('#brandButton').addEventListener('click',()=>{state.camera={zoom:1,x:0,y:0,autoFit:true};$('#fitButton').hidden=true;scheduleRender(0);});
$('#fitButton').addEventListener('click',()=>{state.camera={zoom:1,x:0,y:0,autoFit:true};$('#fitButton').hidden=true;scheduleRender(0);});
cancelButton.addEventListener('click',()=>{clearTimeout(renderTimer);clearTimeout(draftTimer);renderTimer=draftTimer=0;renderer.cancel();});
$('#undoButton').addEventListener('click',()=>{const next=history.undo(state);if(next)restore(next);});
$('#redoButton').addEventListener('click',()=>{const next=history.redo(state);if(next)restore(next);});

for(const button of document.querySelectorAll('[data-preset]'))button.addEventListener('click',()=>{
  history.push(state);Object.assign(state.operatorParams[state.operator],OPERATORS[state.operator].presets[button.dataset.preset]);buildDetails();syncPrimaryControl();scheduleRender(0);refreshThumbnail(state.operator);
});
$('#inkColor').addEventListener('input',event=>{state.params.ink=event.target.value;scheduleRender();});
$('#inkColor').addEventListener('focus',historyStart);$('#inkColor').addEventListener('change',historyEnd);
$('#paperColor').addEventListener('input',event=>{state.params.paper=event.target.value;renderer.redraw();scheduleSave();});
$('#paperColor').addEventListener('focus',historyStart);$('#paperColor').addEventListener('change',historyEnd);
$('#fontFamily').addEventListener('focus',historyStart);$('#fontFamily').addEventListener('change',event=>{state.font={family:event.target.value,name:event.target.selectedOptions[0].textContent,imported:false};state.params.fontFamily=state.font.family;renderer.setFontRecord(null);historyEnd();scheduleRender(0);});

$('#fontInput').addEventListener('change',async event=>{
  const file=event.target.files?.[0];if(!file)return;if(file.size>128*1024*1024){statusText.textContent='FONT IS LARGER THAN 128 MB';return;}
  try{
    history.push(state);const buffer=await file.arrayBuffer(),family=`Glyph Current ${Date.now()}`,face=new FontFace(family,buffer);await face.load();document.fonts.add(face);
    state.font={family:`"${family}"`,name:file.name.replace(/\.[^.]+$/,''),imported:true};state.params.fontFamily=state.font.family;sessionFontRecord={family,buffer};renderer.setFontRecord(sessionFontRecord);syncAll();scheduleRender(0);statusText.textContent='FONT READY';
  }catch(error){renderStatus.classList.add('is-error');statusText.textContent=error.message.toUpperCase();}
});

const chromeRegions=[...app.querySelectorAll('.chrome')];let focusBeforeFocusMode=null;
function setFocusMode(hidden){
  if(hidden){focusBeforeFocusMode=document.activeElement;closeMenus();chromeRegions.forEach(region=>{region.inert=true;});app.classList.add('ui-hidden');$('#restoreUi').hidden=false;requestAnimationFrame(()=>$('#restoreUi button').focus());return;}
  chromeRegions.forEach(region=>{region.inert=false;});app.classList.remove('ui-hidden');$('#restoreUi').hidden=true;const target=focusBeforeFocusMode;focusBeforeFocusMode=null;requestAnimationFrame(()=>target?.isConnected&&target.focus());
}
$('#fullscreenButton').addEventListener('click',()=>setFocusMode(true));
$('#restoreUi button').addEventListener('click',()=>setFocusMode(false));

stage.addEventListener('wheel',event=>{event.preventDefault();if(!controlSnapshotTaken)historyStart();const factor=Math.exp(-event.deltaY*.001);state.camera.zoom=Math.max(.2,Math.min(8,state.camera.zoom*factor));state.camera.autoFit=false;$('#fitButton').hidden=false;renderer.redraw();scheduleSave();clearTimeout(stage._wheelEnd);stage._wheelEnd=setTimeout(historyEnd,180);},{passive:false});
stage.addEventListener('pointerdown',event=>{if(event.button!==0||event.target.closest('button,input,textarea,select'))return;history.push(state);drag={id:event.pointerId,x:event.clientX,y:event.clientY,cx:state.camera.x,cy:state.camera.y};stage.setPointerCapture(event.pointerId);});
stage.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;state.camera.x=drag.cx+event.clientX-drag.x;state.camera.y=drag.cy+event.clientY-drag.y;state.camera.autoFit=false;$('#fitButton').hidden=false;renderer.redraw();scheduleSave();});
stage.addEventListener('pointerup',()=>{drag=null;if(app.classList.contains('ui-hidden')){$('#restoreUi button').click();return;}syncHistory();});

const exportDialog=$('#exportDialog'),exportDownload=$('#exportDownload');let exportObjectUrl=null;
$('#exportButton').addEventListener('click',()=>exportDialog.showModal());
async function doExport(format){
  const buttons=[$('#pngButton'),$('#svgButton')],button=format==='png'?buttons[0]:buttons[1],labels=buttons.map(item=>item.textContent);buttons.forEach(item=>item.disabled=true);button.textContent='Rendering';
  try{
    const scale=Number($('#exportScale').value),exportState=cloneState(),result=await renderer.export(exportState,{scale,background:$('#exportBackground').checked,format}),filename=`glyph-current-${exportState.operator}-${result.width}x${result.height}.${format}`;
    if(exportObjectUrl)URL.revokeObjectURL(exportObjectUrl);exportObjectUrl=URL.createObjectURL(result.blob);exportDownload.href=exportObjectUrl;exportDownload.download=filename;exportDownload.hidden=false;exportDownload.textContent=`Download ${format.toUpperCase()} · ${result.width} × ${result.height}`;
    exportDownload.click();
    const reduction=result.reduced?` Requested ${result.requestedScale}× was reduced to ${result.actualScale.toFixed(2)}× (${result.reductionReason}).`:'';
    $('#exportNote').textContent=`Ready: ${result.width} × ${result.height}px ${format.toUpperCase()}.${reduction}`;
  }
  catch(error){$('#exportNote').textContent=error.message;}
  finally{buttons.forEach((item,index)=>{item.disabled=false;item.textContent=labels[index];});}
}
$('#pngButton').addEventListener('click',()=>doExport('png'));$('#svgButton').addEventListener('click',()=>doExport('svg'));
$('#saveProjectButton').addEventListener('click',()=>downloadBlob(new Blob([JSON.stringify(serializableState(state),null,2)],{type:'application/json'}),'glyph-current-project.json'));
$('#loadProjectInput').addEventListener('change',async event=>{try{const data=JSON.parse(await event.target.files[0].text());history.push(state);restore(normalizeProject(data,{disk:true}),{disk:true});exportDialog.close();if(state.font.needsReselect)statusText.textContent='RESELECT THE IMPORTED FONT';}catch(error){$('#exportNote').textContent=error.message;}});

document.addEventListener('pointerdown',event=>{if(!operatorMenu.hidden&&!operatorMenu.contains(event.target)&&!event.target.closest('#operatorMenuButton,#operatorReadout')){operatorMenu.hidden=true;$('#operatorMenuButton').setAttribute('aria-expanded','false');}});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){if(app.classList.contains('ui-hidden')){$('#restoreUi button').click();return;}if(!operatorMenu.hidden){closeOperatorMenu(true);return;}if(!detailsPanel.hidden){openDetails(false);return;}closeMenus();return;}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'&&document.activeElement!==textInput){event.preventDefault();const next=event.shiftKey?history.redo(state):history.undo(state);if(next)restore(next);}
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='y'){event.preventDefault();const next=history.redo(state);if(next)restore(next);}
});

stage.addEventListener('pointermove',event=>{if(!drag&&event.clientX<=6)showOperatorMenu(false);});

let observedStage=false;new ResizeObserver(()=>{if(!observedStage){observedStage=true;return;}scheduleRender(80);}).observe(stage);
window.addEventListener('beforeunload',()=>{saveAutosave(state);if(exportObjectUrl)URL.revokeObjectURL(exportObjectUrl);});
renderer.render(state);

window.__glyphCurrent={getState:()=>serializableState(state),selectOperator,getRenderState:()=>({sequence:renderer.sequence,displayRevision:renderer.displayRevision,busy:renderer.busy,completedOperator:renderer.completedOperator,completedMode:renderer.completedMode,status:statusText.textContent,error:renderStatus.classList.contains('is-error'),alphaBounds:renderer.alphaBounds,bitmap:renderer.bitmap?{width:renderer.bitmap.width,height:renderer.bitmap.height}:null,metrics:renderer.getMetrics()}),getRenderMetrics:()=>renderer.getMetrics(),renderer};
