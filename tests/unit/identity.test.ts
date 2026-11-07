import {it,expect} from 'vitest';
import {parseReceipt} from '../../src/parser';
import {initialSettings} from '../../src/model';
const parse=(text:string)=>parseReceipt(text,initialSettings).receipt;
it.each(['Card No. 0042','Card No.: 0042','Card number\n0042','Last 4 digits: 0042','VISA ****\n0042','Card No.:\n**** 0042','●●●● 0042'])('maps explicit card layout %s',text=>expect(parse(text).last4).toBe('0042'));
it.each(['Receipt: 0042','2026','VISA\n2026','Card No.: 1234567890123456','Card No.: 0042\nCard No.: 4242','Expiry: 04/26','Card No.:\n4111\n1111\n1111\n1111'])('does not infer a card from %s',text=>expect(parse(text).last4).toBe(''));
it('reads explicitly labelled merchant and address beyond the first 16 header lines',()=>{const raw=Array.from({length:18},(_,i)=>'Receipt: demo-'+i).join('\n')+'\nMerchant Name:\nEXAMPLE QUAY CAFE\nAddress: 12 Fictional Quay\n# 02-03\nSingapore 123 456\nTOTAL SGD 3.00';expect(parse(raw)).toMatchObject({store:'EXAMPLE QUAY CAFE',address:'12 Fictional Quay, # 02-03, Singapore 123 456'});});
it('does not overwrite competing explicit merchants or addresses arbitrarily',()=>{const r=parse('Merchant Name: EXAMPLE A\nMerchant Name: EXAMPLE B\nAddress: 1 Fictional Way\nAddress: 2 Example Quay');expect(r.store).toBe('');expect(r.address).toBe('');});
it('recognizes Singapore road names and spaced unit/postal lines',()=>expect(parse('EXAMPLE SHOP\n12 Fictional Quay\n# 02-03\nSingapore 123 456\nTOTAL SGD 3.00').address).toBe('12 Fictional Quay, # 02-03, Singapore 123 456'));

it('does not mistake an address label for a merchant',()=>expect(parse('Address: 12 Fictional Quay\nTOTAL SGD 3.00').store).toBe(''));
