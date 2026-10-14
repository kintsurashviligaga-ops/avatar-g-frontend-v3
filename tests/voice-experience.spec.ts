import { test, expect } from '@playwright/test';
import { FakeLive, openLiveCall } from './fixtures/liveVoice';

for (const [locale,title,personality,voice] of [
 ['ka','საუბრის ხმა და ხასიათი','ხასიათი','ხმა'],
 ['en','Conversation voice and style','Personality','Voice'],
 ['ru','Голос и стиль общения','Характер','Голос'],
] as const) {
 test(`v2 preferences ${locale}: user-scoped persistence and mobile layout`,async({page,baseURL},info)=>{
  await page.setViewportSize({width:390,height:844});
  const live=new FakeLive(); const spend=await openLiveCall(page,baseURL,live);
  await live.call('end_call');
  await expect(page.locator('html')).not.toHaveAttribute('data-live-call','1',{timeout:10000});
  await page.goto('/'+locale+'/dashboard?tool=chat');
  const menu=locale==='ka'?'მენიუ':locale==='en'?'Menu':'Меню';
  await page.getByRole('button',{name:menu,exact:true}).filter({visible:true}).first().click();
  await page.getByRole('button',{name:title,exact:true}).click();
  const panel=page.getByRole('region',{name:title});
  await expect(panel).toBeVisible();
  await panel.getByRole('combobox',{name:personality,exact:true}).selectOption('coach');
  await panel.getByRole('combobox',{name:voice,exact:true}).selectOption('Charon');
  expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.screenshot({path:info.outputPath('settings-'+locale+'.png')});
  await page.reload();
  await page.getByRole('button',{name:menu,exact:true}).filter({visible:true}).first().click();
  await page.getByRole('button',{name:title,exact:true}).click();
  await expect(page.getByRole('combobox',{name:personality,exact:true})).toHaveValue('coach');
  await expect(page.getByRole('combobox',{name:voice,exact:true})).toHaveValue('Charon');
  expect(spend).toEqual([]);
 });
}
test('spoken paid start and agent run blocked even with explicit spoken yes',async({page,baseURL})=>{
 const live=new FakeLive(),spend=await openLiveCall(page,baseURL,live);
 live.hear('კი, დაიწყე');
 for(const [name,args] of [['start_generation',{confirmed:'yes'}],['agent_task',{action:'start'}],['music_studio',{action:'start'}]] as const){
  expect(await live.call(name,args)).toMatchObject({ok:false,error:'ui_confirmation_required'});
 }
 expect(spend).toEqual([]);
});
