const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {agentHarness, read, tick} = require('./venice-bridge-harness.cjs');
const tool={action:'tool',name:'core/read',args:{paths:['/picked/note.txt']}}, done={action:'done',summary:'synthetic note'};
function panel(h) {
  vm.runInNewContext(read('venice-panel.js'),{window:h.brain,location:h.brain.location,document:h.brain.document,crypto:h.brain.crypto});
  const root=h.brain.document.getElementById('cos-venice-panel').shadowRoot;
  return id=>root.getElementById(id);
}
async function until(check) { for(let i=0;i<100;i++){await tick();if(check())return;}assert.fail('did not settle'); }
function start(h,p) {p('instruction').value='Read the synthetic note';p('instruction').dispatchEvent(new h.brain.Event('input'));p('run').click();}

test('panel waits for approval, retains runId after completion, and Stop revokes before a replay with a new callId',async t=>{
  let approve, revoked=false;const requests=[];
  const h=agentHarness(t,{replies:[tool,done],localTransport:async(path,init)=>{
    const body=JSON.parse(init.body);requests.push({path,body});
    if(path.endsWith('/request')) return new Promise(resolve=>{approve=()=>resolve({ok:true,data:{runId:'app-run'}});});
    if(path.endsWith('/revoke')) {revoked=true;return {ok:true,data:{revoked:true}};}
    return {ok:true,data:{callId:body.request.callId,state:revoked?'unknown':'completed',...(revoked?{error:'RUN_REVOKED'}:{result:{content:[{type:'text',text:'synthetic note'}]}})}};
  }}),p=panel(h);
  await until(()=>p('state').textContent==='待機中');start(h,p);await until(()=>approve);
  assert.equal(p('state').textContent,'アプリの承認待ち');assert.equal(h.prompts.length,0);
  approve();await until(()=>p('state').textContent==='完了');
  assert.equal(p('state').dataset.runId,'app-run');assert.equal(p('stop').disabled,false);
  assert.equal(h.prompts.length,2);assert.match(h.prompts[1],/synthetic note/);
  p('stop').click();await until(()=>p('state').textContent==='失効済み');
  assert.equal(p('state').dataset.runId,'app-run');assert.equal(p('stop').disabled,true);
  assert.equal(requests.find(r=>r.path.endsWith('/revoke')).body.runId,'app-run');
  const result=await h.api.executeTool('core/read',tool.args);assert.equal(result.ok,false);assert.match(result.error,/RUN_REVOKED/);
});
test('refusal is shown in the step log and sends no model prompt',async t=>{
  const h=agentHarness(t,{localTransport:async()=>({ok:true,data:{error:'許可しませんでした。'}})}),p=panel(h);
  await until(()=>p('state').textContent==='待機中');start(h,p);await until(()=>p('state').textContent==='エラー');
  assert.match(p('steps').textContent,/許可しませんでした/);assert.equal(h.prompts.length,0);
});
test('Stop can cancel a pending HTTP approval without being serialized behind it',async t=>{
  let cancel;const h=agentHarness(t,{localTransport:async path=>{
    if(path.endsWith('/request'))return new Promise(resolve=>{cancel=()=>resolve({ok:true,data:{error:'stopped'}});});
    if(path.endsWith('/revoke')){cancel();return {ok:true,data:{revoked:false}};}
    throw Error(path);
  }}),p=panel(h);
  await until(()=>p('state').textContent==='待機中');start(h,p);await until(()=>cancel);p('stop').click();
  await until(()=>p('state').textContent==='停止');assert.equal(h.prompts.length,0);assert.equal(p('run').disabled,false);
});
test('a brain reload invalidates its stored document grant, even while the MV3 owner is suspended between calls',async t=>{
  let revoked=false;const h=agentHarness(t,{localTransport:async(path,init)=>{
    if(path.endsWith('/request'))return {ok:true,data:{runId:'app-run'}};
    if(path.endsWith('/revoke')){revoked=true;return {ok:true,data:{revoked:true}};}
    const body=JSON.parse(init.body);return {ok:true,data:{callId:body.request.callId,state:'unknown',error:revoked?'RUN_REVOKED':'unexpected'}};
  }});
  await h.api.requestGrant('synthetic instruction');
  for(const fn of h.updates)fn(1,{status:'loading'},{});
  await until(()=>revoked);
  const result=await h.api.executeTool('core/read',tool.args);assert.equal(result.ok,false);assert.match(result.error,/RUN_REVOKED/);
});
