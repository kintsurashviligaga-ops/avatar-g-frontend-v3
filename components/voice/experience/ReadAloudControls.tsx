'use client';
import { useEffect, useMemo, useState } from 'react';
import { browserReaderDeps, createReadAloud, type ReaderSnapshot } from '@/lib/voice/experience/readAloud';
const COPY = {
 ka: { title:'წაკითხვა',all:'სრულად წაკითხვა',selected:'მონიშნულის წაკითხვა',pause:'პაუზა',resume:'გაგრძელება',stop:'გაჩერება',speed:'წაკითხვის სიჩქარე',error:'წაკითხვა ვერ დაიწყო. დაასრულეთ ხმოვანი ზარი ან სცადეთ ხელახლა.',idle:'მზადაა',loading:'მზადდება',playing:'იკითხება',paused:'შეჩერებულია',completed:'დასრულდა' },
 en: { title:'Read aloud',all:'Read complete response',selected:'Read selection',pause:'Pause',resume:'Resume',stop:'Stop',speed:'Reading speed',error:'Reading could not start. End the voice call or try again.',idle:'Ready',loading:'Preparing',playing:'Reading',paused:'Paused',completed:'Completed' },
 ru: { title:'Чтение вслух',all:'Прочитать полностью',selected:'Прочитать выделенное',pause:'Пауза',resume:'Продолжить',stop:'Остановить',speed:'Скорость чтения',error:'Не удалось начать. Завершите голосовой звонок или повторите.',idle:'Готово',loading:'Подготовка',playing:'Чтение',paused:'Пауза',completed:'Завершено' },
};
export function ReadAloudControls({ text, selectedText, locale='ka' }: { text:string; selectedText?:string; locale?:'ka'|'en'|'ru' }) {
 const [state,setState]=useState<ReaderSnapshot>({status:'idle',chunk:0,total:0,speed:1});
 const reader=useMemo(()=>createReadAloud(browserReaderDeps(locale),setState),[locale]);
 useEffect(()=>()=>reader.dispose(),[reader,text]);
 const t=COPY[locale], button='min-h-[44px] rounded-lg border border-white/20 px-3 text-sm';
 return <section aria-label={t.title} data-live-guard="spend" className="flex flex-wrap items-center gap-2 text-white">
   <button className={button} type="button" onClick={()=>void reader.play(text)}>{t.all}</button>
   {selectedText && <button className={button} type="button" onClick={()=>void reader.play(selectedText)}>{t.selected}</button>}
   <button className={button} type="button" disabled={!['playing','loading','paused'].includes(state.status)}
     onClick={()=>state.status==='paused'?void reader.resume():reader.pause()}>{state.status==='paused'?t.resume:t.pause}</button>
   <button className={button} type="button" onClick={reader.stop}>{t.stop}</button>
   <label>{t.speed}<select className="min-h-[44px] bg-black px-2 text-base" value={state.speed} onChange={e=>reader.setSpeed(Number(e.target.value))}>
     {[0.5,0.75,1,1.25,1.5,2].map(n=><option key={n} value={n}>{n}×</option>)}
   </select></label>
   <span role="status">{state.status==='error'?t.error:t[state.status]}{state.total>0?` · ${state.chunk}/${state.total}`:''}</span>
 </section>;
}
