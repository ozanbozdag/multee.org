import {bondGeometry} from './core.js?v=20261002-growth-axis-17';
const stops=[[0,[93,184,204]],[.5,[158,211,161]],[.8,[239,211,115]],[1,[244,126,98]]];
export function strainColor(ratio){const x=Math.max(0,Math.min(1,Number.isNaN(Number(ratio))?0:Number(ratio)));let a=stops[0],b=stops[1];for(let i=1;i<stops.length;i++){b=stops[i];if(x<=b[0])break;a=b;}const t=(x-a[0])/(b[0]-a[0]||1);return '#'+a[1].map((v,i)=>Math.round(v+(b[1][i]-v)*t).toString(16).padStart(2,'0')).join('');}
export function bondStrainColors(state,selectedThreshold=state.params.strength){
 const values=Object.fromEntries(state.cells.map(c=>[c.id,0]));
 for(const b of state.bonds)if(!b.broken){const strain=Math.max(0,bondGeometry(b,state.cells).strain);values[b.m]=Math.max(values[b.m],strain);values[b.d]=Math.max(values[b.d],strain);}
 const mechanicalThreshold=state.params.strength,threshold=Number.isFinite(selectedThreshold)&&selectedThreshold>0?selectedThreshold:mechanicalThreshold,peak=Math.max(0,...Object.values(values)),rangeMax=threshold,ratios={},colors={};
 for(const c of state.cells){ratios[c.id]=Math.max(0,Math.min(1,values[c.id]/threshold));colors[c.id]=strainColor(values[c.id]/rangeMax);}
 return {values,ratios,colors,peak,threshold,rangeMax,mechanicalThreshold};
}
