// Presentation archive only. Coordinates remain Float64 physical/model coordinates.
// It cannot resume mechanics: reproductive history, RNG, and plastic internal state
// are deliberately omitted. Never substitute these decoded states into Simulator.
export const HISTORY_SCHEMA='snowflake-cinematic-history';
export const HISTORY_VERSION=1;
export const DEFAULT_HISTORY_BYTES=64*1024*1024;
export const DEFAULT_HISTORY_FRAMES=8192;
export const CELL_STRIDE=9, BOND_STRIDE=6;
const MAX_CELLS=1024, MAX_BONDS=1023, FRAME_OVERHEAD=1024;
const finite=(v,name)=>{if(!Number.isFinite(v))throw new TypeError(`${name} must be finite`);return v;};
const integer=(v,name,min=0,max=Number.MAX_SAFE_INTEGER)=>{if(!Number.isInteger(v)||v<min||v>max)throw new RangeError(`Invalid ${name}`);return v;};
const vector=(v,n,name)=>{if(!v||v.length!==n)throw new TypeError(`Invalid ${name}`);return Array.from(v,x=>finite(x,name));};
const clamp01=x=>Math.max(0,Math.min(1,finite(x,'Timeline position')));
const clone=x=>typeof structuredClone==='function'?structuredClone(x):JSON.parse(JSON.stringify(x));
const shortString=(x,name,limit=512)=>{const s=String(x??'');if(s.length>limit)throw new RangeError(`${name} is too long`);return s;};

export function estimateFrameBytes(cellCount,bondCount,metadataBytes=0){
 return cellCount*(CELL_STRIDE*8+4)+bondCount*(BOND_STRIDE*8+8+1)+FRAME_OVERHEAD+metadataBytes;
}
export function frameByteLength(frame){
 return frame.cellIds.byteLength+frame.cells.byteLength+frame.bondEnds.byteLength+frame.bonds.byteLength+frame.bondBroken.byteLength+FRAME_OVERHEAD+2*JSON.stringify(frame.meta).length;
}
export function packRenderState(state,{sequence=0,kind='sample'}={}){
 const n=integer(state.cells.length,'cell count',1,MAX_CELLS),m=integer(state.bonds.length,'bond count',0,MAX_BONDS);
 const cellIds=new Uint32Array(n),cells=new Float64Array(n*CELL_STRIDE),bondEnds=new Uint32Array(m*2),bonds=new Float64Array(m*BOND_STRIDE),bondBroken=new Uint8Array(m);
 state.cells.forEach((c,i)=>{
  // The current renderer indexes cells by ID. Reject incompatible imported identity.
  if(c.id!==i)throw new RangeError('This renderer requires persistent contiguous cell IDs');
  cellIds[i]=c.id;cells.set([...vector(c.p,3,'cell position'),...vector(c.q,4,'cell quaternion'),finite(c.size,'cell size'),finite(c.shape,'cell shape')],i*CELL_STRIDE);
  if(c.size<=0||c.shape<=0||Math.abs(Math.hypot(...c.q)-1)>1e-5)throw new RangeError('Invalid cell dimensions or quaternion');
 });
 state.bonds.forEach((b,i)=>{
  bondEnds[2*i]=integer(b.m,'mother ID',0,n-1);bondEnds[2*i+1]=integer(b.d,'daughter ID',0,n-1);
  bonds.set([finite(b.az,'bond azimuth'),finite(b.angle,'radial attachment-site angle'),...vector(b.direction,3,'bond direction'),finite(b.threshold??state.params.strength,'bond threshold')],i*BOND_STRIDE);
  bondBroken[i]=b.broken?1:0;
 });
 const meta={...(state.buddingConvention?{buddingConvention:shortString(state.buddingConvention,'budding convention',128)}:{}),seed:integer(state.seed,'seed',0,4294967295),params:{shape:finite(state.params.shape,'shape'),strength:finite(state.params.strength,'strength'),angle:finite(state.params.angle,'angle')},maxCells:integer(state.maxCells,'growth limit',1,MAX_CELLS),status:shortString(state.status,'status'),fault:state.fault==null?null:shortString(state.fault,'fault')};
 const frame={sequence:integer(sequence,'sequence'),kind:shortString(kind,'frame kind',64),tick:integer(state.tick,'growth tick'),relaxationTime:finite(state.relaxationTime,'accepted relaxation time'),cellIds,cells,bondEnds,bonds,bondBroken,meta};
 if(frame.relaxationTime<0)throw new RangeError('Negative accepted relaxation time');
 frame.byteLength=frameByteLength(frame);return frame;
}
export function unpackRenderState(frame){
 const cells=Array.from(frame.cellIds,(id,i)=>{const o=i*CELL_STRIDE;return {id,p:Array.from(frame.cells.slice(o,o+3)),q:Array.from(frame.cells.slice(o+3,o+7)),size:frame.cells[o+7],shape:frame.cells[o+8]};});
 const bonds=Array.from(frame.bondBroken,(broken,i)=>{const o=i*BOND_STRIDE;return {m:frame.bondEnds[2*i],d:frame.bondEnds[2*i+1],az:frame.bonds[o],angle:frame.bonds[o+1],direction:Array.from(frame.bonds.slice(o+2,o+5)),threshold:frame.bonds[o+5],broken:!!broken};});
 const parent=cells.map((_,i)=>i),root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 for(const b of bonds)if(!b.broken)parent[root(b.d)]=root(b.m);
 const groups=new Map();for(const c of cells){const r=root(c.id);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(c.id);}
 return {...clone(frame.meta),tick:frame.tick,relaxationTime:frame.relaxationTime,cells,bonds,fragments:[...groups.values()],broken:bonds.reduce((s,b)=>s+Number(b.broken),0),renderingOnly:true};
}
export function sameTopology(a,b){
 if(a.cellIds.length!==b.cellIds.length||a.bondBroken.length!==b.bondBroken.length)return false;
 return a.cellIds.every((x,i)=>x===b.cellIds[i])&&a.bondEnds.every((x,i)=>x===b.bondEnds[i])&&a.bondBroken.every((x,i)=>x===b.bondBroken[i]);
}

