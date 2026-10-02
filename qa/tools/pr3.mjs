// Real-user interactions only: locator.click, keyboard.type, fill on visible inputs, selectOption, touch via CDP.
// No page.evaluate / no DOM writes. Reads use locator text/attributes/boundingBox.
import { chromium } from 'playwright';
import fs from 'fs';
import { qaConfig } from "./config.mjs";
const CFG=qaConfig(import.meta.url);
const URL=CFG.baseUrl;
const OUT=CFG.out;
const fx=JSON.parse(fs.readFileSync(CFG.fixtures,'utf8'));
const R={};
const browser=await chromium.launch();
const DESK={viewport:{width:1280,height:900}};
const MOB={viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true};
async function open(opts=DESK){
  const ctx=await browser.newContext(opts); const page=await ctx.newPage();
  const log={api:[],pageErrors:[]};
  page.on('pageerror',e=>log.pageErrors.push(String(e)));
  page.on('response',async r=>{ if(r.url().includes('/api/chart')){ let b=null; try{b=await r.json()}catch{ /* non-JSON body: keep null */ }; log.api.push({url:r.url(),status:r.status(),body:b}); }});
  await page.goto(URL,{waitUntil:'networkidle'}); return {ctx,page,log};
}
async function typeInto(page, loc, text, tap=false){ await (tap? loc.tap() : loc.click()); await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace'); await page.keyboard.type(String(text)); }
async function fillForm(page, inp, tap=false){
  for(let i=1;i<inp.tickers.length;i++){ const b=page.getByRole('button',{name:/Add name/}); await (tap? b.tap() : b.click()); }
  for(let i=0;i<inp.tickers.length;i++){ const r=page.locator('.basket-row').nth(i).locator('input');
    await typeInto(page, r.nth(0), inp.tickers[i], tap); await typeInto(page, r.nth(1), inp.weights[i], tap); }
  const d=page.locator('input[type=date]');
  await d.nth(0).fill(inp.start); await d.nth(1).fill(inp.end);
  await typeInto(page, page.locator('label:has-text("Starting capital") input'), inp.capital, tap);
  await typeInto(page, page.locator('label:has-text("Contribution") input'), inp.contribution, tap);
  await page.locator('select').selectOption(inp.frequency);
  return { start: await d.nth(0).inputValue(), end: await d.nth(1).inputValue() };
}
async function submit(page,tap=false){
  const b=page.getByRole('button',{name:'Compare plans'}); await (tap? b.tap() : b.click());
  await Promise.race([page.waitForSelector('h2:has-text("Result")',{timeout:90000}),page.waitForSelector('[role=alert]',{timeout:90000})]).catch(()=>{});
  await page.waitForTimeout(1500);
}
async function scrape(page){
  const tables=[]; const tl=page.locator('table'); const n=await tl.count();
  for(let i=0;i<n;i++){ const rows=tl.nth(i).locator('tr'); const rc=await rows.count(); const t=[];
    for(let j=0;j<rc;j++) t.push((await rows.nth(j).locator('th,td').allInnerTexts()).map(s=>s.trim())); tables.push(t); }
  const summary=await page.locator('[data-testid=result-summary]').allInnerTexts();
  const alert=await page.locator('[role=alert]').allInnerTexts();
  const figs=page.locator('section[aria-live] figure'); const fc=await figs.count(); const charts=[];
  for(let i=0;i<fc;i++){ const f=figs.nth(i); charts.push({caption:(await f.locator('figcaption').innerText()).trim(),
    yTicks:await f.locator('.recharts-yAxis .recharts-cartesian-axis-tick-value').allTextContents(),
    xTicks:await f.locator('.recharts-xAxis .recharts-cartesian-axis-tick-value').allTextContents(),
    lines:await f.locator('.recharts-line path.recharts-curve').count()}); }
  const notes=await page.locator('section[aria-live] p.text-muted, section[aria-live] p.text-xs').allInnerTexts();
  const body=await page.locator('body').innerText();
  const meta=await page.locator('meta[name=description]').getAttribute('content');
  const title=await page.title();
  return {tables,summary,alert,charts,notes,body,meta,title};
}

// A: fixture cases (desktop)
for(const f of fx){
  const {ctx,page,log}=await open();
  if(f.kind==='content'){ R[f.id]={initial:await scrape(page),html:await page.content()}; await page.screenshot({path:`${OUT}/A-${f.id}-initial.png`,fullPage:true}); await ctx.close(); continue; }
  const entered=await fillForm(page,f.inputs);
  await page.screenshot({path:`${OUT}/A-${f.id}-inputs.png`,fullPage:true});
  await submit(page);
  R[f.id]={entered,...await scrape(page),pageErrors:log.pageErrors,api:log.api.map(a=>({url:a.url,status:a.status,error:a.body?.error,currency:a.body?.currency,exchange:a.body?.exchange}))};
  fs.writeFileSync(`${OUT}/A-${f.id}-api.json`,JSON.stringify(log.api));
  await page.screenshot({path:`${OUT}/A-${f.id}-result.png`,fullPage:true}); await ctx.close();
}
// B/C: PLTR/TQQQ desktop
const B={tickers:['PLTR','TQQQ'],weights:[50,50],start:'2020-10-02',end:'2026-10-02',capital:1000,contribution:1000,frequency:'weekly'};
{ const {ctx,page,log}=await open(); const entered=await fillForm(page,B); await page.screenshot({path:`${OUT}/B-inputs.png`,fullPage:true});
  await submit(page); R.B={entered,...await scrape(page),pageErrors:log.pageErrors,api:log.api.map(a=>({url:a.url,status:a.status,error:a.body?.error,currency:a.body?.currency,exchange:a.body?.exchange,bars:a.body?.bars?.length}))};
  fs.writeFileSync(`${OUT}/B-api.json`,JSON.stringify(log.api));
  await page.screenshot({path:`${OUT}/B-C-result-desktop.png`,fullPage:true});
  const charts=page.locator('section[aria-live] figure'); for(let i=0;i<await charts.count();i++) await charts.nth(i).screenshot({path:`${OUT}/C-chart-${i}.png`});
  await page.locator('[data-testid=results-scroll]').screenshot({path:`${OUT}/C-table-desktop.png`});
  await ctx.close(); }
// D: mobile touch
{ const {ctx,page,log}=await open(MOB);
  const initBoxes=[]; for(const l of await page.locator('input,select,button').all()){ const b=await l.boundingBox(); if(b) initBoxes.push({l:b.x,r:b.x+b.width,h:b.height}); }
  await fillForm(page,B,true); await submit(page,true);
  const D={pageErrors:log.pageErrors, initOffscreen:initBoxes.filter(b=>b.l<0||b.r>390.5).length};
  const sc=page.locator('[data-testid=results-scroll]'); await sc.scrollIntoViewIfNeeded(); await page.waitForTimeout(500);
  const _hint=page.locator('section[aria-live] .sm\\:hidden span'); 
  const cueRow=page.locator('section[aria-live] div.sm\\:hidden').first();
  const read=async(tag)=>{ const label=sc.locator('tbody tr').first().locator('th'); const lumpCell=sc.locator('tbody tr').first().locator('td').nth(0); const dcaCell=sc.locator('tbody tr').first().locator('td').nth(1);
    const dcaHead=sc.locator('thead th').nth(2); const lumpHead=sc.locator('thead th').nth(1); const scBox=await sc.boundingBox();
    return {tag, scBox, label:await label.boundingBox(), labelText:await label.innerText(), lumpCell:await lumpCell.boundingBox(), dcaCell:await dcaCell.boundingBox(), dcaCellText:await dcaCell.innerText(), lumpHead:await lumpHead.boundingBox(), dcaHead:await dcaHead.boundingBox(), dcaHeadText:await dcaHead.innerText(),
      cueText:(await cueRow.innerText().catch(()=>null)), dots:await cueRow.locator('i').count(), dotClasses:await Promise.all((await cueRow.locator('i').all()).map(i=>i.getAttribute('class'))),
      fadeVisible:await page.locator('section[aria-live] div.pointer-events-none.absolute').count()}; };
  D.before=await read('before'); await page.screenshot({path:`${OUT}/D-mobile-before-swipe.png`}); await sc.screenshot({path:`${OUT}/D-table-before-swipe.png`});
  // real touch swipe right-to-left on the table via CDP touch events
  const cdp=await ctx.newCDPSession(page); const b=D.before.scBox; const y=b.y+b.height/2;
  const x0=b.x+b.width-30, x1=b.x+40; const steps=12;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x0,y}]});
  for(let i=1;i<=steps;i++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x0+(x1-x0)*i/steps,y}]}); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await page.waitForTimeout(1200);
  D.after1=await read('after-swipe-1');
  await page.screenshot({path:`${OUT}/D-mobile-after-swipe.png`}); await sc.screenshot({path:`${OUT}/D-table-after-swipe.png`});
  // second swipe in case first didn't reach end
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x0,y}]});
  for(let i=1;i<=steps;i++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x0+(x1-x0)*i/steps,y}]}); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await page.waitForTimeout(1200);
  D.after2=await read('after-swipe-2'); await sc.screenshot({path:`${OUT}/D-table-after-swipe-2.png`});
  D.full=await scrape(page); await page.screenshot({path:`${OUT}/D-mobile-result-full.png`,fullPage:true});
  // page horizontal overflow: any control outside viewport after results
  const boxes=[]; for(const l of await page.locator('input,select,button').all()){ const bb=await l.boundingBox(); if(bb) boxes.push({l:bb.x,r:bb.x+bb.width}); }
  D.afterOffscreen=boxes.filter(b=>b.l<0||b.r>390.5).length;
  R.D=D; await ctx.close(); }
// E + DCA-06 extra states: initial page, plus error states
{ const {ctx,page}=await open(); R.E={initial:await scrape(page), hint:await page.locator('fieldset p').allInnerTexts(), intro:await page.locator('header p.mt-8').innerText()};
  await page.screenshot({path:`${OUT}/E-initial.png`,fullPage:true});
  await page.getByRole('button',{name:'Compare plans'}).click(); await page.waitForTimeout(500); R.E.blank=await scrape(page); await ctx.close(); }
for (const [k,t] of [['nonsense','ZZQXJ9'],['bse','RELIANCE.BO'],['lse2','BARC.L']]) { const {ctx,page}=await open();
  await fillForm(page,{tickers:[t],weights:[100],start:'2023-01-03',end:'2024-12-31',capital:10000,contribution:500,frequency:'monthly'}); await submit(page);
  R['E_'+k]=await scrape(page); await page.screenshot({path:`${OUT}/E-state-${k}.png`,fullPage:true}); await ctx.close(); }
fs.writeFileSync(`${OUT}/observed.json`,JSON.stringify(R,null,1));
await browser.close(); console.log('done');
