// Normalize printed headings only; never repair digits or derive a total from items.
export function normalizePaymentLabel(text:string):string {
 return text.normalize('NFKC').toLowerCase()
  .replace(/\bt[o0]ta[l1i!|](?=\s|$|[:.=])/g,'total')
  .replace(/\((?:sgd|usd|jpy|s\$|sg\$|us\$|\$)\)/g,' ')
  .replace(/\(?(?:incl\.?|including|inclusive(?:\s+of)?)\s+(?:gst|tax)\)?/g,' ')
  .replace(/\((?:gst|tax)\s+(?:incl\.?|included|inclusive)\)/g,' ')
  .replace(/\b(?:sgd|usd|jpy)\b|(?:us|sg|s)?\$/g,' ')
  .replace(/[:：=]/g,' ').replace(/^[|*._-]+|[|*._-]+$/g,' ').replace(/\s+/g,' ').trim();
}
export function isPaymentLabel(text:string):boolean {
 const label=normalizePaymentLabel(text);
 return /^(?:(?:grand|net|nett)\s+)?total(?:\s+(?:amount|amt\.?))?(?:\s+(?:due|paid|payable))?$/.test(label)
  ||/^(?:amount (?:due|paid|payable)|balance due|payment total)$/.test(label)
  ||/^(?:card payment|payment by)(?:\s+(?:visa|master\s*card|amex|jcb|unionpay))?$/.test(label);
}
