import os,re,sys,json
root=sys.argv[1]; os.chdir(root)
IMP=re.compile(r"""(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)""",re.S)
EXTS=['.ts','.tsx','.js','.mjs','.jsx','/index.ts','/index.tsx','/index.js']
def resolve(spec,frm):
    if spec.startswith('@/'): base=spec[2:]
    elif spec.startswith('.'): base=os.path.normpath(os.path.join(os.path.dirname(frm),spec))
    else: return None
    if os.path.isfile(base): return base
    for e in EXTS:
        if os.path.isfile(base+e): return base+e
    return None
cache={}
def deps(f):
    if f in cache: return cache[f]
    try: s=open(f,encoding='utf8',errors='ignore').read()
    except: s=''
    out=[]
    for m in IMP.finditer(s):
        sp=next(g for g in m.groups() if g)
        r=resolve(sp,f)
        if r and '.test.' not in r: out.append(r)
    cache[f]=out; return out
MARK={
 'gemini_api':r'generativelanguage\.googleapis\.com|googleTransportKind|resolveGeminiKey',
 'vertex':r'aiplatform\.googleapis\.com|getVertexAccessToken',
 'anthropic':r'api\.anthropic\.com|@anthropic-ai/sdk',
 'openai':r'api\.openai\.com|from .openai.',
 'elevenlabs':r'api\.elevenlabs\.io',
 'replicate':r"api\.replicate\.com|from 'replicate'",
 'higgsfield':r'higgsfield\.ai|lib/providers/higgsfield/client',
 'udio':r'lib/udio/client|udioapi|api\.udio',
 'heygen':r'api\.heygen\.com',
 'kling':r'klingai',
 'runway':r'api\.runwayml|api\.dev\.runwayml',
 'runpod':r'api\.runpod\.ai|RUNPOD_',
 'google_tts':r'texttospeech\.googleapis\.com',
}
src={}
def text(f):
    if f not in src: src[f]=open(f,encoding='utf8',errors='ignore').read()
    return src[f]
def closure(f,limit=4000):
    seen={f};st=[f]
    while st:
        x=st.pop()
        for d in deps(x):
            if d not in seen and not d.startswith(('components/','app/[')):
                seen.add(d);st.append(d)
    return seen
routes=[]
for dp,dn,fn in os.walk('app/api'):
    for n in fn:
        if n in('route.ts','route.js'): routes.append(os.path.join(dp,n))
res={}
for r in sorted(routes):
    cl=closure(r)
    hit=sorted({k for k,p in MARK.items() for f in cl if re.search(p,text(f))})
    t=text(r)
    gone=bool(re.search(r'status:\s*410|\b410\b|retired|withdrawn',t))
    res[r]={'providers':hit,'gone':gone,'methods':re.findall(r'export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)',t),'lines':t.count('\n')}
json.dump(res,open(sys.argv[2],'w'),indent=0)
print(len(routes),'routes')
