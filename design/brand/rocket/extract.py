import numpy as np
from PIL import Image
from collections import deque
# Run from the repo root: python3 design/brand/rocket/extract.py
# Cuts the rocket out of public/myavatar-logo.png (an opaque glass tile, no alpha) into a transparent mark: a soft matte
# from each pixel's colour distance to a fitted model of the tile's background (so the opaque body, outline and ornament
# stay opaque while the flame's glow becomes soft transparency), un-premultiplied edges, and only the rocket's connected
# region (+ a glow margin) so the tile's lit rim never comes along. Writes rocket-master.png + sizes + previews here.
OUT='design/brand/rocket/'
src=np.asarray(Image.open('public/myavatar-logo.png').convert('RGB')).astype(np.float64)
y0,y1,x0,x1=230,975,320,1010
C=src[y0:y1,x0:x1]
H,W,_=C.shape
V=C.max(axis=2)/255.0
yy,xx=np.mgrid[0:H,0:W]
# Background model: a plane per channel fitted to the dark tile pixels.
bgmask=V<0.14
A=np.stack([np.ones(bgmask.sum()), xx[bgmask]/W, yy[bgmask]/H, (xx[bgmask]/W)**2, (yy[bgmask]/H)**2],axis=1)
B=np.zeros_like(C)
F=np.stack([np.ones(H*W), xx.ravel()/W, yy.ravel()/H, (xx.ravel()/W)**2, (yy.ravel()/H)**2],axis=1)
for c in range(3):
    coef,*_=np.linalg.lstsq(A, C[...,c][bgmask], rcond=None)
    B[...,c]=(F@coef).reshape(H,W)
B=np.clip(B,0,255)
dist=np.sqrt(((C-B)**2).sum(axis=2))
lo,hi=22.0,95.0
t=np.clip((dist-lo)/(hi-lo),0,1)
alpha=t*t*(3-2*t)
# Keep only the rocket: the connected component of alpha>0.5 that contains the rocket body, plus a halo margin.
core=alpha>0.5
seed=(int(0.50*H),int(0.55*W))
assert core[seed], 'seed not on rocket'
comp=np.zeros_like(core)
q=deque([seed]); comp[seed]=True
while q:
    y,x=q.popleft()
    for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
        ny,nx=y+dy,x+dx
        if 0<=ny<H and 0<=nx<W and core[ny,nx] and not comp[ny,nx]:
            comp[ny,nx]=True; q.append((ny,nx))
m=comp.copy()
for _ in range(28):  # dilate ~28 px for the flame's glow
    n=m.copy()
    n[1:,:]|=m[:-1,:]; n[:-1,:]|=m[1:,:]; n[:,1:]|=m[:,:-1]; n[:,:-1]|=m[:,1:]
    m=n
# soften the dilation edge so a halo never ends in a hard line
mf=m.astype(np.float64)
for _ in range(6):
    p=np.pad(mf,1,mode='edge')
    mf=(p[:-2,1:-1]+p[2:,1:-1]+p[1:-1,:-2]+p[1:-1,2:]+p[1:-1,1:-1])/5.0
alpha=alpha*mf
alpha[alpha<0.02]=0
# Un-premultiply against the fitted background for partially transparent pixels.
a=alpha[...,None]
Fg=np.where(a>0.001, B+(C-B)/np.maximum(a,1e-3), 0)
Fg=np.clip(Fg,0,255)
rgba=np.dstack([Fg,alpha*255]).astype(np.uint8)
img=Image.fromarray(rgba,'RGBA')
bbox=img.getbbox()
img=img.crop(bbox)
w,h=img.size; side=int(max(w,h)*1.06)
canvas=Image.new('RGBA',(side,side),(0,0,0,0))
canvas.paste(img,((side-w)//2,(side-h)//2))
canvas.save(OUT+'rocket-master.png')
for s in (512,256,128,64):
    canvas.resize((s,s),Image.LANCZOS).save(OUT+f'rocket-{s}.png', optimize=True)
# previews: on black, on white, on checker
for name,bg in (('black',(0,0,0,255)),('white',(255,255,255,255)),('navy',(17,17,20,255))):
    b=Image.new('RGBA',canvas.size,bg); b.alpha_composite(canvas); b.convert('RGB').resize((400,400)).save(OUT+f'preview-{name}.png')
print('bbox',bbox,'side',side, 'opaque px', int((alpha>0.98).sum()), 'semi', int(((alpha>0.02)&(alpha<0.98)).sum()))
