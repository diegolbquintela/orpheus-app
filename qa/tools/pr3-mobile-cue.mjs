import { chromium } from 'playwright'; import fs from 'fs';
import { qaConfig } from "./config.mjs";
const CFG=qaConfig(import.meta.url);
const OUT=CFG.out;
const browser=await chromium.launch();
const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}); const page=await ctx.newPage();
await page.goto(CFG.calculatorUrl,{waitUntil:'networkidle'});
const type=async(loc,t)=>{await loc.tap(); await page.keyboard.type(String(t));};
await page.getByRole('button',{name:/Add name/}).tap();
const rows=page.locator('.basket-row');
await type(rows.nth(0).locator('input').nth(0),'PLTR'); await type(rows.nth(0).locator('input').nth(1),'50');
await type(rows.nth(1).locator('input').nth(0),'TQQQ'); await type(rows.nth(1).locator('input').nth(1),'50');
const d=page.locator('input[type=date]'); await d.nth(0).fill('2020-10-02'); await d.nth(1).fill('2026-10-02');
await type(page.locator('label:has-text("Starting capital") input'),'1000'); await type(page.locator('label:has-text("Contribution") input'),'1000');
await page.locator('select').selectOption('weekly');
await page.getByRole('button',{name:'Compare plans'}).tap();
await page.waitForSelector('h2:has-text("Result")',{timeout:90000}); await page.waitForTimeout(1500);
const sc=page.locator('[data-testid=results-scroll]'); await sc.scrollIntoViewIfNeeded();
const cue=page.locator('section[aria-live] div.flex.items-center.justify-between');
const st=async()=>({cueText:await cue.innerText(), cueVisible:await cue.isVisible(), dots:await cue.locator('i').count(), dotClasses:await Promise.all((await cue.locator('i').all()).map(i=>i.getAttribute('class'))), swipeCue:await page.getByText('Swipe for DCA →').count(), swipeVisible:await page.getByText('Swipe for DCA →').isVisible().catch(()=>false), fade:await page.locator('section[aria-live] div.pointer-events-none.absolute').count(),
  headsRaw:await sc.locator('thead th').allTextContents(), labelBox:await sc.locator('tbody tr').nth(2).locator('th').boundingBox(), labelText:await sc.locator('tbody tr').nth(2).locator('th').innerText(), dcaHead:await sc.locator('thead th').nth(2).boundingBox(), lumpHead:await sc.locator('thead th').nth(1).boundingBox(), dcaMwr:await sc.locator('tbody tr').nth(2).locator('td').nth(1).boundingBox()});
const out={before:await st()};
await cue.screenshot({path:`${OUT}/D-cue-before.png`}); await page.screenshot({path:`${OUT}/D2-mobile-before.png`});
// partial swipe (mid) to verify pinning mid-scroll
const cdp=await ctx.newCDPSession(page); const b=await sc.boundingBox(); const y=b.y+120;
async function swipe(x0,x1){ await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x0,y}]}); for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x0+(x1-x0)*i/10,y}]}); await page.waitForTimeout(16);} await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await page.waitForTimeout(1000); }
await swipe(300,260); out.mid=await st(); await page.screenshot({path:`${OUT}/D2-mobile-mid-swipe.png`});
await swipe(340,40); out.end=await st(); await page.screenshot({path:`${OUT}/D2-mobile-after-swipe.png`}); await cue.screenshot({path:`${OUT}/D-cue-after.png`});
await swipe(40,340); out.back=await st(); await page.screenshot({path:`${OUT}/D2-mobile-swipe-back.png`});
fs.writeFileSync(`${OUT}/D-mobile-cue.json`,JSON.stringify(out,null,1)); console.log(JSON.stringify(out,null,1)); await browser.close();
