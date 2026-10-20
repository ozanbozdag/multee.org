// Presentation-only, qualitative bounded random jiggle. This is not a calibrated
// Brownian diffusion model. Never feed its output back to mechanics or strain.
const add=(a,b)=>a.map((v,i)=>v+b[i]), sub=(a,b)=>a.map((v,i)=>v-b[i]), mul=(a,s)=>a.map(v=>v*s);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0), norm=a=>Math.hypot(...a);
const unit=a=>mul(a,1/(norm(a)||1));
const qm=(a,b)=>[a[0]*b[0]-dot(a.slice(1),b.slice(1)),...add(add(mul(b.slice(1),a[0]),mul(a.slice(1),b[0])),cross(a.slice(1),b.slice(1)))];
const inverse=q=>[q[0],-q[1],-q[2],-q[3]];
const rotate=(q,v)=>add(v,mul(cross(q.slice(1),add(cross(q.slice(1),v),mul(v,q[0]))),2));
const quaternion=v=>{const a=norm(v);return a<1e-14?[1,0,0,0]:[Math.cos(a/2),...mul(v,Math.sin(a/2)/a)];};
const bound=(v,max)=>norm(v)>max?mul(v,max/norm(v)):v;
const centroid=cells=>mul(cells.reduce((s,c)=>add(s,c.p),[0,0,0]),1/cells.length);
function mix(seed,id){let x=(seed^Math.imul((id+1)>>>0,0x9e3779b9)^0xb5297a4d)>>>0;x=Math.imul(x^(x>>>16),0x7feb352d);x=Math.imul(x^(x>>>15),0x846ca68b);return(x^(x>>>16))>>>0;}
function uniform(group){let t=group.rng=(group.rng+0x6d2b79f5)>>>0;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;}
function normal(group){return Math.sqrt(-2*Math.log(Math.max(1e-12,uniform(group))))*Math.cos(2*Math.PI*uniform(group));}
function ou(previous,amplitude,tau,h,group){const decay=Math.exp(-h/tau),sigma=amplitude*Math.sqrt(1-decay*decay);return bound(previous.map(v=>decay*v+sigma*normal(group)),3*amplitude);}

export class BrownianPresentation {
 constructor({seed=1,step=1/60,maxCatchup=.1,translation=.12,rotation=.08}={}){
  if(![step,maxCatchup,translation,rotation].every(Number.isFinite)||step<=0||maxCatchup<step||translation<0||rotation<0)throw new RangeError('Invalid visual motion settings');
  this.step=step;this.maxCatchup=maxCatchup;this.translation=translation;this.rotation=rotation;this.reset(seed);
 }
 reset(seed=this.seed){this.seed=seed>>>0;this.groups=new Map();this.owner=new Map();this.remainder=0;this.steps=0;this.projected=null;this.projectionVersion=0;}
 update(state){
  if(state.seed!==undefined&&(state.seed>>>0)!==this.seed)this.reset(state.seed);
  const cells=new Map(state.cells.map(c=>[c.id,c])),previous=this.groups,oldOwner=this.owner,next=new Map(),owner=new Map();
  for(const ids of [...state.fragments].sort((a,b)=>Math.min(...a)-Math.min(...b))){
   if(!ids.length)continue;const root=Math.min(...ids);let group=previous.get(root);
   if(!group){
    // An actual split always contains an old member. A wholly new fragment starts
    // at identity; ordinary newborns belong to their mother's existing group.
    const oldId=ids.find(id=>oldOwner.has(id)),parent=oldId===undefined?null:previous.get(oldOwner.get(oldId));
    group={root,q:parent?[...parent.q]:[1,0,0,0],t:parent?[...parent.t]:[0,0,0],positionNoise:[0,0,0],rotationNoise:[0,0,0],noiseQ:[1,0,0,0],rng:mix(this.seed,root)};
   }
   group.size=ids.length;group.center=centroid(ids.map(id=>cells.get(id)));next.set(root,group);for(const id of ids)owner.set(id,root);
  }
  this.groups=next;this.owner=owner;this.projectionVersion++;
 }
 advance(dt,active=true){
  if(!active)return false;if(!Number.isFinite(dt)||dt<0)throw new RangeError('Visual timestep must be finite and nonnegative');
  this.remainder+=Math.min(dt,this.maxCatchup);const count=Math.floor((this.remainder+1e-12)/this.step);this.remainder=Math.max(0,this.remainder-count*this.step);
  for(let k=0;k<count;k++)for(const group of this.groups.values()){
   // Size laws are illustrative only, not a hydrodynamic/Stokes-Einstein model.
   const scale=Math.cbrt(group.size),p=ou(group.positionNoise,this.translation/scale,.9,this.step,group),r=ou(group.rotationNoise,this.rotation/scale,1.4,this.step,group),q=quaternion(r),dq=unit(qm(q,inverse(group.noiseQ)));
   const pivot=add(rotate(group.q,group.center),group.t);
   group.q=unit(qm(dq,group.q));
   group.t=add(add(pivot,rotate(dq,sub(group.t,pivot))),sub(p,group.positionNoise));
   group.positionNoise=p;group.rotationNoise=r;group.noiseQ=q;
  }
  this.steps+=count;return count>0;
 }
 // Conservative CURRENT world-space displacement bound, including rotation of
 // cell surfaces. Pass the longest semi-axis: c => axes(c).a. Fit the unjittered
 // scene with a retained/fixed margin; do not chase this value every frame.
 displayPadding(state,radiusOf){
  if(typeof radiusOf!=='function')throw new TypeError('Provide a cell bounding-radius function');this.display(state,true);const{centerMoves,surfaceFactors}=this.projected;let padding=0;for(let i=0;i<state.cells.length;i++)padding=Math.max(padding,centerMoves[i]+radiusOf(state.cells[i])*surfaceFactors[i]);return padding;
 }
 display(state,enabled=true){
  if(!enabled)return state;
  if(this.projected?.source===state&&this.projected.steps===this.steps&&this.projected.version===this.projectionVersion)return this.projected.displayed;
  const transforms=new Map();for(const [root,g]of this.groups){const[w,x,y,z]=g.q;transforms.set(root,{q:g.q,t:g.t,r:[1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y),2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x),2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)],surfaceFactor:2*Math.sqrt(Math.max(0,1-w*w))});}
  const centerMoves=new Float64Array(state.cells.length),surfaceFactors=new Float64Array(state.cells.length);
  const cells=state.cells.map((cell,i)=>{const g=transforms.get(this.owner.get(cell.id));if(!g)return cell;const[x,y,z]=cell.p,r=g.r,t=g.t,p=[r[0]*x+r[1]*y+r[2]*z+t[0],r[3]*x+r[4]*y+r[5]*z+t[1],r[6]*x+r[7]*y+r[8]*z+t[2]],[a,b,c,d]=g.q,[e,f,h,j]=cell.q;
   const q=[a*e-b*f-c*h-d*j,a*f+b*e+c*j-d*h,a*h-b*j+c*e+d*f,a*j+b*h-c*f+d*e],inverse=1/Math.hypot(...q);q[0]*=inverse;q[1]*=inverse;q[2]*=inverse;q[3]*=inverse;
   centerMoves[i]=Math.hypot(p[0]-x,p[1]-y,p[2]-z);surfaceFactors[i]=g.surfaceFactor;return{...cell,p,q};});
  const displayed={...state,cells};this.projected={source:state,displayed,steps:this.steps,version:this.projectionVersion,centerMoves,surfaceFactors};return displayed;
 }
}
