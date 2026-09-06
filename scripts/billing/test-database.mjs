// Isolated PostgreSQL/WASM validation. Set PGLITE_MODULE to the installed package path.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_user::text $$;
CREATE TABLE public.user_roles(user_id uuid,role text);
CREATE FUNCTION public.has_role(_uid uuid,_role text) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role=_role) $$;
CREATE FUNCTION public.get_data_owner_id(_user_id uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT _user_id $$;
CREATE TABLE public.expenses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,amount numeric);
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.expenses TO authenticated;
CREATE POLICY expenses_owner ON public.expenses TO authenticated USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE TABLE public.plans(id uuid PRIMARY KEY,name text,active boolean,price numeric,trial_days integer,sort_order integer);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY REFERENCES auth.users(id),display_name text,username text UNIQUE,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
CREATE TABLE public.subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id),environment text,
 paddle_subscription_id text UNIQUE NOT NULL,paddle_customer_id text NOT NULL,product_id text NOT NULL,price_id text NOT NULL,status text,
 current_period_start timestamptz,current_period_end timestamptz,cancel_at_period_end boolean DEFAULT false,updated_at timestamptz,created_at timestamptz DEFAULT now(),UNIQUE(user_id,environment));
`);
await db.exec(await fs.readFile('supabase/migrations/20260906030000_billing_integrity.sql','utf8'));
const uid='11111111-1111-4111-8111-111111111111',admin='22222222-2222-4222-8222-222222222222',plan='33333333-3333-4333-8333-333333333333';
await db.query(`INSERT INTO auth.users(id) VALUES($1),($2)`,[uid,admin]);
await db.query(`INSERT INTO profiles(user_id) VALUES($1),($2)`,[uid,admin]);
await db.query(`INSERT INTO user_roles VALUES($1,'admin')`,[admin]);
await db.query(`INSERT INTO plans VALUES($1,'Profissional',true,50,7,1)`,[plan]);
async function row(){return (await db.query(`SELECT * FROM subscriptions WHERE user_id=$1 AND environment='live'`,[uid])).rows[0]}
async function prepare(key,cycle='monthly') {return (await db.query(`SELECT billing_prepare_order($1,'live',$2,$3,$4,5000) result`,[uid,key,plan,cycle])).rows[0].result}
async function apply(o,event,id,status='RECEIVED',extra={}){
 return (await db.query(`SELECT billing_apply_payment('live',$1,$2,$3::jsonb) result`,[event,status,JSON.stringify({id,customer:'cus1',externalReference:o.id,value:50,status,refunds:null,dueDate:'2026-09-10',...extra})])).rows[0].result;
}
async function link(o){await db.query(`UPDATE billing_orders SET customer_id='cus1' WHERE id=$1`,[o.id]);}
async function action(action,other={}) {return (await db.query(`SELECT billing_admin_action($1,'live',$2::jsonb) result`,[admin,JSON.stringify({action,target_user_id:uid,...other})])).rows[0].result}
const a=(await prepare('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).order;await link(a);
assert.equal((await prepare('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).created,false);
await apply(a,'a-confirm','payA','CONFIRMED');const first=Date.parse((await row()).current_period_end);
const b=(await prepare('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).order;await link(b);
await apply(b,'b-confirm','payB','CONFIRMED');const second=Date.parse((await row()).current_period_end);
await apply(a,'a-received','payA');assert.equal(Date.parse((await row()).current_period_end),second);assert.equal(second-first,30*864e5);
assert.equal((await db.query(`SELECT status FROM asaas_webhook_events WHERE event_id='live:a-confirm'`)).rows[0].status,'processed');
console.log('PASS: migration, request reuse, A/B/A idempotency, audit');
await action('block_user',{note:'Admin block'});await apply(b,'b-received','payB');
assert.equal((await db.query(`SELECT is_blocked FROM profiles WHERE user_id=$1`,[uid])).rows[0].is_blocked,true);
console.log('PASS: gateway preserves admin block');
await action('unblock_user');await action('grant_plan',{plan_id:plan,start_date:new Date().toISOString(),end_date:'2028-01-01T00:00:00Z'});
const manual=(await row()).current_period_end;
await apply(a,'a-refund','payA','REFUNDED');assert.equal(Date.parse((await row()).current_period_end),Date.parse(manual));
await action('clear_override');assert.equal((await row()).manual_override,false);
assert(Date.parse((await row()).current_period_end)<second);
console.log('PASS: refund preserves manual grant, clear restores paid rights');
const before=await row();await action('update_note',{note:'Only a note'});const after=await row();
for(const k of ['current_period_end','status','manual_override'])assert.deepEqual(after[k],before[k]);
await action('set_days_remaining',{trial_days:0});
assert.equal((await db.query(`SELECT is_access_blocked($1) value`,[uid])).rows[0].value,true);
await assert.rejects(()=>action('reactivate'));
console.log('PASS: notes have no access side effects, zero days expires, reactivation requires valid days');
await db.query(`SELECT set_config('request.jwt.claim.sub',$1,false)`,[uid]);
await db.exec(`GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT SELECT,UPDATE ON profiles TO authenticated; SET ROLE authenticated;`);
await assert.rejects(()=>db.query(`UPDATE profiles SET current_period_end=now()+interval '10 years' WHERE user_id=$1`,[uid]));
await assert.rejects(()=>db.query(`SELECT billing_admin_action($1,'live',$2::jsonb)`,[admin,JSON.stringify({action:'renew',target_user_id:uid,trial_days:30})]));
await assert.rejects(()=>db.query(`INSERT INTO expenses(user_id,amount) VALUES($1,10)`,[uid]));
await db.exec('RESET ROLE');console.log('PASS: self-service billing tampering and privileged RPC denied');

// Additional scenarios exercise SQL transactions rather than mocking persistence.
await action('clear_override');
const paidEnd=Date.parse((await row()).current_period_end);
const abandoned=(await prepare('cccccccc-cccc-4ccc-8ccc-cccccccccccc','annual')).order;await link(abandoned);
await apply(abandoned,'deleted-unpaid','payOld','PENDING',{deleted:true});
assert.equal(Date.parse((await row()).current_period_end),paidEnd);
const annual=(await prepare('dddddddd-dddd-4ddd-8ddd-dddddddddddd','annual')).order;await link(annual);
assert.equal((await apply(annual,'wrong-value','payAnnual','RECEIVED',{value:1})).review,'amount_mismatch');
assert.equal(Date.parse((await row()).current_period_end),paidEnd);
await apply(annual,'annual-paid','payAnnual');
assert.equal(Date.parse((await row()).current_period_end)-paidEnd,365*864e5);
console.log('PASS: deletion of unpaid order preserves paid days, amount mismatch quarantined, annual duration correct');

const transactionOrder=(await prepare('99999999-9999-4999-8999-999999999999')).order;await link(transactionOrder);
const beforePaymentFailure=Date.parse((await row()).current_period_end);
await db.exec(`CREATE FUNCTION reject_event_finish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='processed' THEN RAISE EXCEPTION 'injected event failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER reject_event_finish BEFORE UPDATE ON asaas_webhook_events FOR EACH ROW EXECUTE FUNCTION reject_event_finish();`);
await assert.rejects(()=>apply(transactionOrder,'failed-event','payTransaction'));
assert.equal(Date.parse((await row()).current_period_end),beforePaymentFailure);
assert.equal((await db.query(`SELECT credited_at FROM billing_orders WHERE id=$1`,[transactionOrder.id])).rows[0].credited_at,null);
await db.exec('DROP TRIGGER reject_event_finish ON asaas_webhook_events');
await apply(transactionOrder,'failed-event','payTransaction');
assert.equal(Date.parse((await row()).current_period_end)-beforePaymentFailure,30*864e5);
console.log('PASS: failed payment audit rolls back credit and retry grants exactly once');

