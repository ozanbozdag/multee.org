import {V} from './core.js?v=20261002-growth-axis-17';
// Presentation-only rigid translations. These values never enter the solver.
export class FragmentPresentation {
 constructor({distance=12,duration=3000}={}){if(!Number.isFinite(distance)||distance<0||!Number.isFinite(duration)||duration<0)throw new RangeError('Invalid fragment presentation settings');this.distance=distance;this.duration=duration;this.reset();}
 reset(){this.parts=new Map();this.owner=new Map();}
 offset(root,now,cache=new Map()){if(cache.has(root))return cache.get(root);const p=this.parts.get(root);if(!p)return [0,0,0];const base=p.parent===null?[0,0,0]:this.offset(p.parent,now,cache);const t=p.duration?Math.max(0,Math.min(1,(now-p.start)/p.duration)):1,ease=t*t*(3-2*t),result=V.add(base,V.mul(p.delta,ease));cache.set(root,result);return result;}
 update(state,now){
  const owner=new Map(),groups=[...state.fragments].map(g=>({root:Math.min(...g),ids:g})).sort((a,b)=>a.root-b.root);
  for(const g of groups)for(const id of g.ids)owner.set(id,g.root);
  const byId=new Map(state.cells.map(c=>[c.id,c])),incoming=new Map(state.bonds.map(b=>[b.d,b]));
  for(const g of groups)if(!this.parts.has(g.root)){
   const edge=incoming.get(g.root),parent=edge?.broken?owner.get(edge.m):null;
   let delta=[0,0,0],duration=0;
   if(parent!==null&&parent!==undefined&&parent!==g.root){
    const daughter=byId.get(g.root),mother=byId.get(edge.m);let direction=V.sub(daughter.p,mother.p);
    if(V.norm(direction)<1e-8){const angle=g.root*2.399963;direction=[Math.cos(angle),Math.sin(angle),.25];}
    delta=V.mul(V.unit(direction),this.distance);duration=this.duration;
   }
   this.parts.set(g.root,{parent:duration?parent:null,delta,start:now,duration});
  }
  this.owner=owner;
 }
 isAnimating(now){return [...this.parts.values()].some(p=>p.duration&&now<p.start+p.duration);}
 display(state,now,enabled=true){if(!enabled)return state;const cache=new Map(),offsets=new Map(state.fragments.map(g=>{const root=Math.min(...g);return [root,this.offset(root,now,cache)];}));return {...state,cells:state.cells.map(c=>({...c,p:V.add(c.p,offsets.get(this.owner.get(c.id))||[0,0,0])}))};}
}
