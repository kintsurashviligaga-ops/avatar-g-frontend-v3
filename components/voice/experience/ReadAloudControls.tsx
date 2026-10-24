'use client';
import { useEffect, useId, useMemo, useState } from 'react';
import { useSpeechState } from '@/lib/speech/useSpeech';
import { createReadAloud, readerSnapshot, type ReaderSnapshot } from '@/lib/voice/experience/readAloud';
const COPY = {
 ka: { title:'წაკითხვა',all:'სრულად წაკითხვა',selected:'მონიშნულის წაკითხვა',pause:'პაუზა',resume:'გაგრძელება',stop:'გაჩერება',retry:'თავიდან სცადე',speed:'წაკითხვის სიჩქარე',error:'წაკითხვა ვერ დაიწყო. დაასრულეთ ხმოვანი ზარი ან სცადეთ ხელახლა.',idle:'მზადაა',loading:'მზადდება',playing:'იკითხება',paused:'შეჩერებულია',completed:'დასრულდა' },
 en: { title:'Read aloud',all:'Read complete response',selected:'Read selection',pause:'Pause',resume:'Resume',stop:'Stop',retry:'Try again',speed:'Reading speed',error:'Reading could not start. End the voice call or try again.',idle:'Ready',loading:'Preparing',playing:'Reading',paused:'Paused',completed:'Completed' },
 ru: { title:'Чтение вслух',all:'Прочитать полностью',selected:'Прочитать выделенное',pause:'Пауза',resume:'Продолжить',stop:'Остановить',retry:'Повторить',speed:'Скорость чтения',error:'Не удалось начать. Завершите голосовой звонок или повторите.',idle:'Готово',loading:'Подготовка',playing:'Чтение',paused:'Пауза',completed:'Завершено' },
};
export function ReadAloudControls({ text, selectedText, locale='ka' }: { text:string; selectedText?:string; locale?:'ka'|'en'|'ru' }) {
 const owner=`controls:${useId()}`;
 const speech=useSpeechState();
 const [speed,setSpeed]=useState(1);
 const [refused,setRefused]=useState(false);
 const reader=useMemo(()=>createReadAloud(owner,locale),[owner,locale]);
 useEffect(()=>()=>reader.stop(),[reader,text]);
 const state:ReaderSnapshot=refused?{status:'error',chunk:0,total:0,speed,error:'invalid_text'}:readerSnapshot(speech,owner,speed);
 const play=(t:string)=>setRefused(!reader.play(t,speed));
 const t=COPY[locale], button='min-h-[44px] rounded-lg border border-white/20 px-3 text-sm';
 return <section aria-label={t.title} data-live-guard="spend" className="flex flex-wrap items-center gap-2 text-white">
   <button className={button} type="button" onClick={()=>play(text)}>{t.all}</button>
   {selectedText && <button className={button} type="button" onClick={()=>play(selectedText)}>{t.selected}</button>}
   {state.status==='error'&&!refused
     ? <button className={button} type="button" onClick={reader.retry}>{t.retry}</button>
     : <button className={button} type="button" disabled={!['playing','loading','paused'].includes(state.status)}
         onClick={()=>state.status==='paused'?reader.resume():reader.pause()}>{state.status==='paused'?t.resume:t.pause}</button>}
   <button className={button} type="button" onClick={()=>{setRefused(false);reader.stop();}}>{t.stop}</button>
   <label>{t.speed}<select className="min-h-[44px] bg-black px-2 text-base" value={speed} onChange={e=>{const n=Number(e.target.value);setSpeed(n);reader.setSpeed(n);}}>
     {[0.5,0.75,1,1.25,1.5,2].map(n=><option key={n} value={n}>{n}×</option>)}
   </select></label>
   <span role="status">{state.status==='error'?t.error:t[state.status]}{state.total>0?` · ${state.chunk}/${state.total}`:''}</span>
 </section>;
}
