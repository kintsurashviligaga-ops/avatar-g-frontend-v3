#!/usr/bin/env python3
"""
scripts/audit/route_reach.py: which API routes can reach a paid Google transport, and which billing markers sit in the
same import closure (MASTER TASK v3.1 Phase 6, the provider / cost-authority inventory in
docs/master-v3.1/BILLABLE_ENTRYPOINTS.md).

Usage, from the repository root:  python3 scripts/audit/route_reach.py . route-reach.json

For every app/api/**/route.ts it follows `@/` and relative imports (tests and components excluded) and greps the closure
for transport markers (GOOGLE) and billing markers (BILL). It is a static over-approximation: a shared module can make a
route look like it reaches more than it does, and dispatch by string is missed. A row is a pointer for a code read, not
proof. Forbidden vendors are not scanned here: __tests__/provider-boundary.test.ts owns that ratchet.
Pure standard library, reads files only, no network.
"""
import os,re,sys,json
root=sys.argv[1]; os.chdir(root)
IMP=re.compile(r"""(?:import|export)\s(?!type\b)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)""",re.S)
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
GOOGLE={
 'vertex_gemini':r'aiplatform\.googleapis\.com|getVertexAccessToken|vertexFetch|googleModelFetch',
 'cloud_tts':r'texttospeech\.googleapis\.com',
 'cloud_stt':r'speech\.googleapis\.com',
 'live_relay':r'LIVE_RELAY|live-relay|liveMint',
 'vercel_sandbox':r'@vercel/sandbox',
 'pexels':r'api\.pexels\.com',
}
BILL={
 'quote_token':r'signQuote|verifyQuote|quoteToken',
 'reserve':r'\breserve[A-Z]\w*\(|reserveOf|reserveVeoSpend|reserveProduce|reserve_credits|rpc\(\s*[\'"]reserve',
 'settle_refund':r'settle\w*\(|refund\w*\(',
 'chat_budget':r'chatBudget\w*|bookChatUsage',
 'guard':r'guardGeneration|BillingGuard|guardedCall|guardOf|admitModelCall',
}
src={}
def text(f):
    if f not in src: src[f]=open(f,encoding='utf8',errors='ignore').read()
    return src[f]
def closure(f):
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
    g=sorted({k for k,p in GOOGLE.items() for f in cl if re.search(p,text(f))})
    b=sorted({k for k,p in BILL.items() for f in cl if re.search(p,text(f))})
    res[r]={'google':g,'billing':b,'methods':re.findall(r'export\s+(?:async\s+)?(?:function|const)\s+(GET|POST|PUT|PATCH|DELETE)',text(r))}
json.dump(res,open(sys.argv[2],'w'),indent=0)
print(len(routes),'routes;', sum(1 for v in res.values() if v['google']),'reach a Google/paid transport;', sum(1 for v in res.values() if v['google'] and not v['billing']),'of those show no billing marker in their closure')
