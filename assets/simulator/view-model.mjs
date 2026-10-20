import {axes,section} from './core.js?v=20261002-growth-axis-17';
// The oldest surviving cell fixes identity: newborns and later splits cannot recolor its group.
export const palette=['#f5f2df','#f6b45f','#d78def','#75d98a','#8baaff','#fa859c','#55d9da','#e1df65','#f2a4db'];
export function viewModel(state,axis,offset,suppliedColors=null,includeCuts=true){
 const colors=suppliedColors||{};if(!suppliedColors)for(const group of state.fragments){const root=Math.min(...group),color=palette[root===0?0:1+(root-1)%(palette.length-1)];for(const id of group)colors[id]=color;}
 const extent=[[Infinity,-Infinity],[Infinity,-Infinity],[Infinity,-Infinity]];let low=0,high=0;
 for(const c of state.cells){const {a,b,u}=axes(c);for(let i=0;i<3;i++){extent[i][0]=Math.min(extent[i][0],c.p[i]-a);extent[i][1]=Math.max(extent[i][1],c.p[i]+a);}const r=Math.sqrt(b*b+(a*a-b*b)*u[axis]**2);low=Math.min(low,c.p[axis]-r);high=Math.max(high,c.p[axis]+r);}
 const center=extent.map(([lo,hi])=>(lo+hi)/2),radius=Math.max(2,...extent.map(([lo,hi])=>(hi-lo)/2));
 return {colors,extent,center,radius,low:low-.2,high:high+.2,axis,offset,ij:[0,1,2].filter(i=>i!==axis),cuts:includeCuts?state.cells.map(c=>section(c,axis,offset)).filter(Boolean):[]};
}
export function validSeed(value){const n=Number(value);return Number.isInteger(n)&&n>=0&&n<=4294967295&&String(value).trim()!=='';}
