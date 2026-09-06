declare global { const Deno: { env: { get(key: string): string | undefined } }; }
import {describe,it,expect} from 'vitest';
import {planPriceCents,billingConfig} from '../../../supabase/functions/_shared/asaas';
import {vi,afterEach} from 'vitest';
afterEach(()=>vi.unstubAllGlobals());
describe('gateway input validation',()=>{
 it('resolves cycles and explicit values in cents without replacing zero with a charge',()=>{
  expect(planPriceCents({price:49.9},'monthly')).toBe(4990);
  expect(planPriceCents({price:49.9,discount_anual:10},'annual')).toBe(53892);
  expect(planPriceCents({price:49.9,price_semestral:200},'semestral')).toBe(20000);
  for(const plan of [{price:0},{price:NaN},{price:Infinity},{price:10,discount_anual:110},{price:10,price_anual:0}]){
   expect(()=>planPriceCents(plan,'annual')).toThrow();
  }
  expect(()=>planPriceCents({price:10},'invalid')).toThrow();
 });
 it('rejects keys routed to a different environment host',()=>{
  const values:Record<string,string>={ASAAS_ENVIRONMENT:'live',ASAAS_BASE_URL:'https://sandbox.asaas.com/api/v3',ASAAS_API_KEY:'test-only'};
  vi.stubGlobal('Deno',{env:{get:(key:string)=>values[key]}});
  expect(()=>billingConfig()).toThrow('billing_environment_url_mismatch');
  values.ASAAS_ENVIRONMENT='sandbox';
  expect(billingConfig().environment).toBe('sandbox');
  values.ASAAS_BASE_URL='https://untrusted.example/v3';
  expect(()=>billingConfig()).toThrow();
 });
});
