// Accepted-state capture observes the unchanged solver; capture failure never stops mechanics.
import {Simulator} from './core.js?v=20261002-growth-axis-17';
import {AcceptedStateRecorder} from './cinematic-history.mjs?v=20261002-growth-axis-17';
let sim=new Simulator({seed:8}),running=false,stepping=false,timer=null,version=0;
let task=null,workMs=0,lastMs=0,lastPosted=0,historyRecorder=null,lastHistoryStatus=-Infinity;
const send=(extra={},state=sim.snapshot())=>postMessage({state,running,stepping,version,ms:task!==null?workMs:lastMs,inProgress:task!==null,...extra});
const historyStatus=(extra={})=>{postMessage({type:'history-status',version,history:historyRecorder?.history.status()??null,...extra});lastHistoryStatus=performance.now();};
// Capture is best-effort presentation work. Its failure cannot stop, advance,
// rewind, or otherwise change mechanics. No historical states go through send().
function observeHistory(options={}){
 if(!historyRecorder?.history.active)return;
 try{const wasActive=historyRecorder.history.active,stored=historyRecorder.observe(sim,options);if((stored&&performance.now()-lastHistoryStatus>=500)||(wasActive&&!historyRecorder.history.active))historyStatus();}
 catch(error){historyRecorder.history.stop(`Capture failed: ${error.message}. Simulation continues.`);historyStatus();}
}
function stopHistory(reason,extra={}){
 if(!historyRecorder?.history.active)return false;
 try{historyRecorder.stop(sim,reason);}catch(error){historyRecorder.history.stop(`Capture failed: ${error.message}. Simulation continues.`);}historyStatus(extra);return true;
}
function fail(error){running=false;stepping=false;clearTimeout(timer);timer=null;task=null;stopHistory('Simulation stopped after a numerical error');postMessage({error:error.message,version,running:false});}
function pump(){
 timer=null;if(!running&&!stepping)return;
 const start=performance.now();let completed=false;
 try{
  if(!task){task=sim.advanceSteps();workMs=0;}
  do{
   const t=performance.now(),result=task.next();workMs+=performance.now()-t;
   observeHistory({completed:result.done});
   if(result.done){
    task=null;lastMs=workMs;completed=true;stepping=false;
    if(sim.fault||sim.status.startsWith('cell cap'))running=false;
    if(sim.fault)stopHistory('Simulation reached a numerical limit');
    send({sliceMs:performance.now()-start},result.value);lastPosted=performance.now();break;
   }
  }while(performance.now()-start<8);
  if(!completed&&performance.now()-lastPosted>=80){send({ms:workMs,sliceMs:performance.now()-start});lastPosted=performance.now();}
  if(running||stepping)timer=setTimeout(pump,0);
 }catch(error){fail(error);}
}
function historyCommand(d){
 try{
  if(d.version!==version)throw new Error('Stale history command');
  if(d.type==='history-start'){
   if(historyRecorder?.history.captureId===d.captureId){historyStatus({requestId:d.requestId});return;}
   if(historyRecorder?.history.active)throw new Error('Stop the active capture before starting another');
   // Starting a new capture deliberately replaces the last stopped archive.
   // The caller should save/download it first if the user wants to keep it.
   historyRecorder=new AcceptedStateRecorder(sim,{captureId:d.captureId,runVersion:version,modelVersion:'20261002-growth-axis-17',startedAt:new Date().toISOString()});historyStatus({requestId:d.requestId});return;
  }
  if(!historyRecorder||d.captureId!==historyRecorder.history.captureId)throw new Error('Capture identity changed');
  if(d.type==='history-stop'){if(!stopHistory('Capture stopped',{requestId:d.requestId}))historyStatus({requestId:d.requestId});return;}
  if(d.type==='history-export'){
   // Fresh final accepted state, if needed; exporting does not resume/pause a run.
   observeHistory({final:true});
   postMessage({type:'history-project',version,captureId:d.captureId,requestId:d.requestId,project:historyRecorder.history.project()});return;
  }
  throw new Error('Unknown history command');
 }catch(error){postMessage({type:'history-error',version,captureId:d.captureId,requestId:d.requestId,error:error.message});}
}
onmessage=({data:d})=>{
 if(d.type?.startsWith('history-')){historyCommand(d);return;}
 try{
  if(d.type==='reset'){const next=new Simulator(d.params);stopHistory('Simulation reset; this archive retains the previous run');clearTimeout(timer);timer=null;running=false;stepping=false;task=null;sim=next;version=d.version;lastMs=0;send();if(historyRecorder)historyStatus();}
  if(d.type==='setGrowthLimit'){sim.setGrowthLimit(d.maxCells);send({growthLimitRequestId:d.requestId});}
  if(d.type==='run'&&!running){clearTimeout(timer);running=true;stepping=false;pump();}
  if(d.type==='pause'){running=false;stepping=false;clearTimeout(timer);timer=null;observeHistory({final:true});send();if(historyRecorder)historyStatus();}
  if(d.type==='step'&&!running&&!stepping){stepping=true;pump();}
 }catch(error){fail(error);}
};
send();
