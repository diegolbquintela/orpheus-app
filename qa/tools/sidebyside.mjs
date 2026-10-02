// Compares two hosts (base vs compare) on the same cases. Needs --compare-url or QA_COMPARE_URL.
import { chromium } from 'playwright'; import fs from 'fs';
import { qaConfig } from "./config.mjs";
const CFG=qaConfig(import.meta.url);
if(!CFG.compareUrl){ console.error('sidebyside: pass --compare-url <url> (or QA_COMPARE_URL) for the second host'); process.exit(2); }
const OUT=CFG.out;
// 'compare' plays the old-host role (G* in output), 'base' the host under test (V*).
const HOSTS={compare:CFG.compareUrl,base:CFG.baseUrl};
const CASES={KO:{tickers:['KO'],weights:[100],start:'2023-01-03',end:'2024-12-31',capital:10000,contribution:500,frequency:'monthly'},
  PLTR_TQQQ:{tickers:['PLTR','TQQQ'],weights:[50,50],start:'2020-10-02',end:'2026-10-02',capital:1000,contribution:1000,frequency:'weekly'}};
const b=await chromium.launch(); const res={};
for (const [cn,inp] of Object.entries(CASES)) for (const [hn,url] of Object.entries(HOSTS)) for (const vp of ['desktop','mobile']) {
  const ctx=await b.newContext(vp==='desktop'?{viewport:{width:1280,height:900}}:{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(String(e)));
  await page.goto(url,{waitUntil:'networkidle'});
  const act=async l=>vp==='mobile'?l.tap():l.click();
  for(let i=1;i<inp.tickers.length;i++) await act(page.getByRole('button',{name:/Add name/}));
  for(let i=0;i<inp.tickers.length;i++){ const r=page.locator('.basket-row').nth(i).locator('input'); await act(r.nth(0)); await page.keyboard.type(inp.tickers[i]); await act(r.nth(1)); await page.keyboard.type(String(inp.weights[i])); }
  const d=page.locator('input[type=date]'); await d.nth(0).fill(inp.start); await d.nth(1).fill(inp.end);
  await act(page.locator('label:has-text("Starting capital") input')); await page.keyboard.type(String(inp.capital));
  await act(page.locator('label:has-text("Contribution") input')); await page.keyboard.type(String(inp.contribution));
  await page.locator('select').selectOption(inp.frequency);
  await act(page.getByRole('button',{name:'Compare plans'}));
  await page.waitForSelector('h2:has-text("Result")',{timeout:90000}); await page.waitForTimeout(1500);
  const tables=[]; for (const t of await page.locator('table').all()){ const rows=[]; for (const tr of await t.locator('tr').all()) rows.push((await tr.locator('th,td').allTextContents()).map(s=>s.trim())); tables.push(rows); }
  const yTicks=[]; for (const f of await page.locator('section[aria-live] figure').all()) yTicks.push(await f.locator('.recharts-yAxis .recharts-cartesian-axis-tick-value').allTextContents());
  const boxes={}; for (const [k,sel] of Object.entries({h1:'h1',intro:'header p.mt-8',hint:'fieldset p',button:'button[type=submit]',summary:'[data-testid=result-summary]',scroller:'[data-testid=results-scroll]'})) { const bb=await page.locator(sel).first().boundingBox(); boxes[k]=bb&&Object.fromEntries(Object.entries(bb).map(([a,v])=>[a,Math.round(v*10)/10])); }
  const text=(await page.locator('body').innerText());
  res[`${cn}|${hn}|${vp}`]={summary:await page.locator('[data-testid=result-summary]').innerText(),tables,yTicks,boxes,errs,textLen:text.length,text};
  await page.screenshot({path:`${OUT}/${cn}-${hn}-${vp}.png`,fullPage:true}); await ctx.close();
}
await b.close();
fs.writeFileSync(`${OUT}/sidebyside.json`,JSON.stringify(res,null,1));
for (const cn of Object.keys(CASES)) for (const vp of ['desktop','mobile']) { const g=res[`${cn}|compare|${vp}`], v=res[`${cn}|base|${vp}`];
  const diff=k=>JSON.stringify(g[k])===JSON.stringify(v[k])?'same':'DIFF';
  console.log(cn,vp,'summary',diff('summary'),'tables',diff('tables'),'yTicks',diff('yTicks'),'boxes',diff('boxes'),'text',diff('text'),'errs',g.errs.length,v.errs.length);
  if (diff('boxes')==='DIFF') console.log('  G',JSON.stringify(g.boxes),'\n  V',JSON.stringify(v.boxes));
  console.log('  summary:',v.summary,'| NLV row:',JSON.stringify(v.tables[0][2])); }
