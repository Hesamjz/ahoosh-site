import { transform } from '@astrojs/compiler';
import fs from 'fs';
const code = fs.readFileSync('src/pages/articles/index.astro','utf8');
try{
  const r = await transform(code, { filename:'src/pages/articles/index.astro' });
  console.log('PARSE OK. diagnostics:', (r.diagnostics||[]).length);
  for(const d of (r.diagnostics||[])) console.log('  ['+d.severity+']', d.text);
  // also confirm the compiled output references our expression
  console.log('emits cardsHtml ref:', r.code.includes('cardsHtml'));
}catch(e){
  console.log('PARSE FAILED:', (e.message||String(e)).split('\n').slice(0,6).join('\n'));
  process.exit(1);
}