// Own the frames; append never mutates or evicts an older frame. A full archive
// stops CAPTURE only. The worker must continue pumping the original simulation.
export class ReplayHistory {
 constructor({captureId,runVersion=0,maxBytes=DEFAULT_HISTORY_BYTES,maxFrames=DEFAULT_HISTORY_FRAMES,modelVersion='unknown',startedAt=null}={}){
  if(typeof captureId!=='string'||!captureId||captureId.length>128)throw new TypeError('A bounded nonempty captureId is required');
  this.captureId=captureId;this.runVersion=integer(runVersion,'run version');this.maxBytes=integer(maxBytes,'memory budget',1);this.maxFrames=integer(maxFrames,'frame budget',1);this.modelVersion=String(modelVersion);this.startedAt=startedAt;this.frames=[];this.bytes=0;this.active=true;this.reason=null;
 }
 append(frame){
  if(!this.active)return false;
  const previous=this.frames.at(-1);if(previous&&(frame.tick<previous.tick||frame.relaxationTime<previous.relaxationTime))throw new RangeError('History cannot move backwards');
  const bytes=frameByteLength(frame);
  if(this.frames.length>=this.maxFrames||this.bytes+bytes>this.maxBytes){this.stop('Capture limit reached; simulation continues. Export or start a new capture.');return false;}
  frame.sequence=this.frames.length;frame.byteLength=bytes;this.frames.push(frame);this.bytes+=bytes;return true;
 }
 stop(reason='Capture stopped'){this.active=false;this.reason=reason;return this.status();}
 status(){const first=this.frames[0],last=this.frames.at(-1);return {captureId:this.captureId,runVersion:this.runVersion,active:this.active,reason:this.reason,frames:this.frames.length,bytes:this.bytes,maxBytes:this.maxBytes,maxFrames:this.maxFrames,firstTick:first?.tick??null,lastTick:last?.tick??null,firstRelaxationTime:first?.relaxationTime??null,lastRelaxationTime:last?.relaxationTime??null};}
 project(){return {schema:HISTORY_SCHEMA,formatVersion:HISTORY_VERSION,model:{version:this.modelVersion,coordinates:'physical model coordinates',time:'dimensionless accepted relaxation time; growth ticks are separate discrete updates',resumable:false},capture:{...this.status(),startedAt:this.startedAt},frames:[...this.frames]};}
}
const stamp=s=>({tick:s.tick,time:s.relaxationTime,cells:s.cells.length,bonds:s.bonds.length,broken:s.broken});
// Observe ONLY the authoritative Simulator after task.next(). This does not
// touch trials, hooks, RNG, force law, solver step, or generator control flow.
export class AcceptedStateRecorder {
 constructor(state,options={}){
  this.stride=options.stride??.288;if(!Number.isFinite(this.stride)||this.stride<=0)throw new RangeError('Positive relaxation sampling stride required');
  this.history=new ReplayHistory(options);this.previous=stamp(state);this.lastSaved=this.previous;this.pendingTick=null;
  this.history.append(packRenderState(state,{kind:'initial'}));
 }
 observe(state,{completed=false,final=false}={}){
  if(!this.history.active)return false;
  const now=stamp(state),before=this.previous;
  if(now.tick<before.tick||now.time<before.time||now.cells<before.cells||now.bonds<before.bonds||now.broken<before.broken){this.history.stop('Run changed; start a new capture');return false;}
  const topology=now.cells!==before.cells||now.bonds!==before.bonds||now.broken!==before.broken;
  if(now.tick!==before.tick)this.pendingTick=now.tick;
  const accepted=now.time>before.time,growth=this.pendingTick!==null&&(accepted||completed),elapsed=now.time-this.lastSaved.time;
  const changed=now.time!==this.lastSaved.time||now.tick!==this.lastSaved.tick||now.cells!==this.lastSaved.cells||now.bonds!==this.lastSaved.bonds||now.broken!==this.lastSaved.broken;
  this.previous=now;
  const kind=topology?'topology':growth?'growth':accepted&&elapsed>=this.stride-Math.min(1e-12,this.stride*1e-9)?'relaxation':final&&changed?'final':null;
  if(!kind)return false;
  const stored=this.history.append(packRenderState(state,{kind}));
  if(stored){this.lastSaved=now;if(topology||growth)this.pendingTick=null;}
  return stored;
 }
 stop(state,reason='Capture stopped'){this.observe(state,{final:true,completed:true});return this.history.stop(this.history.reason??reason);}
}

