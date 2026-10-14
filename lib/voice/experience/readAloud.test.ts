import { createReadAloud, faithfulChunks, type ReaderDeps } from './readAloud';
function harness() {
 const audio={src:'',playbackRate:1,onended:null as null|(()=>void),onerror:null as null|(()=>void),play:jest.fn(async()=>{}),pause:jest.fn()};
 const revoke=jest.fn(),synthesize=jest.fn(async(text:string)=>'blob:'+text.slice(0,8));
 const deps:ReaderDeps={audio:()=>audio as unknown as HTMLAudioElement,revoke,synthesize,liveActive:()=>false};
 return {audio,revoke,synthesize,deps,reader:createReadAloud(deps,jest.fn())};
}
const tick=async()=>{await Promise.resolve();await Promise.resolve();};
test('faithful chunks rejoin byte-exactly and never split a surrogate pair',()=>{
 const text=' 😀 ქართული\n'+ 'a'.repeat(700)+' https://example.test **x**';
 const chunks=faithfulChunks(text);expect(chunks.join('')).toBe(text);
 for(const chunk of chunks) expect(chunk).not.toMatch(/[\uD800-\uDBFF]$/);
});
test('full text is sequentially read without silent truncation',async()=>{
 const h=harness(),text='a'.repeat(1300);const p=h.reader.play(text);
 await tick();expect(h.synthesize).toHaveBeenCalledTimes(1);
 h.audio.onended?.();await tick();h.audio.onended?.();await tick();h.audio.onended?.();await p;
 expect(h.synthesize.mock.calls.map(c=>c[0]).join('')).toBe(text);expect(h.reader.snapshot().status).toBe('completed');expect(h.revoke).toHaveBeenCalledTimes(3);
});
test('pause/resume/speed do not re-synthesize or restart the text',async()=>{
 const h=harness(),p=h.reader.play('Hello.');await tick();h.reader.pause();
 expect(h.reader.snapshot().status).toBe('paused');h.reader.setSpeed(1.5);expect(h.audio.playbackRate).toBe(1.5);
 await h.reader.resume();expect(h.reader.snapshot().status).toBe('playing');expect(h.synthesize).toHaveBeenCalledTimes(1);
 h.audio.onended?.();await p;
});
test('stop during synthesis fences late audio and revokes its URL',async()=>{
 const h=harness();let resolve!:(s:string)=>void;h.deps.synthesize=jest.fn((_t,signal)=>{expect(signal.aborted).toBe(false);return new Promise(r=>{resolve=r;});});
 const p=h.reader.play('Old');h.reader.stop();resolve('blob:late');await p;
 expect(h.audio.play).toHaveBeenCalledTimes(1);expect(h.revoke).toHaveBeenCalledWith('blob:late');expect(h.reader.snapshot().status).toBe('idle');
});
test('pause during loading holds audio until explicit resume',async()=>{
 const h=harness();const p=h.reader.play('Held');h.reader.pause();await tick();
 expect(h.audio.play).toHaveBeenCalledTimes(1);await h.reader.resume();await tick();expect(h.audio.play).toHaveBeenCalledTimes(2);
 h.audio.onended?.();await p;
});
test('failed chunk surfaces error without skipping content',async()=>{
 const h=harness();h.synthesize.mockRejectedValueOnce(Error('offline'));await h.reader.play('a'.repeat(1300));
 expect(h.reader.snapshot().status).toBe('error');expect(h.synthesize).toHaveBeenCalledTimes(1);
});
test('live call blocks reader before synthesis',async()=>{
 const h=harness();h.deps.liveActive=()=>true;await h.reader.play('No overlap');
 expect(h.synthesize).not.toHaveBeenCalled();expect(h.reader.snapshot().error).toBe('live_call_active');
});
test('microphone activation stops read without canceling durable jobs',async()=>{
 const h=harness();const p=h.reader.play('Read');await tick();
 window.dispatchEvent(new CustomEvent('myavatar:mic-release',{detail:{reason:'live'}}));await p;
 expect(h.reader.snapshot().status).toBe('idle');expect(h.audio.pause).toHaveBeenCalled();
});
test('new reader stops old reader',async()=>{
 const a=harness(),b=harness();const old=a.reader.play('one');await tick();const next=b.reader.play('two');await tick();
 await old;expect(a.reader.snapshot().status).toBe('idle');b.reader.stop();await next;
});
