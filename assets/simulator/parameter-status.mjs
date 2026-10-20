// Compare controls against the acknowledged worker state. A slider edit never
// silently changes a running culture, and an old update cannot mark it applied.
export function parameterStatus(state,selected,{resetting=false}={}){
 const seed=Number(selected.seed),validSeed=String(selected.seed).trim()!==''&&Number.isInteger(seed)&&seed>=0&&seed<=4294967295;
 const names={shape:'shape',strength:'breaking threshold',angle:'later-bud growth angle'};
 const changes=state?Object.keys(names).filter(k=>Number(selected[k])!==state.params[k]).map(k=>`${names[k]} ${state.params[k]}${k==='angle'?'°':''} → ${Number(selected[k])}${k==='angle'?'°':''}`):[];
 if(state&&validSeed&&seed!==state.seed)changes.push(`seed ${state.seed} → ${seed}`);
 const pending=changes.length>0||!validSeed;
 const note=resetting?'Applying selected settings and restarting…':!validSeed?'Enter an integer seed from 0 to 4294967295.':pending?`Not applied to this run: ${changes.join('; ')}. Apply changes & restart, or continue with the active settings.`:'';
 const active=state?`Active: shape ${state.params.shape.toFixed(2)} · threshold ${state.params.strength.toFixed(2)} · later-bud growth angle ${state.params.angle}° · seed ${state.seed}`:'Waiting for the active simulation settings…';
 let polar=0,later=0;for(const b of state?.bonds??[])(b.firstBud??b.angle===0)?polar++:later++;
 const angle=state?`Active in this run: ${state.params.angle}°${Number(selected.angle)!==state.params.angle?` · selected ${Number(selected.angle)}° awaits restart`:''}.`:'Angle is applied when the simulation starts.';
 const births=`Buds placed in this run: ${polar} polar first ${polar===1?'bud':'buds'} at 0° · ${later} later ${later===1?'bud':'buds'}${state?` initially at ${state.params.angle}°`:''}. ${later?'Counts include attachments that later broke.':'The slider first changes geometry when a cell buds again.'}`;
 return {pending,validSeed,note,active,angle,births,polar,later};
}
