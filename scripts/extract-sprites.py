from PIL import Image
import numpy as np, json
from scipy import ndimage

im = Image.open('1000012106.jpg').convert('RGB')
a = np.array(im).astype(np.float32); H, W, _ = a.shape
s = 25.6
xs = (np.arange(W)/s).astype(int); ys = (np.arange(H)/s).astype(int)
E = np.where(((ys[:,None]+xs[None,:]) % 2)==0, 204.0, 255.0)
lum = a.mean(axis=2); neutral = a.max(axis=2)-a.min(axis=2)
bg_like = (neutral<14) & (lum/E>0.20) & (lum/E<1.03)
border = np.zeros((H,W),bool); border[0,:]=border[-1,:]=border[:,0]=border[:,-1]=True
lbl,_ = ndimage.label(bg_like)
keep = set(np.unique(lbl[border & bg_like])); keep.discard(0)
fg = ~np.isin(lbl, list(keep))
fg = ndimage.binary_closing(fg, np.ones((3,3)))
holes = ndimage.binary_fill_holes(fg) & ~fg
hl, hn = ndimage.label(holes)
hs = ndimage.sum(holes, hl, range(1, hn+1))
fg = fg | np.isin(hl, [i+1 for i in range(hn) if hs[i] < 1500])
fg = ndimage.binary_opening(fg, np.ones((3,3)))

cross = np.array([[0,1,0],[1,1,1],[0,1,0]])
for e in range(6, 40):
    seed = ndimage.binary_erosion(fg, np.ones((e,e)))
    sl, sn = ndimage.label(seed, structure=cross)
    sz = ndimage.sum(seed, sl, range(1, sn+1))
    big = [i+1 for i in range(sn) if sz[i] > 1200]
    if len(big) >= 7:
        print(f'erosion {e}px -> {len(big)} seeds'); break
seed = np.isin(sl, big)
sl2, _ = ndimage.label(seed, structure=cross)
_, (iy, ix) = ndimage.distance_transform_edt(~seed, return_indices=True)
parts = np.where(fg, sl2[iy, ix], 0)

res = []
for i in range(1, sl2.max()+1):
    m = (parts == i)
    if m.sum() < 3000: continue
    ys_, xs_ = np.where(m)
    x0,x1,y0,y1 = xs_.min(), xs_.max()+1, ys_.min(), ys_.max()+1
    rgba = np.zeros((y1-y0, x1-x0, 4), np.uint8)
    rgba[...,:3] = a[y0:y1, x0:x1].astype(np.uint8)
    al = ndimage.gaussian_filter(m[y0:y1, x0:x1].astype(np.float32), 0.6)
    rgba[...,3] = np.clip(al*255,0,255).astype(np.uint8)
    res.append((m.sum(), rgba))
res.sort(key=lambda t: -t[0])
names = ['hall','steading','frame','longhouse','store','cabin','barn','shed']
man = {}
for name,(_,rgba) in zip(names, res):
    img = Image.fromarray(rgba); img.save(f'b_{name}.png')
    man[name] = {'w':img.width,'h':img.height}
    print(f'{name:>10}  {img.width}x{img.height}')
json.dump(man, open('manifest.json','w'), indent=1)

sheet = Image.new('RGBA', (1024, 640), (0,0,0,0))
x = 4; rowh = 0
for name,(_,rgba) in zip(names, res):
    img = Image.fromarray(rgba)
    sc = 260/max(img.width, img.height)
    img = img.resize((int(img.width*sc), int(img.height*sc)), Image.LANCZOS)
    if x + img.width > 1020: break
    sheet.paste(img, (x, 8), img); x += img.width + 6
sheet.save('preview.png')