// Default clock: successive saved events at one tick get ordered display slots
// within that tick. These fractions are presentation positions, NOT growth time.
// Model-time clock: duplicate timestamps are instantaneous; latest event wins.
export function timelineSchedule(frames,{clock='tick'}={}){
 if(!['tick','relaxationTime'].includes(clock))throw new RangeError('Unknown timeline clock');
 const positions=frames.map(f=>finite(f[clock],'frame clock'));
 for(let i=1;i<positions.length;i++)if(positions[i]<positions[i-1])throw new RangeError('Non-monotonic timeline');
 if(clock==='tick')for(let i=0;i<frames.length;){let end=i+1;while(end<frames.length&&frames[end].tick===frames[i].tick)end++;const count=end-i;for(let j=i;j<end;j++)positions[j]=frames[i].tick+(j-i)/count;i=end;}
 const start=positions[0]??0,end=positions.at(-1)??start;
 return {frames,clock,positions,start,end,span:end-start,semantics:clock==='tick'?'Growth tick with ordered same-tick display slots; not calibrated physical time':'Accepted dimensionless relaxation time; equal-time events have zero duration'};
}
export function sampleTimeline(schedule,position){
 if(!schedule.frames.length)return null;const t=clamp01(position);
 if(t===0)return {index:0,frame:schedule.frames[0],position:t};if(t===1)return {index:schedule.frames.length-1,frame:schedule.frames.at(-1),position:t};
 const value=schedule.start+t*schedule.span;let lo=0,hi=schedule.positions.length;
 while(lo<hi){const mid=(lo+hi)>>>1;// Allow only rounding error from mapping an exact saved-state timestamp to movie time and back.
 const tolerance=4*Number.EPSILON*Math.max(1,Math.abs(value),Math.abs(schedule.positions[mid]));if(schedule.positions[mid]<=value+tolerance)lo=mid+1;else hi=mid;}
 const index=Math.max(0,lo-1);return {index,frame:schedule.frames[index],position:t};
}
export function positionForFrame(schedule,index){integer(index,'frame index',0,schedule.frames.length-1);return schedule.span?(schedule.positions[index]-schedule.start)/schedule.span:0;}
// Feed frames to an OFFSCREEN export surface; do not set a live editor's state.
// Uniform timestamps make export duration/speed independent of solver wall time.
export function* fixedRateSamples(schedule,{durationSeconds=12,fps=30}={}){
 if(!schedule.frames.length)throw new RangeError('No captured states to export');
 finite(durationSeconds,'duration');finite(fps,'fps');if(durationSeconds<=0||durationSeconds>600||!Number.isInteger(fps)||fps<1||fps>120)throw new RangeError('Invalid export duration or frame rate');
 const count=Math.max(2,Math.round(durationSeconds*fps));for(let i=0;i<count;i++){const position=i/(count-1);yield {...sampleTimeline(schedule,position),outputIndex:i,timestampMicroseconds:Math.round(i*1e6/fps),durationMicroseconds:Math.round((i+1)*1e6/fps)-Math.round(i*1e6/fps),position};}
}

