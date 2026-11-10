import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedAttributeNames, verifyCategoryVariantOptions } from '../src/services/variant-category-policy.js';
const categories = [
  {id:'root',name:'Electronics',parentId:null},
  {id:'pb',name:'Power Banks',parentId:'root'},
  {id:'clothes',name:'Clothing',parentId:null},
  {id:'shirts',name:'Shirt',parentId:'clothes'},
];
const attrs = [{id:'capacity',name:'Capacity'}, {id:'size',name:'Size'}, {id:'color',name:'Color'}, {id:'watts',name:'Wattage'}];
const db = {
  category:{findMany:async()=>categories},
  variantAttribute:{findMany:async({where})=>attrs.filter(x=>where.id.in.includes(x.id))},
};
test('power bank: capacity is a purchasable option', async()=>{
 await verifyCategoryVariantOptions(db,'pb',[{values:[{attributeId:'capacity',valueId:'v1'}]}]);
});
test('power bank: clothing size cannot be selected', async()=>{
 await assert.rejects(()=>verifyCategoryVariantOptions(db,'pb',[{values:[{attributeId:'size',valueId:'v2'}]}]),{code:'CATEGORY_VARIANT_MISMATCH',status:400});
});
test('shirt: color allowed and power-bank capacity rejected', async()=>{
 await verifyCategoryVariantOptions(db,'shirts',[{values:[{attributeId:'color',valueId:'v3'}]}]);
 await assert.rejects(()=>verifyCategoryVariantOptions(db,'shirts',[{values:[{attributeId:'capacity',valueId:'v4'}]}]),{code:'CATEGORY_VARIANT_MISMATCH'});
});
test('custom categories are extensible', async()=>{
 await verifyCategoryVariantOptions(db,'unknown',[{values:[{attributeId:'watts',valueId:'v5'}]}]);
});
test('informational specs are not forced into variants',()=>{
 assert.deepEqual(allowedAttributeNames(['LED Bulb','Electronics']),['wattage','color temperature','light color']);
});