const beforeRollback=await row();
await db.exec(`CREATE FUNCTION reject_billing_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected audit failure'; END $$;
 CREATE TRIGGER reject_billing_audit BEFORE INSERT ON subscription_audit_log FOR EACH ROW EXECUTE FUNCTION reject_billing_audit();`);
await assert.rejects(()=>action('set_days_remaining',{trial_days:120}));
assert.deepEqual(await row(),beforeRollback);
await db.exec('DROP TRIGGER reject_billing_audit ON subscription_audit_log');
console.log('PASS: failed audit rolls back admin access mutation');

const recurring=(await db.query(`SELECT billing_prepare_order($1,'live',$2,$3,'monthly',5000,'recurring') result`,[uid,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',plan])).rows[0].result.order;
await link(recurring);await db.query(`INSERT INTO billing_contracts(environment,subscription_id,order_id) VALUES('live','sub1',$1)`,[recurring.id]);
await apply(recurring,'cycle1','payCycle1','RECEIVED',{subscription:'sub1'});
const cycle1End=Date.parse((await row()).current_period_end);
await apply(recurring,'cycle2','payCycle2','RECEIVED',{subscription:'sub1'});
assert.equal(Date.parse((await row()).current_period_end)-cycle1End,30*864e5);
await apply(recurring,'cycle2-repeat','payCycle2','RECEIVED',{subscription:'sub1'});
assert.equal(Date.parse((await row()).current_period_end)-cycle1End,30*864e5);
console.log('PASS: recurring payments receive separate credits with deduplication');

await action('cancel');assert.equal((await row()).cancel_at_period_end,true);
assert.equal((await db.query(`SELECT is_access_blocked($1) value`,[uid])).rows[0].value,false);
await action('set_dates',{start_date:'2030-01-01T00:00:00Z',end_date:'2030-02-01T00:00:00Z'});
assert.equal((await db.query(`SELECT is_access_blocked($1) value`,[uid])).rows[0].value,true);
const list=(await db.query(`SELECT billing_admin_list($1,'live','','active',1,0) result`,[admin])).rows[0].result;
assert.equal(list.total,1);assert.equal(list.rows.length,1);
console.log('PASS: scheduled cancellation keeps paid days, future grants wait for start, filtering precedes pagination');

const liveBefore=await row();
const sandbox=(await db.query(`SELECT billing_prepare_order($1,'sandbox',$2,$3,'monthly',5000) result`,[uid,'ffffffff-ffff-4fff-8fff-ffffffffffff',plan])).rows[0].result.order;
await link(sandbox);
await db.query(`SELECT billing_apply_payment('sandbox','sandbox-paid','RECEIVED',$1::jsonb)`,[JSON.stringify({id:'sandboxPay',customer:'cus1',externalReference:sandbox.id,status:'RECEIVED',value:50})]);
assert.deepEqual(await row(),liveBefore);
await db.exec(`UPDATE billing_runtime_config SET environment='sandbox'`);
assert.equal((await db.query(`SELECT is_access_blocked($1) value`,[uid])).rows[0].value,false);
console.log('PASS: sandbox isolated from live, dedicated sandbox database can validate access');
await db.close();
