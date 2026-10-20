// Dimensionless exploratory model. No biology calibration or dependencies.
export const V = {
  add:(a,b)=>a.length===3?[a[0]+b[0],a[1]+b[1],a[2]+b[2]]:a.map((x,i)=>x+b[i]), sub:(a,b)=>a.length===3?[a[0]-b[0],a[1]-b[1],a[2]-b[2]]:a.map((x,i)=>x-b[i]),
  mul:(a,s)=>a.length===3?[a[0]*s,a[1]*s,a[2]*s]:a.length===4?[a[0]*s,a[1]*s,a[2]*s,a[3]*s]:a.map(x=>x*s), dot:(a,b)=>a.length===3?0+a[0]*b[0]+a[1]*b[1]+a[2]*b[2]:a.reduce((s,x,i)=>s+x*b[i],0),
  cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],
  norm:a=>Math.hypot(...a), unit:a=>V.mul(a,1/(V.norm(a)||1))
};
const {add,sub,mul,dot,cross,norm,unit}=V;
const Z=[0,0,1], clamp=(x,l,h)=>Math.max(l,Math.min(h,x));
export const C=Object.freeze({cap:64,maxCap:1024,neck:.25,spring:4,bend:.3,
  contact:60,dt:.006,referenceDt:.006,overlapTolerance:.035,motionTolerance:.0015,steps:24,
  solverMaxStep:.006,solverMinStep:1e-6,solverTolerance:1e-4,solverRelative:.002,solverMaxTrials:2048,
  growth:.007,birth:.23,interval:48,ringAxialFraction:.9,
  plasticYield:12*Math.PI/180,plasticCapacity:25*Math.PI/180,plasticRate:1});
const qm=(a,b)=>[a[0]*b[0]-(0+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]),(b[1]*a[0]+a[1]*b[0])+(a[2]*b[3]-a[3]*b[2]),(b[2]*a[0]+a[2]*b[0])+(a[3]*b[1]-a[1]*b[3]),(b[3]*a[0]+a[3]*b[0])+(a[1]*b[2]-a[2]*b[1])];
// Scalar expansion preserves operation order while avoiding temporary vectors.
export const rotate=(q,v)=>{const x=(q[2]*v[2]-q[3]*v[1])+v[0]*q[0],y=(q[3]*v[0]-q[1]*v[2])+v[1]*q[0],z=(q[1]*v[1]-q[2]*v[0])+v[2]*q[0];return [v[0]+(q[2]*z-q[3]*y)*2,v[1]+(q[3]*x-q[1]*z)*2,v[2]+(q[1]*y-q[2]*x)*2];};
export function axisQuaternion(u){const n=unit(u);return n[2]<-.999999?[0,1,0,0]:unit([1+n[2],-n[1],n[0],0]);}
function turn(q,w){const a=norm(w);return a<1e-14?q:unit(qm([Math.cos(a/2),...mul(w,Math.sin(a/2)/a)],q));}
export function cell(id,p=[0,0,0],u=Z,size=1,shape=1.8){return {id,p:[...p],q:axisQuaternion(u),size,shape,age:0,next:C.interval,scars:[],hasBudded:false};}
export function axes(c){const b=c.size/Math.cbrt(c.shape);return {a:b*c.shape,b,u:rotate(c.q,Z)};}
export function site(c,azimuth,angle=25){const {a,b}=axes(c),t=angle*Math.PI/180;
  const u=[Math.sin(t)*Math.cos(azimuth),Math.sin(t)*Math.sin(azimuth),Math.cos(t)];
  return rotate(c.q,mul(u,1/Math.sqrt(Math.sin(t)**2/b**2+Math.cos(t)**2/a**2)));}
// Growth angle is the initial daughter axis relative to the mother's distal axis.
// Attachment location is separate; b.angle retains the radial-site convention so
// previously saved bonds and replay frames preserve their literal old geometry.
export function budDirection(c,azimuth,angle){const t=angle*Math.PI/180;
  return unit([Math.sin(t)*Math.cos(azimuth),Math.sin(t)*Math.sin(azimuth),Math.cos(t)]);}
