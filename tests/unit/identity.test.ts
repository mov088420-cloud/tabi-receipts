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

it.each(['VISA ※※※※0042','Card No.: ※※※※ 0042','MASTERCARD ※※※※\n0042','Card payment VISA ∗∗∗∗0042','VISA ＊＊＊＊0042','Card No.:\n※※※※\n0042'])('recognizes equivalent mask symbols %s',text=>expect(parse(text).last4).toBe('0042'));
it('does not guess damaged digits or resolve conflicting masked tails',()=>{expect(parse('VISA ※※※※0O42').last4).toBe('');expect(parse('VISA ※※※※0042\nVISA ****4242').last4).toBe('');expect(parse('VISA ※4111111111111111').last4).toBe('');});
it('prefers the printed restaurant above its address to logo noise',()=>expect(parse('FXXL XYZ\nEXAMPLE RESTAURANT & BAR\n12 Fictional Quay\nSingapore 123456\nTOTAL SGD 20.00').store).toBe('EXAMPLE RESTAURANT & BAR'));
it('joins a wrapped venue descriptor to its printed name',()=>expect(parse('LOGO NOISE\nFICTIONAL HARBOUR\nRESTAURANT & BAR\nAddress: 12 Fictional Quay\nTOTAL SGD 20.00').store).toBe('FICTIONAL HARBOUR RESTAURANT & BAR'));
it('keeps explicit merchant names ahead of contextual guesses',()=>expect(parse('Merchant Name: EXAMPLE SHOP\nANOTHER CAFE\n12 Fictional Quay\nTOTAL SGD 20.00').store).toBe('EXAMPLE SHOP'));
it('does not choose a legal entity or mall as the restaurant',()=>{expect(parse('EXAMPLE RESTAURANT\nFOOD BAR PTE LTD\n12 Fictional Quay\nTOTAL SGD 20.00').store).toBe('EXAMPLE RESTAURANT');expect(parse('EXAMPLE SHOP\nCOFFEE MALL\n12 Fictional Quay\nTOTAL SGD 20.00').store).toBe('EXAMPLE SHOP');});
it('leaves competing venue names unresolved',()=>expect(parse('EXAMPLE CAFE\n12 Fictional Quay\nANOTHER BAR\n15 Example Road\nTOTAL SGD 20.00').store).toBe(''));
it('uses the extracted masked tail for payer matching without resolving duplicate owners',()=>{const settings={...initialSettings,cards:[{id:'demo',brand:'VISA',last4:'0042',payer:'wife' as const,alias:'test'}]};expect(parseReceipt('VISA ※※※※0042',settings).receipt.payer).toBe('wife');expect(parseReceipt('VISA ※※※※0042',{...settings,cards:[...settings.cards,{...settings.cards[0],id:'other',payer:'self'}]}).receipt.payer).toBe('unknown');});
