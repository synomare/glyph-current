export const OPERATOR_ORDER = ['liquidRope', 'sinewTorque', 'repulsiveCurves', 'differentialType', 'marblingType', 'asemicDuctus'];

export const PRIMARY_PARAMETERS = {
  liquidRope: { key: 'ropeRadius', label: 'COIL' },
  sinewTorque: { key: 'sinewTorque', label: 'TORQUE' },
  repulsiveCurves: { key: 'repulsiveForce', label: 'REPULSION' },
  differentialType: { key: 'differentialAge', label: 'GROWTH' },
  marblingType: { key: 'marblingAmount', label: 'FLOW' },
  asemicDuctus: { key: 'asemicMemory', label: 'MEMORY' }
};

const range = (key, label, min, max, step, value, format = 2) => ({ type: 'range', key, label, min, max, step, value, format });
const select = (key, label, value, options) => ({ type: 'select', key, label, value, options });

export const OPERATORS = {
  liquidRope: {
    name: 'Liquid Rope', verb: '巻く', description: '輪郭を一本のコイルへ巻き直す。', colorKey: 'liquidRopeColor',
    controls: [range('ropeSpeed','Speed / 速度比',.12,1,.01,.52),range('ropeRadius','Coil / 巻きの径',.025,.35,.005,.14,3),range('ropeWidth','Thread / 糸の太さ',.004,.055,.001,.024,3),range('ropeSpread','Spread / 横への広がり',.25,1.6,.01,1),range('ropePhase','Phase / 開始位置',0,1,.01,.15),select('ropeHistory','History / 速度の変え方','accelerate',[['accelerate','Accelerate'],['decelerate','Decelerate']])],
    presets: { quiet:{ropeSpeed:.42,ropeRadius:.09,ropeWidth:.014,ropeSpread:.82,ropePhase:.1,ropeHistory:'accelerate'}, wild:{ropeSpeed:.84,ropeRadius:.27,ropeWidth:.035,ropeSpread:1.34,ropePhase:.58,ropeHistory:'decelerate'} }
  },
  sinewTorque: {
    name: 'Sinew Torque', verb: '捩る', description: '引き、締め、軸に沿って肉を捩る。', colorKey: 'sinewColor',
    controls: [select('sinewSystem','Tissue system','fascicle',[['legacy','Legacy membrane'],['torsion','Axial torsion'],['fascicle','Fascicle field'],['compression','Belly compression'],['braid','Opposed braid']]),range('sinewPull','Tissue pull',-640,640,2,18,0),range('sinewTorque','Torque',-540,540,2,28,0),range('sinewTension','Tension',.1,8,.02,2.6),range('sinewWaist','Waist pressure',-2,4,.02,.32),range('sinewAxis','Body axis',-180,180,1,-12,0)],
    presets: { quiet:{sinewSystem:'fascicle',sinewPull:18,sinewTorque:28,sinewTension:2.6,sinewWaist:.32,sinewAxis:-12}, wild:{sinewSystem:'braid',sinewPull:260,sinewTorque:210,sinewTension:1.1,sinewWaist:1.5,sinewAxis:-28} }
  },
  repulsiveCurves: {
    name: 'Repulsive Curves', verb: '反発', description: '閉じた曲線を互いに押し返してたわませる。', colorKey: 'repulsiveCurvesColor',
    controls: [range('repulsiveLength','Length / 長さの目標',1,2.2,.01,1.55),range('repulsiveDepth','Depth / 容器の奥行き',.06,.6,.01,.3),range('repulsiveWidth','Tube / 太さの上限',.01,.08,.001,.04,3),range('repulsiveForce','Repulsion / 反発',.15,2.5,.01,1),range('repulsiveStrands','Layers / 曲線の層数',1,2,1,1,0),range('repulsiveBend','Bending / 曲げ抵抗',0,1,.01,.6),range('repulsiveYaw','Yaw / 横からの視点',-180,180,1,28,0),range('repulsiveTilt','Tilt / 上下の視点',-80,80,1,-24,0)],
    presets: { quiet:{repulsiveLength:1.28,repulsiveDepth:.18,repulsiveWidth:.025,repulsiveForce:.62,repulsiveStrands:1,repulsiveBend:.76,repulsiveYaw:12,repulsiveTilt:-10}, wild:{repulsiveLength:2.05,repulsiveDepth:.52,repulsiveWidth:.068,repulsiveForce:2.1,repulsiveStrands:2,repulsiveBend:.2,repulsiveYaw:58,repulsiveTilt:-38} }
  },
  differentialType: {
    name: 'Differential Type', verb: '育てる', description: '輪郭を増殖させ、襞と分岐へ育てる。', colorKey: 'differentialColor',
    controls: [range('differentialAge','Growth / 成長量',0,5,.025,2.2),range('differentialGrain','Fold spacing / 襞の間隔',2.5,12,.1,3.5),range('differentialMemory','Source memory / 原字への拘束',0,.05,.0001,.0015,4),range('differentialTension','Bending / 曲げ抵抗',.18,1.2,.01,.35),range('differentialPatch','Nutrient variation / 成長の偏り',0,1,.01,.8),range('differentialArea','Ink mass / 面積の目標比',.5,2,.01,1.1),range('differentialMotion','Growth phase / 成長位相',0,1,.01,.8)],
    presets: { quiet:{differentialAge:1.25,differentialGrain:6,differentialMemory:.008,differentialTension:.72,differentialPatch:.35,differentialArea:.92,differentialMotion:.6}, wild:{differentialAge:4.2,differentialGrain:2.8,differentialMemory:.0005,differentialTension:.22,differentialPatch:.94,differentialArea:1.55,differentialMotion:1} }
  },
  marblingType: {
    name: 'Marbling Type', verb: '流す', description: '字形を櫛目と渦の流れへ送り込む。', colorKey: 'marblingColor',
    controls: [select('marblingMode','Flow grammar / 流れの形','rake',[['rake','Rake / 櫛目'],['eddy','Eddy / 双渦'],['plume','Plume / 羽毛']]),range('marblingAmount','Flow / 流動量',0,4,.01,.65),range('marblingPitch','Tool span / 流れの間隔',12,180,1,76,0),range('marblingFocus','Focus / 折りの鋭さ',0,1,.01,.55),range('marblingCirculation','Circulation / 渦の巻き数',-4,4,.02,.9),range('marblingAngle','Direction / 方向',-180,180,1,-18,0),range('marblingMotion','Flow phase / 流れの位相',0,1,.01,.55)],
    presets: { quiet:{marblingMode:'rake',marblingAmount:.55,marblingPitch:92,marblingFocus:.35,marblingCirculation:.45,marblingAngle:-12,marblingMotion:.35}, wild:{marblingMode:'eddy',marblingAmount:3.2,marblingPitch:32,marblingFocus:.86,marblingCirculation:2.8,marblingAngle:38,marblingMotion:.9} }
  },
  asemicDuctus: {
    name: 'Asemic Ductus', verb: '書き直す', description: '字形の記憶から別の筆記線を組み上げる。', colorKey: 'asemicColor',
    controls: [select('asemicGrammar','Script grammar','current',[['current','Continuous current'],['chamber','Counter chamber hand'],['incised','Incised shorthand'],['polyphonic','Polyphonic ductus']]),range('asemicMemory','Source memory',0,1,.01,.68),range('asemicGestures','Gesture count',2,16,1,7,0),range('asemicWeight','Body weight',.4,64,.2,7.2,1),range('asemicFlow','Ductus flow',-4,4,.02,1.16),range('asemicContrast','Nib contrast',0,6,.02,1.4),range('asemicFlourish','Entry / exit reach',0,480,1,34,0),range('asemicCounter','Counter memory',0,1.5,.01,.72)],
    presets: { quiet:{asemicGrammar:'current',asemicMemory:.82,asemicGestures:5,asemicWeight:4.8,asemicFlow:.72,asemicContrast:.8,asemicFlourish:20,asemicCounter:.86}, wild:{asemicGrammar:'polyphonic',asemicMemory:.28,asemicGestures:14,asemicWeight:15,asemicFlow:3.1,asemicContrast:4.4,asemicFlourish:210,asemicCounter:.24} }
  }
};