const add=(a,b)=>a.map((v,i)=>v+b[i]),sub=(a,b)=>a.map((v,i)=>v-b[i]),mul=(a,n)=>a.map(v=>v*n),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),norm=a=>Math.hypot(...a),unit=a=>mul(a,1/norm(a)),lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
function directionMix(a,b,t){let cosine=Math.max(-1,Math.min(1,dot(a,b)));if(cosine>.9995)return unit(lerp(a,b,t));if(cosine<-.9995){const ref=Math.abs(a[0])<.8?[1,0,0]:[0,1,0],ortho=unit(sub(ref,mul(a,dot(a,ref))));return add(mul(a,Math.cos(Math.PI*t)),mul(ortho,Math.sin(Math.PI*t)));}const theta=Math.acos(cosine),sin=Math.sin(theta);return add(mul(a,Math.sin((1-t)*theta)/sin),mul(b,Math.sin(t*theta)/sin));}
export function validateCameraKey(key){
 const at=clamp01(key.at),position=vector(key.position,3,'camera position'),target=vector(key.target,3,'camera target'),up=vector(key.up??[0,0,1],3,'camera up'),fov=finite(key.fov??38,'camera fov');
 if(norm(sub(position,target))<1e-6||norm(up)<1e-6||fov<=0||fov>=180)throw new RangeError('Invalid camera pose');return {at,position,target,up:unit(up),fov};
}
export function sampleCameraKeys(keys,position,fallback=null){
 if(!keys.length)return fallback?validateCameraKey({...fallback,at:position}):null;
 const t=clamp01(position),ordered=keys.map(validateCameraKey).sort((a,b)=>a.at-b.at);let left=ordered[0],right=ordered.at(-1);
 if(t<left.at)return {...clone(left),at:t};for(const key of ordered){if(key.at<=t)left=key;else{right=key;break;}}
 if(t>=ordered.at(-1).at||right.at<=left.at)return {...clone(left),at:t};const u=(t-left.at)/(right.at-left.at),target=lerp(left.target,right.target,u),a=sub(left.position,left.target),b=sub(right.position,right.target),distance=Math.exp(Math.log(norm(a))*(1-u)+Math.log(norm(b))*u),direction=directionMix(unit(a),unit(b),u);
 return {at:t,position:add(target,mul(direction,distance)),target,up:directionMix(left.up,right.up,u),fov:left.fov+(right.fov-left.fov)*u};
}

