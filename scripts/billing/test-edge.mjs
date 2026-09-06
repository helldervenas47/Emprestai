import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
function evaluate(file,bindings){
 const source=fs.readFileSync(file,'utf8').replace(/^import .*;\n/gm,'');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const context={exports:{},Request,Response,URL,Date,crypto,AbortSignal,console:{error(){}},...bindings};
 vm.runInNewContext(code,context);return context.exports;
}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status});
let handler,secret='secret',getCount=0,rpcFail=false,rpcPayment;
evaluate('supabase/functions/asaas-webhook/index.ts',{
 Deno:{serve:f=>handler=f,env:{get:()=>secret}},billingJson:json,billingConfig:()=>({environment:'live'}),
 asaasFetch:async()=>{getCount++;return {id:'pay1',status:'RECEIVED',value:50}},
 getExternalAdmin:()=>({rpc:async(_,args)=>{rpcPayment=args._payment;return {data:{processed:true},error:rpcFail?{message:'db failure'}:null}}}),
});
const event={id:'event1',event:'PAYMENT_RECEIVED',payment:{id:'pay1',value:1}};
const request=(token='secret',body=event)=>new Request('https://example.test',{method:'POST',headers:{'asaas-access-token':token},body:JSON.stringify(body)});
assert.equal((await handler(request('wrong'))).status,403);assert.equal(getCount,0);
assert.equal((await handler(request('secret',{}))).status,400);
assert.equal((await handler(request())).status,200);assert.equal(rpcPayment.value,50);
rpcFail=true;assert.equal((await handler(request())).status,500);
secret=undefined;assert.equal((await handler(request())).status,500);
console.log('PASS: webhook secret, payload validation, authoritative gateway lookup, retry on transaction failure');

const order={id:'33333333-3333-4333-8333-333333333333',payment_id:null};
let created=true,posts=0,failCreate=false,computed;
const payment={id:'pay_1',externalReference:order.id,customer:'cus1',value:50,status:'PENDING'};
const fakeAdmin={
 from(table){const q={select(){return q},eq(){return q},update(){return q},single:async()=>({data:table==='plans'?{id:'plan1',name:'Profissional',price:50,active:true}:{display_name:'Test'},error:null}),
 maybeSingle:async()=>({data:{customer_id:'cus1'},error:null}),then(resolve){return Promise.resolve({error:null}).then(resolve)}};return q},
 async rpc(name,args){if(name==='billing_prepare_order'){computed=args._cents;return {data:{created,order},error:null}}return {data:{processed:true},error:null}},
};
const {handleCheckout}=evaluate('supabase/functions/_shared/billing-checkout.ts',{
 getExternalAdmin:()=>fakeAdmin,authenticatedOwner:async()=>({id:'user1'}),billingConfig:()=>({environment:'live'}),billingJson:json,
 planPriceCents:plan=>Math.round(plan.price*100),
 asaasFetch:async(path,init)=>{
  if(init?.method==='POST'){posts++;if(failCreate)throw new Error('timeout');return payment}
  if(path.includes('externalReference='))return {data:[payment]};
  return payment;
 },
});
const checkout=()=>new Request('https://example.test',{method:'POST',body:JSON.stringify({requestKey:'11111111-1111-4111-8111-111111111111',planId:'plan1',cycle:'monthly',value:1})});
assert.equal((await handleCheckout(checkout())).status,200);assert.equal(computed,5000);assert.equal(posts,1);
created=false;order.payment_id='pay_1';assert.equal((await handleCheckout(checkout())).status,200);assert.equal(posts,1);
created=true;order.payment_id=null;failCreate=true;assert.equal((await handleCheckout(checkout())).status,500);
created=false;failCreate=false;assert.equal((await handleCheckout(checkout())).status,200);assert.equal(posts,2);
console.log('PASS: server price, existing payment reuse, uncertain POST recovery without duplicate charge');