export function defaultParameters() {
  const params = {
    seed: 38, fontSize: 220, fontWeight: 700, fontFamily: 'Arial, sans-serif', fontAxes: {}, vertical: false,
    ink: '#151515', paper: '#f2f1ed', accent: '#2758d7', activeOperator: OPERATOR_ORDER[0],
    liquidRopeColor:'#151515', liquidRopeSourceMode:'hide', liquidRopeOpacity:1, liquidRopeBlend:'source-over',
    sinewColor:'#151515', sinewSourceMode:'hide', sinewOpacity:1, sinewBlend:'source-over',
    repulsiveCurvesColor:'#151515', repulsiveCurvesSourceMode:'hide', repulsiveCurvesOpacity:1, repulsiveCurvesBlend:'source-over',
    differentialColor:'#151515', differentialSourceMode:'hide', differentialOpacity:1, differentialBlend:'source-over',
    marblingColor:'#151515', marblingSourceMode:'hide', marblingOpacity:1, marblingBlend:'source-over',
    asemicColor:'#151515', asemicSourceMode:'hide', asemicOpacity:1, asemicBlend:'source-over'
  };
  for (const id of OPERATOR_ORDER) for (const control of OPERATORS[id].controls) params[control.key] = control.value;
  return params;
}

export function operatorKeys(id) { return [id, ...OPERATORS[id].controls.map(c => c.key)]; }

export function primaryControl(id) {
  const definition=PRIMARY_PARAMETERS[id],control=OPERATORS[id]?.controls.find(item=>item.key===definition?.key);
  if(!definition||!control||control.type!=='range')throw new Error(`Primary parameter is not configured for ${id}.`);
  return { ...control, primaryLabel: definition.label };
}
