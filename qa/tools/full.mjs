import { chromium } from 'playwright';
import fs from 'fs';
import { qaConfig } from "./config.mjs";
const CFG=qaConfig(import.meta.url);
const URL=CFG.baseUrl;
const OUT=CFG.out;
const R={};
const browser=await chromium.launch();
const desk={ viewport:{width:1280,height:900} };
async function open(ctxOpts=desk){
  const ctx=await browser.newContext(ctxOpts); const page=await ctx.newPage();
  const log={api:[],pageErrors:[],console:[]};
  page.on('pageerror',e=>log.pageErrors.push(String(e)));
  page.on('console',m=>{ if(m.type()==='error') log.console.push(m.text()); });
  page.on('response',async r=>{ if(r.url().includes('/api/chart')){ let b=null; try{b=await r.json()}catch{ /* non-JSON body: keep null */ }; log.api.push({url:r.url(),status:r.status(),body:b}); }});
  await page.goto(URL,{waitUntil:'networkidle'}); return {ctx,page,log};
}
async function fill(page,{rows=[],start='',end='',capital='',contribution='',frequency=''}){
  for(let i=1;i<rows.length;i++) await page.getByRole('button',{name:/Add name/}).click();
  for(let i=0;i<rows.length;i++){ const r=page.locator('.basket-row').nth(i).locator('input'); await r.nth(0).fill(rows[i][0]); await r.nth(1).fill(String(rows[i][1])); }
  const d=page.locator('input[type=date]'); if(start) await d.nth(0).fill(start); if(end) await d.nth(1).fill(end);
  if(capital!=='') await page.locator('label:has-text("Starting capital") input').fill(String(capital));
  if(contribution!=='') await page.locator('label:has-text("Contribution") input').fill(String(contribution));
  if(frequency) await page.locator('select').selectOption(frequency);
}
async function submit(page, tap=false){
  const b=page.getByRole('button',{name:'Compare plans'}); await (tap? b.tap() : b.click());
  await Promise.race([page.waitForSelector('h2:has-text("Result")',{timeout:60000}),page.waitForSelector('[role=alert]',{timeout:60000})]).catch(()=>{});
  await page.waitForTimeout(1200);
  return page.evaluate(()=>({
    alert:[...document.querySelectorAll('[role=alert]')].map(e=>e.innerText),
    hasResult:!!document.querySelector('section[aria-live]'),
    tables:[...document.querySelectorAll('table')].map(t=>[...t.querySelectorAll('tr')].map(tr=>[...tr.children].map(c=>c.innerText.trim()))),
    note:(()=>{const p=document.querySelector('section[aria-live] p.max-w-xl');return p?p.innerText:null})(),
    chart:{svg:document.querySelectorAll('section[aria-live] .recharts-surface').length, lines:document.querySelectorAll('section[aria-live] .recharts-line path.recharts-curve').length, legend:[...document.querySelectorAll('section[aria-live] figcaption span')].map(s=>s.innerText)},
  }));
}
const base={start:'2023-01-03',end:'2024-12-31',capital:10000,contribution:500,frequency:'monthly'};

// 1 & 7 initial
{ const {ctx,page,log}=await open();
  const btn=page.getByRole('button',{name:'Compare plans'});
  R.c1={title:await page.title(), btnVisible:await btn.isVisible(), btnText:await btn.innerText(), h1:await page.locator('h1').innerText(), pageErrors:log.pageErrors};
  R.c7init={text:await page.evaluate(()=>document.body.innerText), html:await page.content(), buttons:await page.locator('button').allInnerTexts()};
  await page.screenshot({path:`${OUT}/c01-load.png`,fullPage:true});
  // 2 blank
  const r=await submit(page); R.c2={...r, apiCalls:log.api.length, pageErrors:log.pageErrors};
  await page.screenshot({path:`${OUT}/c02-blank.png`,fullPage:true}); await ctx.close(); }

