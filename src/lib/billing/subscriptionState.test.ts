import {describe,it,expect} from 'vitest';
import {hasSubscriptionAccess,productIdFromPlanName} from './subscriptionState';
const now=Date.parse('2026-09-06T12:00:00Z');
const active={product_id:'profissional_plan',status:'active',current_period_start:'2026-09-01T00:00:00Z',current_period_end:'2026-10-01T00:00:00Z'};
describe('billing entitlements',()=>{
 it('requires confirmed rights, never just a pending charge',()=>{
  for(const status of ['pending','unpaid','past_due','unknown','suspended','expired']){
   expect(hasSubscriptionAccess({...active,status},now)).toBe(false);
   expect(hasSubscriptionAccess({...active,status,current_period_end:null},now)).toBe(false);
  }
 });
 it('requires a finite current period and honors scheduled start',()=>{
  expect(hasSubscriptionAccess(active,now)).toBe(true);
  expect(hasSubscriptionAccess({...active,current_period_end:null},now)).toBe(false);
  expect(hasSubscriptionAccess({...active,current_period_start:'2027-01-01'},now)).toBe(false);
  expect(hasSubscriptionAccess({...active,current_period_end:new Date(now).toISOString()},now)).toBe(false);
 });
 it('preserves canceled-at-period-end access without granting expired access',()=>{
  expect(hasSubscriptionAccess({...active,status:'canceled',cancel_at_period_end:true},now)).toBe(true);
  expect(hasSubscriptionAccess({...active,status:'canceled'},now)).toBe(false);
  expect(hasSubscriptionAccess({...active,status:'canceled',cancel_at_period_end:true},Date.parse('2027-01-01'))).toBe(false);
 });
 it('honors a finite manual release independently of the gateway status',()=>{
  expect(hasSubscriptionAccess({...active,status:'past_due',manual_override:true},now)).toBe(true);
  expect(hasSubscriptionAccess({...active,status:'expired',manual_override:true},now)).toBe(true);
  expect(hasSubscriptionAccess({...active,status:'past_due',manual_override:true,current_period_end:null},now)).toBe(false);
  expect(hasSubscriptionAccess({...active,status:'past_due',manual_override:true},Date.parse('2027-01-01'))).toBe(false);
 });
 it('resolves the names stored by checkout and manual grants',()=>{
  expect(productIdFromPlanName('Básico')).toBe('basico_plan');
  expect(productIdFromPlanName('Profissional')).toBe('profissional_plan');
  expect(productIdFromPlanName('Empresarial')).toBe('empresarial_plan');
 });
});
