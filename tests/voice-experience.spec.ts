import { test, expect } from '@playwright/test';
import { FakeLive, openLiveCall } from './fixtures/liveVoice';

for (const [locale,title,personality,voice] of [
 ['ka','საუბრის ხმა და ხასიათი','ხასიათი','ხმა'],
 ['en','Conversation voice and style','Personality','Voice'],
 ['ru','Голос и стиль общения','Характер','Голос'],
] as const) {
 for (const size of [{name:'mobile',width:390,height:844},{name:'desktop',width:1440,height:900}]) {
 test(`v2 preferences ${locale} ${size.name}: user-scoped persistence and viewport layout`,async({page,baseURL},info)=>{
  await page.setViewportSize({width:size.width,height:size.height});
  await page.addInitScript(() => localStorage.setItem('myavatar:tour-seen', '1'));
  const live=new FakeLive(); const spend=await openLiveCall(page,baseURL,live);
  await live.call('end_call');
  await expect(page.locator('html')).not.toHaveAttribute('data-live-call','1',{timeout:10000});
  await page.goto('/'+locale+'/dashboard?tool=chat');
  const menu=locale==='ka'?'მენიუ':locale==='en'?'Menu':'Меню';
  const settings=locale==='ka'?'პარამეტრები':locale==='en'?'Settings':'Настройки';
  const openPreferences=async()=>{
   // Reload may finish before the responsive header hydrates. A one-shot isVisible() skipped the mobile menu.
   await expect(page.locator('html')).toHaveAttribute('data-authed','1');
   if(size.name==='mobile') await page.getByRole('button',{name:menu,exact:true}).filter({visible:true}).click();
   const settingsButton=page.getByRole('button',{name:settings,exact:true}).filter({visible:true});
   await expect(settingsButton).toBeInViewport();
   await settingsButton.click();
   await page.getByRole('button',{name:title,exact:true}).click();
  };
  await openPreferences();
  const panel=page.getByRole('region',{name:title});
  await expect(panel).toBeVisible();
  await panel.getByRole('combobox',{name:personality,exact:true}).selectOption('coach');
  await panel.getByRole('combobox',{name:voice,exact:true}).selectOption('Charon');
  await expect.poll(async()=>panel.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&el.scrollWidth<=el.clientWidth+1;})).toBe(true);
  await page.screenshot({path:info.outputPath('settings-'+locale+'-'+size.name+'.png')});
  await page.reload();
  await openPreferences();
  await expect(page.getByRole('combobox',{name:personality,exact:true})).toHaveValue('coach');
  await expect(page.getByRole('combobox',{name:voice,exact:true})).toHaveValue('Charon');
  expect(spend).toEqual([]);
 });
 }
}
test('a spoken yes with nothing waiting for it starts nothing; the studio tools stay button-only',async({page,baseURL})=>{
 const live=new FakeLive(),spend=await openLiveCall(page,baseURL,live);
 live.hear('კი, დაიწყე');
 // GG 2026-10-18 („ხმით დაიწყოს"): the yes may start what waits for it; here nothing does, so nothing starts.
 expect(await live.call('start_generation',{confirmed:'yes'})).toMatchObject({ok:false});
 expect(await live.call('agent_task',{action:'start'})).toMatchObject({ok:false,error:'no_plan'});
 expect(await live.call('music_studio',{action:'start'})).toMatchObject({ok:false,error:'ui_confirmation_required'});
 await page.waitForTimeout(3_500);
 expect(spend).toEqual([]);
});
