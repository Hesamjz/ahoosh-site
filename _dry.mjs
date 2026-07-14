import fs from 'fs';
const dir='src/content/blog';
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.mdx')); // top-level = English
const TOK={'ai operations':'ai','b2b':'b2b','operations':'ops','strategy':'strategy','business growth':'strategy','content':'content','seo':'content','marketing':'content','sales':'b2b','finance':'trade','fx & trade':'trade','trade':'trade','mena':'trade','emerging markets':'trade','distribution':'b2b','wholesale distribution':'b2b','linkedin':'content'};
const VALID=new Set(['ai','b2b','ops','strategy','trade','content']);
function fm(t){const m=t.match(/^---\n([\s\S]*?)\n---/);const b=m[1];const g=k=>{const mm=b.match(new RegExp('^'+k+':\\s*(.*)$','m'));return mm?mm[1].trim():''};return {title:g('title').replace(/^"|"$/g,''),desc:g('description').replace(/^"|"$/g,''),hero:g('heroImage').replace(/^"|"$/g,''),pub:g('pubDate'),tags:[...g('tags').matchAll(/"([^"]+)"/g)].map(x=>x[1])};}
let bad=[],chips={},n=0;
for(const f of files){const d=fm(fs.readFileSync(dir+'/'+f,'utf8'));n++;
  const cats=[];for(const t of d.tags){const k=TOK[t.toLowerCase()];if(k&&!cats.includes(k))cats.push(k);}
  const c=(cats.length?cats:['strategy']).slice(0,3);
  for(const x of c) if(!VALID.has(x)) bad.push([f,'bad cat '+x]);
  const chip=c.includes('ai')?'AI':c.includes('trade')?'Trade & FX':c.includes('ops')?'Operations':'Strategy';
  chips[chip]=(chips[chip]||0)+1;
  if(!d.title) bad.push([f,'no title']);
  if(!d.hero) bad.push([f,'no hero']);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d.pub)) bad.push([f,'bad pubDate '+d.pub]);
}
console.log('English posts:',n);
console.log('chip distribution:',JSON.stringify(chips));
console.log('issues:',bad.length); bad.slice(0,10).forEach(x=>console.log('  ',x.join(' :: ')));