export function ringSiteAngle(c){return Math.atan2(Math.sqrt(1-C.ringAxialFraction**2),C.ringAxialFraction*c.shape)*180/Math.PI;}
function base(c){return mul(rotate(c.q,Z),-axes(c).a);}
function matrix(c,g=axes(c)){const {a,b,u}=g,v=a*a-b*b;return [b*b+v*u[0]*u[0],v*u[0]*u[1],v*u[0]*u[2],b*b+v*u[1]*u[1],v*u[1]*u[2],b*b+v*u[2]*u[2]];}
function mv(m,v){return [m[0]*v[0]+m[1]*v[1]+m[2]*v[2],m[1]*v[0]+m[3]*v[1]+m[4]*v[2],m[2]*v[0]+m[4]*v[1]+m[5]*v[2]];}
function solve(m,v){const [a,b,c,d,e,f]=m,A=d*f-e*e,B=c*e-b*f,D=a*f-c*c,E=b*c-a*e,F=a*d-b*b,G=b*e-c*d;
  return mul(mv([A,B,G,D,E,F],v),1/(a*A+b*B+c*G));}
// Same arithmetic/order as solve + dot, without 44 temporary matrices/vectors per pair.
function pwValue(A,B,d,t,direction=false){
  const u=1-t,m0=u*A[0]+t*B[0],m1=u*A[1]+t*B[1],m2=u*A[2]+t*B[2],m3=u*A[3]+t*B[3],m4=u*A[4]+t*B[4],m5=u*A[5]+t*B[5];
  const c0=m3*m5-m4*m4,c1=m2*m4-m1*m5,c3=m0*m5-m2*m2,c4=m1*m2-m0*m4,c5=m0*m3-m1*m1,c2=m1*m4-m2*m3;
  const inv=1/(m0*c0+m1*c1+m2*c2),x=(c0*d[0]+c1*d[1]+c2*d[2])*inv,y=(c1*d[0]+c3*d[1]+c4*d[2])*inv,z=(c2*d[0]+c4*d[1]+c5*d[2])*inv;
  const f=t*(1-t)*(0+d[0]*x+d[1]*y+d[2]*z);
  return direction?{f,v:[x,y,z]}:f;
}
function support(m,n){const v=mv(m,n);return mul(v,1/Math.sqrt(dot(n,v)));}
// Perram–Wertheim contact scalar; bounding spheres only reject distant pairs.
// Penalty depth/normal are approximate; the oriented overlap classification is not spherical.
export function contact(a,b,ga=null,gb=null){
  const d=sub(b.p,a.p),dist=norm(d),aa=ga?ga.a:axes(a).a,ab=gb?gb.a:axes(b).a;
  if(dist>=aa+ab)return null;
  const A=ga?ga.Q:matrix(a),B=gb?gb.Q:matrix(b);
  const value=t=>pwValue(A,B,d,t);
  let lo=0,hi=1;
  for(let k=0;k<22;k++){const l=lo+(hi-lo)/3,r=hi-(hi-lo)/3;if(value(l)<value(r))lo=l;else hi=r;}
  const {f,v}=pwValue(A,B,d,(lo+hi)/2,true);
  if(f>=1)return null;
  const n=dist<1e-10?[1,0,0]:unit(v),ra=support(A,n),rb=mul(support(B,n),-1);
  const point=mul(add(d,add(ra,rb)),.5); // Shared midpoint gives zero net internal contact torque.
  return {n,ra:point,rb:sub(point,d),depth:Math.max(0,dot(sub(ra,rb),n)-dot(d,n)),f};
}
// A grid of enclosing-sphere diameters cannot omit an overlapping pair.
// Sorted j indices preserve the original i,j force accumulation order exactly.
export function contactPairs(cells){
  const geometry=cells.map(c=>{const g=axes(c);return {a:g.a,Q:matrix(c,g)};});
  const width=2*Math.max(1e-12,...geometry.map(g=>g.a)),bins=new Map();
  const coordinates=cells.map(c=>c.p.map(x=>Math.floor(x/width)));
  coordinates.forEach((p,i)=>{const key=p.join(',');if(!bins.has(key))bins.set(key,[]);bins.get(key).push(i);});
  const neighborsByBin=new Map();
  for(const [key] of bins){
    const [x,y,z]=key.split(',').map(Number),neighbors=[];
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
      const bucket=bins.get(`${x+dx},${y+dy},${z+dz}`);
      if(bucket)for(const j of bucket)neighbors.push(j);
    }
    neighbors.sort((a,b)=>a-b);neighborsByBin.set(key,neighbors);
  }
  const pairs=[];
  for(let i=0;i<cells.length;i++)for(const j of neighborsByBin.get(coordinates[i].join(',')))if(j>i){
    const p=cells[i].p,q=cells[j].p,r=geometry[i].a+geometry[j].a;
    if(Math.abs(q[0]-p[0])<r&&Math.abs(q[1]-p[1])<r&&Math.abs(q[2]-p[2])<r)pairs.push([i,j]);
  }
  return {pairs,geometry};
}
export function bondGeometry(b,cells){const m=cells[b.m],d=cells[b.d],rm=site(m,b.az,b.angle),rd=base(d),delta=sub(add(d.p,rd),add(m.p,rm)),length=norm(delta);
  return {rm,rd,delta,length,n:length>1e-12?mul(delta,1/length):rotate(m.q,b.direction),strain:Math.max(0,length/C.neck-1),target:rotate(m.q,b.restDirection??b.direction)};}
