import { defaultParameters, OPERATOR_ORDER, OPERATORS } from './operators.js';

export const PROJECT_SCHEMA = 'glyph-current/project@1';
const STORAGE_KEY = 'glyph-current.autosave.v1';

export function createInitialState() {
  return {
    schema: PROJECT_SCHEMA,
    text: 'SYNOMARE',
    operator: OPERATOR_ORDER[0],
    strength: 1,
    params: defaultParameters(),
    operatorParams: Object.fromEntries(OPERATOR_ORDER.map(id => [id, Object.fromEntries(OPERATORS[id].controls.map(control => [control.key, control.value]))])),
    camera: { zoom: 1, x: 0, y: 0, autoFit: true },
    font: { family: 'Arial, sans-serif', name: 'Arial', imported: false },
    updatedAt: new Date().toISOString()
  };
}

export function serializableState(state) {
  return {
    schema: PROJECT_SCHEMA,
    text: state.text,
    operator: state.operator,
    strength: 1,
    params: state.params,
    operatorParams: state.operatorParams,
    camera: state.camera,
    font: { family: state.font.family, name: state.font.name, imported: !!state.font.imported },
    updatedAt: new Date().toISOString()
  };
}

export function normalizeProject(data, options = {}) {
  if (!data || data.schema !== PROJECT_SCHEMA) throw new Error('This is not a GLYPH CURRENT project file.');
  const base = createInitialState();
  const operator = OPERATOR_ORDER.includes(data.operator) ? data.operator : base.operator;
  base.text = typeof data.text === 'string' ? data.text : base.text;
  base.operator = operator;
  base.strength = 1;
  const acceptedParams = ['ink','paper','seed','fontWeight'];
  for (const key of acceptedParams) {
    const value = data.params?.[key];
    if (key === 'ink' || key === 'paper') { if (/^#[0-9a-f]{6}$/i.test(value || '')) base.params[key] = value; }
    else if (Number.isFinite(Number(value))) base.params[key] = Number(value);
  }
  base.params.activeOperator = operator;
  for (const id of OPERATOR_ORDER) {
    const source = data.operatorParams?.[id] || {};
    for (const control of OPERATORS[id].controls) {
      let value = source[control.key];
      if (control.type === 'select') {
        if (!control.options.some(option => option[0] === value)) value = control.value;
      } else { const numeric = Number(value); value = Number.isFinite(numeric) ? Math.max(control.min, Math.min(control.max, numeric)) : control.value; }
      base.operatorParams[id][control.key] = value;
    }
  }
  base.camera = { ...base.camera, ...(data.camera || {}), zoom: Math.max(.2, Math.min(8, Number(data.camera?.zoom) || 1)), x: Number(data.camera?.x) || 0, y: Number(data.camera?.y) || 0 };
  base.font = { ...base.font, ...(data.font || {}) };
  if (base.font.imported && options.disk) {
    base.font.family = 'Arial, sans-serif';
    base.font.needsReselect = true;
  }
  base.params.fontFamily = base.font.family;
  return base;
}

export function saveAutosave(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableState(state)));
}

export function loadAutosave() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return normalizeProject(JSON.parse(raw), { disk: true }); } catch { return null; }
}

export function createHistory(limit = 80) {
  let undo = [], redo = [];
  const encode = state => JSON.stringify(serializableState(state));
  return {
    push(state) { const value = encode(state); if (undo.at(-1) !== value) undo.push(value); if (undo.length > limit) undo.shift(); redo = []; },
    undo(state) { if (!undo.length) return null; redo.push(encode(state)); return normalizeProject(JSON.parse(undo.pop())); },
    redo(state) { if (!redo.length) return null; undo.push(encode(state)); return normalizeProject(JSON.parse(redo.pop())); },
    clear() { undo = []; redo = []; },
    status() { return { undo: undo.length > 0, redo: redo.length > 0 }; }
  };
}
