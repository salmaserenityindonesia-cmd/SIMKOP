const fs = require('fs');
let content = fs.readFileSync('c:/SIMKOP/src/services/koperasiService.ts', 'utf8');

const helper = `function shouldFallback(e: any): boolean {
  if (!e) return false;
  const msg = String(e.message || "").toLowerCase();
  return e.code === "42P01" || msg.includes("schema cache") || msg.includes("fetch") || msg.includes("network") || msg.includes("failed to fetch");
}
`;

content = content.replace(/error\.code === '42P01' \|\| error\.message\.includes\('schema cache'\)/g, 'shouldFallback(error)');
content = content.replace(/purchaseError\.code === '42P01' \|\| purchaseError\.message\.includes\('schema cache'\)/g, 'shouldFallback(purchaseError)');
content = content.replace(/itemsError\.code === '42P01' \|\| itemsError\.message\.includes\('schema cache'\)/g, 'shouldFallback(itemsError)');
content = content.replace(/txError\.code === '42P01' \|\| txError\.message\.includes\('schema cache'\)/g, 'shouldFallback(txError)');
content = content.replace(/anggotaError\.code === '42P01' \|\| anggotaError\.message\.includes\('schema cache'\)/g, 'shouldFallback(anggotaError)');

content = helper + '\n' + content;

fs.writeFileSync('c:/SIMKOP/src/services/koperasiService.ts', content);