// 3 + 5 + 8 monthly AAPL
for (const freq of ['monthly','weekly']) { const {ctx,page,log}=await open();
  await fill(page,{...base,frequency:freq,rows:[['AAPL',100]]});
  const r=await submit(page); R[`aapl_${freq}`]={...r,pageErrors:log.pageErrors,apiStatus:log.api.map(a=>a.status)};
  fs.writeFileSync(`${OUT}/aapl-${freq}-api.json`,JSON.stringify(log.api));
  await page.screenshot({path:`${OUT}/c03-c08-aapl-${freq}.png`,fullPage:true}); await ctx.close(); }

// 4 basket not summing to 100
{ const {ctx,page,log}=await open();
  await fill(page,{...base,rows:[['KO',60],['JNJ',60]]});
  const r=await submit(page); R.c4={...r,pageErrors:log.pageErrors};
  fs.writeFileSync(`${OUT}/c04-api.json`,JSON.stringify(log.api));
  await page.screenshot({path:`${OUT}/c04-basket-120.png`,fullPage:true}); await ctx.close(); }

// 6 refusals and CA
for (const t of ['VOD.L','BARC.L','RY.TO','SHOP.TO']) { const {ctx,page,log}=await open();
  await fill(page,{...base,rows:[[t,100]]});
  const r=await submit(page); R[`c6_${t}`]={...r,pageErrors:log.pageErrors,api:log.api.map(a=>({status:a.status,error:a.body?.error,currency:a.body?.currency,exchange:a.body?.exchange,bars:a.body?.bars?.length}))};
  await page.screenshot({path:`${OUT}/c06-${t}.png`,fullPage:true}); await ctx.close(); }

// 9 broken inputs
const broken={
  emptyTicker:{...base,rows:[['',100]]},
  nonsense:{...base,rows:[['ZZQXJ9',100]]},
  endBeforeStart:{...base,start:'2024-12-31',end:'2023-01-03',rows:[['AAPL',100]]},
};
for (const [k,v] of Object.entries(broken)) { const {ctx,page,log}=await open();
  await fill(page,v); const r=await submit(page);
  const stillUsable=await page.getByRole('button',{name:'Compare plans'}).isEnabled();
  R[`c9_${k}`]={...r,pageErrors:log.pageErrors,console:log.console,api:log.api.map(a=>({url:a.url,status:a.status,error:a.body?.error})),stillUsable};
  await page.screenshot({path:`${OUT}/c09-${k}.png`,fullPage:true}); await ctx.close(); }

// 10 mobile
{ const {ctx,page,log}=await open({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const metrics=()=>page.evaluate(()=>{ const vw=document.documentElement.clientWidth;
    const els=[...document.querySelectorAll('input,select,button')].map(e=>{const b=e.getBoundingClientRect();return {tag:e.tagName,label:e.closest('label')?.innerText.split('\n')[0]||e.innerText||e.getAttribute('aria-label'),left:Math.round(b.left),right:Math.round(b.right),w:Math.round(b.width),h:Math.round(b.height)};});
    return {vw, scrollW:document.documentElement.scrollWidth, bodyScrollW:document.body.scrollWidth, offscreen:els.filter(e=>e.left<0||e.right>vw+0.5), els}; });
  R.c10={before:await metrics()};
  await page.screenshot({path:`${OUT}/c10-mobile-initial.png`,fullPage:true});
  await fill(page,{...base,rows:[['KO',50],['JNJ',50]]});
  await page.screenshot({path:`${OUT}/c10-mobile-filled.png`,fullPage:true});
  const r=await submit(page,true);
  R.c10.after=await metrics(); R.c10.result={hasResult:r.hasResult,alert:r.alert,tables:r.tables}; R.c10.pageErrors=log.pageErrors;
  R.c10.tableWrapScroll=await page.evaluate(()=>[...document.querySelectorAll('section[aria-live] .overflow-x-auto')].map(d=>({client:d.clientWidth,scroll:d.scrollWidth})));
  await page.screenshot({path:`${OUT}/c10-mobile-result.png`,fullPage:true}); await ctx.close(); }

fs.writeFileSync(`${OUT}/observed.json`,JSON.stringify(R,null,1));
await browser.close(); console.log('done');
