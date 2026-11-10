import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateShipping } from '../src/services/shipping-quote.js';
const shop = { businessAddress: 'Test Lane', city: 'Delhi', state: 'Delhi', pinCode: '110001', country: 'India' };
const address = { line1: 'Test Street', city: 'Delhi', region: 'Delhi', postalCode: '110002', country: 'India' };
const cartItems = [{ quantity: 2, product: { name: 'Demo Shirt' }, variant: { shippingWeightGrams: 250 } }];
const old = Object.fromEntries(['NODE_ENV','SHIPPING_LOCAL_DEMO_MODE','SHIPPING_LOCAL_DEMO_DISTANCE_KM','GOOGLE_MAPS_API_KEY'].map(k=>[k,process.env[k]]));
function env(vars) { for(const key of Object.keys(old)) delete process.env[key]; Object.assign(process.env, vars); }
test('development-only opt-in returns explicitly simulated quote and preserves slabs', async () => {
 env({NODE_ENV:'development',SHIPPING_LOCAL_DEMO_MODE:'true',SHIPPING_LOCAL_DEMO_DISTANCE_KM:'8'});
 const q = await calculateShipping({shop,address,cartItems,merchandiseSubtotal:500});
 assert.equal(q.isSimulated,true); assert.equal(q.distanceKm,8); assert.equal(q.amount,40); assert.equal(q.calculationMethod,'LOCAL_DEMO_DISTANCE_WEIGHT_SLAB');
 const free = await calculateShipping({shop,address,cartItems,merchandiseSubtotal:2516}); assert.equal(free.amount,0);
});
test('production never uses demo route, even if flag is set', async () => {
 env({NODE_ENV:'production',SHIPPING_LOCAL_DEMO_MODE:'true'});
 await assert.rejects(calculateShipping({shop,address,cartItems,merchandiseSubtotal:500}),{code:'SHIPPING_ROUTING_NOT_CONFIGURED'});
});
test('development without opt-in never uses demo route', async () => {
 env({NODE_ENV:'development'});
 await assert.rejects(calculateShipping({shop,address,cartItems,merchandiseSubtotal:500}),{code:'SHIPPING_ROUTING_NOT_CONFIGURED'});
});
test('still rejects missing shipping weights', async () => {
 env({NODE_ENV:'development',SHIPPING_LOCAL_DEMO_MODE:'true'});
 await assert.rejects(calculateShipping({shop,address,cartItems:[{quantity:1,product:{name:'Broken'},variant:{shippingWeightGrams:null}}],merchandiseSubtotal:500}),{code:'PRODUCT_WEIGHT_MISSING'});
});
test('still rejects incomplete seller pickup address', async () => {
 env({NODE_ENV:'development',SHIPPING_LOCAL_DEMO_MODE:'true'});
 await assert.rejects(calculateShipping({shop:{...shop,pinCode:null},address,cartItems,merchandiseSubtotal:500}),{code:'SHOP_PICKUP_ADDRESS_REQUIRED'});
});
test('still enforces max delivery radius', async () => {
 env({NODE_ENV:'development',SHIPPING_LOCAL_DEMO_MODE:'true',SHIPPING_LOCAL_DEMO_DISTANCE_KM:'51'});
 await assert.rejects(calculateShipping({shop,address,cartItems,merchandiseSubtotal:500}),{code:'OUTSIDE_DELIVERY_RADIUS'});
});
process.on('exit',()=>{for(const [k,v] of Object.entries(old)) if(v===undefined)delete process.env[k]; else process.env[k]=v;});