// Finite angular viscoplastic accommodation; axial rest length never changes.
// The accumulated plastic rotation is bounded, including during reversed loading.
export function updatePlasticity(b,cells,dt=C.dt){
  if(!Number.isFinite(dt)||dt<0)throw new RangeError('Plastic timestep must be finite and nonnegative');
  if(b.broken||dt===0)return 0;
  const used=b.plasticRotation??0,remaining=Math.max(0,C.plasticCapacity-used);
  if(remaining===0)return 0;
  const m=cells[b.m],d=cells[b.d],rest=b.restDirection??b.direction;
  const local=rotate([m.q[0],-m.q[1],-m.q[2],-m.q[3]],rotate(d.q,Z));
  const cosine=clamp(dot(rest,local),-1,1),angle=Math.acos(cosine);
  const step=Math.min(remaining,Math.max(0,angle-C.plasticYield)*(-Math.expm1(-C.plasticRate*dt)));
  if(step<1e-14)return 0;
  let tangent=sub(local,mul(rest,cosine));
  if(norm(tangent)<1e-10){const ref=Math.abs(rest[0])<.9?[1,0,0]:[0,1,0];tangent=sub(ref,mul(rest,dot(ref,rest)));}
  b.restDirection=unit(add(mul(rest,Math.cos(step)),mul(unit(tangent),Math.sin(step))));
  b.plasticRotation=Math.min(C.plasticCapacity,used+step);
  return step;
}
// Overdamped rates from the unchanged spring, bending and contact force laws.
export function mechanics(cells,bonds){
  const forces=cells.map(()=>[0,0,0]),torques=cells.map(()=>[0,0,0]);
  const apply=(i,f,r)=>{const F=forces[i],T=torques[i];F[0]+=f[0];F[1]+=f[1];F[2]+=f[2];T[0]+=r[1]*f[2]-r[2]*f[1];T[1]+=r[2]*f[0]-r[0]*f[2];T[2]+=r[0]*f[1]-r[1]*f[0];};
  for(const b of bonds)if(!b.broken){const g=bondGeometry(b,cells),f=mul(g.n,C.spring*(g.length-C.neck));
    apply(b.m,f,g.rm);apply(b.d,mul(f,-1),g.rd);
    const t=mul(cross(rotate(cells[b.d].q,Z),g.target),C.bend);
    torques[b.d]=add(torques[b.d],t);torques[b.m]=sub(torques[b.m],t);
  }
  const {pairs,geometry}=contactPairs(cells);let overlap=0;
  for(const [i,j] of pairs){const h=contact(cells[i],cells[j],geometry[i],geometry[j]);if(h){overlap=Math.max(overlap,h.depth);const f=mul(h.n,C.contact*h.depth);apply(i,mul(f,-1),h.ra);apply(j,f,h.rb);}}
  const angular=torques.map((t,i)=>mul(t,1/Math.max(.2,geometry[i].a**2)));
  const rate=Math.max(0,...forces.map(norm),...angular.map(norm));
  return {linear:forces,angular,rate,overlap};
}
// Trial states are private: rejected trials cannot fracture bonds or flow plastically.
function eulerTrial(cells,bonds,flow,h,strength){
  const next=cells.map((c,i)=>({...c,p:add(c.p,mul(flow.linear[i],h)),q:turn(c.q,mul(flow.angular[i],h))}));
  if(next.some(c=>![...c.p,...c.q].every(Number.isFinite)||norm(c.p)>1e5))return null;
  const links=bonds.map(b=>({...b,restDirection:[...(b.restDirection??b.direction)]}));let broken=0;
  for(const b of links)if(!b.broken){b.strain=bondGeometry(b,next).strain;if(b.strain>(b.threshold??strength)){b.broken=true;broken++;}}
  for(const b of links)updatePlasticity(b,next,h);
  return {cells:next,bonds:links,broken};
}
function trialError(coarse,fine,start){
  let error=0,scale=0,topology=true;
  for(let i=0;i<fine.cells.length;i++){
    const a=coarse.cells[i],b=fine.cells[i],c=start[i];
    error=Math.max(error,norm(sub(a.p,b.p)),2*Math.min(norm(sub(a.q,b.q)),norm(add(a.q,b.q))));
    scale=Math.max(scale,norm(sub(b.p,c.p)),2*Math.min(norm(sub(b.q,c.q)),norm(add(b.q,c.q))));
  }
  for(let i=0;i<fine.bonds.length;i++){
    const a=coarse.bonds[i],b=fine.bonds[i];if(a.broken!==b.broken)topology=false;
    if(!a.broken&&!b.broken)error=Math.max(error,norm(sub(a.restDirection,b.restDirection)),Math.abs((a.plasticRotation??0)-(b.plasticRotation??0)));
  }
  return {error,limit:C.solverTolerance+C.solverRelative*scale,topology};
}
export class Simulator {
  constructor({seed=1,shape=1.8,strength=1,angle=25,maxCells=C.cap}={}){
    if(![seed,shape,strength,angle].every(Number.isFinite))throw Error('Parameters must be finite');
    this.buddingConvention='daughter-axis-fixed-ring-0.9-v1';
    this.params={shape:clamp(shape,1,3),strength:clamp(strength,.05,2),angle:clamp(angle,0,90)};
    this.rng=seed>>>0;this.seed=this.rng;this.cells=[cell(0,[0,0,0],Z,1,this.params.shape)];this.bonds=[];
    this.tick=0;this.broken=0;this.wait=0;this.status='ready';this.maxOverlap=0;this.maxStrain=0;this.motion=0;this.residual=0;this.relaxationTime=0;this.solverStep=C.solverMaxStep;this.solver={accepted:0,rejected:0,elapsed:0,minStep:0,maxError:0};this.fault=null;
    this.setGrowthLimit(maxCells);
  }
  setGrowthLimit(maxCells){
    if(!Number.isInteger(maxCells)||maxCells<1||maxCells>C.maxCap)throw new RangeError(`Growth limit must be an integer from 1 to ${C.maxCap}`);
    this.maxCells=maxCells;
    if(!this.fault&&this.status.startsWith('cell cap')&&this.cells.length<maxCells)this.status='ready to continue; press Run';
    return this.maxCells;
  }
  random(){let t=this.rng+=0x6D2B79F5;this.rng>>>=0;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;}
  bud(m){
    if(this.cells.length>=this.maxCells)return null;
    // Permanent per-cell reproductive history; legacy records include broken links.
    const first=!(m.hasBudded??(m.scars.length>0||this.bonds.some(b=>b.m===m.id)));
    let az,available=first;const growthAngle=first?0:this.params.angle,angle=first?0:ringSiteAngle(m);
    if(first)az=this.random()*2*Math.PI; // One draw retained; azimuth is immaterial at the pole.
    else for(let attempt=0;attempt<16;attempt++){az=this.random()*2*Math.PI;
      if(m.scars.every(old=>Math.abs(Math.atan2(Math.sin(az-old),Math.cos(az-old)))>.18)){available=true;break;}}
    if(!available)return null; // Occupied ring scars remain after fracture.
    if(!first)m.scars.push(az); // The polar scar does not exclude a ring azimuth.
    m.hasBudded=true;
    const direction=budDirection(m,az,growthAngle);
    const d=cell(this.cells.length,[0,0,0],Z,C.birth,this.params.shape);
    // Compose in the maternal frame: local directions have z>=0, avoiding the
    // approximate world-antipodal branch of axisQuaternion for rotated mothers.
    d.q=unit(qm(m.q,axisQuaternion(direction)));const u=rotate(d.q,Z);
    d.p=add(add(m.p,site(m,az,angle)),mul(u,axes(d).a+C.neck));
    this.cells.push(d);this.bonds.push({m:m.id,d:d.id,az,angle,growthAngle,firstBud:first,direction,restDirection:[...direction],plasticRotation:0,broken:false,strain:0});
    return d;
  }
  fragments(){const parent=this.cells.map((_,i)=>i),root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
    for(const b of this.bonds)if(!b.broken)parent[root(b.d)]=root(b.m);
    const groups=new Map();for(const c of this.cells){const r=root(c.id);if(!groups.has(r))groups.set(r,[]);groups.get(r).push(c.id);}return [...groups.values()];
  }
  breakOverstrained(){const newly=[];let count=0;this.maxStrain=0;for(const b of this.bonds)if(!b.broken){b.strain=bondGeometry(b,this.cells).strain;
    if(b.strain>(b.threshold??this.params.strength)){b.broken=true;this.broken++;count++;newly.push(this.bonds.indexOf(b));}else this.maxStrain=Math.max(this.maxStrain,b.strain);}if(newly.length)this.onFracture?.(newly);return count;}
  measure(){const {pairs,geometry}=contactPairs(this.cells);let max=0;for(const [i,j] of pairs)max=Math.max(max,contact(this.cells[i],this.cells[j],geometry[i],geometry[j])?.depth||0);this.maxOverlap=max;return max;}
  relax(steps=C.steps){for(const _ of this.relaxSteps(steps)){} }
  *relaxSteps(steps=C.steps){
    if(this.fault)return;
    if(!Number.isInteger(steps)||steps<0)throw new RangeError('Relaxation steps must be a nonnegative integer');
    const budget=steps*C.dt;let elapsed=0,flow=null,trials=0;
    const stats={accepted:0,rejected:0,elapsed:0,minStep:0,maxError:0};this.solver=stats;
    this.breakOverstrained();
    while(elapsed<budget-1e-12){
      if(++trials>C.solverMaxTrials*Math.max(1,Math.ceil(steps/C.steps))){this.fault='Solver work limit: unresolved mechanics; finite state retained';this.status='fault';return;}
      if(!flow){flow=mechanics(this.cells,this.bonds);yield;}
      let h=Math.min(this.solverStep,C.solverMaxStep,budget-elapsed,.025/(flow.rate||1));
      const floor=Math.min(C.solverMinStep,budget-elapsed);
      if(!Number.isFinite(flow.rate)||h<floor){this.fault='Solver minimum step: unresolved mechanics; finite state retained';this.status='fault';return;}
      const coarse=eulerTrial(this.cells,this.bonds,flow,h,this.params.strength),half=eulerTrial(this.cells,this.bonds,flow,h/2,this.params.strength);
      let fine=null,check={error:Infinity,limit:C.solverTolerance,topology:false};
      if(coarse&&half){const middle=mechanics(half.cells,half.bonds);yield;
        if(Number.isFinite(middle.rate)&&middle.rate*h/2<=.025){fine=eulerTrial(half.cells,half.bonds,middle,h/2,this.params.strength);if(fine)check=trialError(coarse,fine,this.cells);}
      }
      if(!fine||!check.topology||check.error>check.limit){
        stats.rejected++;if(h<=floor*(1+1e-12)){this.fault='Solver tolerance unresolved at minimum step; finite state retained';this.status='fault';return;}
        this.solverStep=Math.max(floor,h*Math.max(.2,Math.min(.5,.8*Math.sqrt(check.limit/(check.error||1)))));yield;continue;
      }
      const newly=this.onFracture?fine.bonds.flatMap((b,i)=>b.broken&&!this.bonds[i].broken?[i]:[]):[];
      fine.cells.forEach((c,i)=>{this.cells[i].p=c.p;this.cells[i].q=c.q;});
      fine.bonds.forEach((b,i)=>Object.assign(this.bonds[i],b));this.broken+=half.broken+fine.broken;
      this.maxStrain=Math.max(0,...this.bonds.filter(b=>!b.broken).map(b=>b.strain));
      elapsed+=h;this.relaxationTime+=h;stats.elapsed=elapsed;stats.accepted++;stats.minStep=stats.minStep?Math.min(stats.minStep,h):h;stats.maxError=Math.max(stats.maxError,check.error);
      // A short final budget remainder may be below the minimum. It is valid for
      // this pass, but must not seed an invalid proposal for the next pass.
      this.solverStep=Math.max(C.solverMinStep,Math.min(C.solverMaxStep,h*Math.max(.5,Math.min(2,.8*Math.sqrt(check.limit/(check.error||1e-30))))));
      if(newly.length)this.onFracture(newly);
      flow=null;yield;
    }
    const final=mechanics(this.cells,this.bonds);this.maxOverlap=final.overlap;this.residual=final.rate;
    // Reference-step displacement preserves the old threshold's units, independent of h.
    this.motion=C.referenceDt*this.residual;yield;
  }
  advance(){const task=this.advanceSteps();let result;do{result=task.next();}while(!result.done);return result.value;}
  *advanceSteps(){
    if(this.fault)return this.snapshot();
    // Growth is gated by resolved geometry, strain, and residual motion, not wall time.
    yield* this.relaxSteps();if(this.fault)return this.snapshot();
    if(this.stopAtFracture&&this.fracturePending){this.status='fracture episode; growth paused';return this.snapshot();}
    if(this.maxOverlap>C.overlapTolerance||this.motion>C.motionTolerance){this.wait++;this.status=this.wait>120?'stalled: unresolved mechanics; growth paused':'relaxing: growth paused';return this.snapshot();}
    this.wait=0;
    if(this.cells.length>=this.maxCells&&this.cells.every(c=>c.size>=1)){this.status='cell cap reached; use Step to relax';return this.snapshot();}
    this.tick++;
    for(const c of [...this.cells]){
      if(c.size<1)c.size=Math.min(1,c.size+C.growth);
      else if(this.cells.length<this.maxCells){c.age++;if(c.age>=c.next){this.bud(c);c.next=c.age+C.interval+Math.floor(this.random()*25);}}
    }
    yield* this.relaxSteps();this.status=this.fault?'fault':this.maxOverlap>C.overlapTolerance||this.motion>C.motionTolerance?'relaxing: growth paused':this.cells.length>=this.maxCells?'maturing at cell cap':'growing';
    return this.snapshot();
  }
  snapshot(){return {buddingConvention:this.buddingConvention,maxCells:this.maxCells,params:{...this.params},seed:this.seed,tick:this.tick,status:this.status,fault:this.fault,
    cells:this.cells.map(c=>({...c,p:[...c.p],q:[...c.q],scars:[...c.scars]})),bonds:this.bonds.map(b=>({...b,direction:[...b.direction],restDirection:[...(b.restDirection??b.direction)],plasticRotation:b.plasticRotation??0})),
    fragments:this.fragments(),broken:this.broken,maxOverlap:this.maxOverlap,maxStrain:this.maxStrain,motion:this.motion,residual:this.residual,residualTolerance:C.motionTolerance/C.referenceDt,relaxationTime:this.relaxationTime,solver:{...this.solver}};}
}

// Exact plane/ellipsoid intersection. Coordinates of plane axes: X→YZ, Y→XZ, Z→XY.
export function section(c,axis=2,offset=0){
  if(![0,1,2].includes(axis)||!Number.isFinite(offset))throw Error('Invalid section plane');
  const n=[0,0,0];n[axis]=1;const Q=matrix(c),v=mv(Q,n),den=v[axis],delta=offset-c.p[axis],f=1-delta*delta/den;
  if(f<=0)return null;
  const center=add(c.p,mul(v,delta/den)),ij=[0,1,2].filter(i=>i!==axis);
  const entry=(i,j)=>{const e=[0,0,0];e[j]=1;return f*(mv(Q,e)[i]-v[i]*v[j]/den);};
  const A=entry(ij[0],ij[0]),B=entry(ij[0],ij[1]),D=entry(ij[1],ij[1]),disc=Math.hypot(A-D,2*B);
  const radii=[Math.sqrt(Math.max(0,(A+D+disc)/2)),Math.sqrt(Math.max(0,(A+D-disc)/2))];
  return {id:c.id,center,xy:ij.map(i=>center[i]),radii,angle:.5*Math.atan2(2*B,A-D),area:Math.PI*radii[0]*radii[1]};
}