const ARRAY_FIELDS=['cellIds','cells','bondEnds','bonds','bondBroken'];
// Iterator avoids making one huge object full of boxed numeric arrays before
// serialization. Blob creation still needs extra browser memory beyond capture.
export function* projectJSONChunks(project){
 const {frames,...head}=project;yield JSON.stringify(head).slice(0,-1)+',"frames":[';
 for(let i=0;i<frames.length;i++){if(i)yield ',';const frame={...frames[i]};for(const field of ARRAY_FIELDS)frame[field]=Array.from(frame[field]);yield JSON.stringify(frame);}yield ']}';
}
export function parseProjectJSON(text,{maxBytes=DEFAULT_HISTORY_BYTES,maxFrames=DEFAULT_HISTORY_FRAMES,maxTextChars=256*1024*1024}={}){
 if(typeof text!=='string'||text.length>maxTextChars)throw new RangeError('Capture JSON is too large');return validateProject(JSON.parse(text),{maxBytes,maxFrames});
}
export function validateProject(project,{maxBytes=DEFAULT_HISTORY_BYTES,maxFrames=DEFAULT_HISTORY_FRAMES}={}){
 if(project?.schema!==HISTORY_SCHEMA||project.formatVersion!==HISTORY_VERSION||!Array.isArray(project.frames)||project.frames.length>maxFrames)throw new TypeError('Unsupported capture project');
 let bytes=0,previous=null;const frames=[];
 for(let index=0;index<project.frames.length;index++){
  const f=project.frames[index];if(!f||!f.meta)throw new TypeError('Invalid captured frame');
  const n=integer(f.cellIds?.length,'cell count',1,MAX_CELLS),m=integer(f.bondBroken?.length,'bond count',0,MAX_BONDS);
  if(f.cells?.length!==n*CELL_STRIDE||f.bondEnds?.length!==m*2||f.bonds?.length!==m*BOND_STRIDE)throw new TypeError('Invalid frame buffer length');
  for(const field of ARRAY_FIELDS)if(!Array.isArray(f[field])&&!ArrayBuffer.isView(f[field]))throw new TypeError('Invalid frame array');
  for(const id of f.cellIds)integer(id,'cell ID',0,MAX_CELLS-1);for(const id of f.bondEnds)integer(id,'bond endpoint',0,n-1);for(const broken of f.bondBroken)integer(broken,'bond broken flag',0,1);
  const frame={...f,cellIds:new Uint32Array(f.cellIds),cells:new Float64Array(f.cells),bondEnds:new Uint32Array(f.bondEnds),bonds:new Float64Array(f.bonds),bondBroken:new Uint8Array(f.bondBroken)};
  if(frame.cellIds.some((id,i)=>id!==i))throw new RangeError('Incompatible cell identity');
  // Decode/repack validates finite values and records only documented fields.
  const checked=packRenderState(unpackRenderState(frame),{sequence:index,kind:String(f.kind??'imported')});
  if(previous&&(checked.tick<previous.tick||checked.relaxationTime<previous.relaxationTime))throw new RangeError('Non-monotonic capture');
  bytes+=checked.byteLength;if(bytes>maxBytes)throw new RangeError('Capture exceeds memory budget');frames.push(checked);previous=checked;
 }
 const capture=project.capture??{},model=project.model??{};
 return {schema:HISTORY_SCHEMA,formatVersion:HISTORY_VERSION,model:{version:shortString(model.version,'model version',256),coordinates:'physical model coordinates',time:'dimensionless accepted relaxation time; growth ticks are separate discrete updates',resumable:false},capture:{captureId:shortString(capture.captureId,'capture ID',128),runVersion:integer(capture.runVersion??0,'run version'),startedAt:capture.startedAt==null?null:shortString(capture.startedAt,'capture date',64),reason:capture.reason==null?null:shortString(capture.reason,'capture reason'),frames:frames.length,bytes,active:false,maxBytes,maxFrames,firstTick:frames[0]?.tick??null,lastTick:frames.at(-1)?.tick??null,firstRelaxationTime:frames[0]?.relaxationTime??null,lastRelaxationTime:frames.at(-1)?.relaxationTime??null},frames};
}
