#!/usr/bin/env python3
# Cuts drawings off the checkerboard they were generated on.
#
# Every picture in the game arrives the same way: a 1024 by 1024 jpeg of one subject painted over a
# checkerboard that is meant to read as transparency and is not. This keys the checkerboard out,
# does the few hand repairs each drawing needs (a blank nameplate painted over, a smoke plume
# dropped, rigging that will not key dropped), de-fringes the edge, scales the piece so that a
# standing person is a fixed number of pixels tall, and writes one rgba png per piece into art/units
# with a manifest beside them. scripts/clean-sprites.mjs then packs those into the sheet the game
# loads.
#
# The jobs are a table at the bottom. A new drawing is a new row: its source file, how tall it is in
# people (art direction brief, and the scale table in src/render/look.ts, which this must agree
# with), which way it faces, and any repair it needs. Run it again and the same pieces come out.
#
# Run with:  python3 scripts/extract-sprites.py            every unit job
#            python3 scripts/extract-sprites.py trader     one job
#            python3 scripts/extract-sprites.py settlement the first era buildings, see that job
# Needs Pillow, numpy and scipy.

import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

SOURCE = 'art/source/units'
OUT = 'art/units'
# A standing person is this many pixels tall in the pieces this writes. At the closest zoom on a
# phone a person stands about 90 device pixels tall, so this is still half as much again; the whole
# sheet has to stay under about 250 kB on the wire, and this is where that lands. The colonist first
# shipped at 200 and is cut down to agree.
PERSON_PX = 144
# Colour is kept to this many bits a channel. The drawings are flat colour and soft gradients that a
# jpeg has roughened, and six bits takes the roughness out of the png without putting a step into the
# gradients at the size they are seen.
COLOUR_BITS = 6

# ---- the checkerboard -------------------------------------------------------------------------------

# The generator's checkerboard: squares of 25.6 px at 1024, two greys. Sampling by phase rather than
# by colour alone lets the test stay tight on the grey without losing the squares that a drawing's
# soft edge has darkened a little.
CHECKER_PERIOD = 25.6
CHECKER_DARK, CHECKER_LIGHT = 204.0, 255.0


def checker_mask(a, dark=CHECKER_DARK, light=CHECKER_LIGHT, low=0.20, high=1.03, chroma=14):
    """True where a pixel looks like the checkerboard by phase: neutral, and at the lightness of
    the square it falls in, within `low` and `high` of it. The settlement sheet was cut this way, with
    a low floor so the drop shadows lying on the board went with it."""
    H, W, _ = a.shape
    xs = (np.arange(W) / CHECKER_PERIOD).astype(int)
    ys = (np.arange(H) / CHECKER_PERIOD).astype(int)
    E = np.where(((ys[:, None] + xs[None, :]) % 2) == 0, dark, light)
    neutral = a.max(axis=2) - a.min(axis=2)
    lum = a.mean(axis=2)
    return (neutral < chroma) & (lum / E > low) & (lum / E < high)


def board_mask(a, dark=CHECKER_DARK, light=CHECKER_LIGHT, tint=(0, 0, 0), low=0.78, high=1.06, chroma=14):
    """True where a pixel looks like the board by colour alone: neutral once the board's own tint is
    taken off, and between the dark square's grey and the light one's. No phase, because the units'
    boards are not all on one grid (the lander's is three boards pasted together). The floor is high
    enough to leave a dark barrel alone; the units have no shadows lying on the board to lose."""
    t = a - np.array(tint, np.float32)[None, None, :]
    neutral = t.max(axis=2) - t.min(axis=2)
    lum = t.mean(axis=2)
    return (neutral < chroma) & (lum > dark * low) & (lum < light * high)


def looks_like_board(lum, dark, light, span=14, share=0.12):
    """A region is board rather than drawing if it holds both of the board's greys: a sail is pale
    and neutral too, but it is one grey, and a patch of board between two rigging lines is two."""
    near_dark = (np.abs(lum - dark) < span).mean()
    near_light = (np.abs(lum - light) < span).mean()
    return near_dark > share and near_light > share


def border_connected(mask):
    """The part of a mask that touches the picture's edge: the background proper, as opposed to a
    patch inside a drawing that happens to be grey."""
    H, W = mask.shape
    lbl, _ = ndimage.label(mask)
    border = np.zeros((H, W), bool)
    border[0, :] = border[-1, :] = border[:, 0] = border[:, -1] = True
    keep = set(np.unique(lbl[border & mask]))
    keep.discard(0)
    return np.isin(lbl, list(keep))


def fill_small_holes(fg, limit):
    holes = ndimage.binary_fill_holes(fg) & ~fg
    hl, hn = ndimage.label(holes)
    if hn == 0:
        return fg
    hs = ndimage.sum(holes, hl, range(1, hn + 1))
    return fg | np.isin(hl, [i + 1 for i in range(hn) if hs[i] < limit])


def keep_components(fg, minimum):
    lbl, n = ndimage.label(fg)
    if n == 0:
        return fg
    sizes = ndimage.sum(fg, lbl, range(1, n + 1))
    return np.isin(lbl, [i + 1 for i in range(n) if sizes[i] >= minimum])


def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= r * r


# ---- repairs ----------------------------------------------------------------------------------------

def strip_thin(raw, lum, radius, light=200):
    """Drops a ship's rigging: dark lines thinner than about twice the radius that are not part of
    something thicker. The lines are found in the dark part of the silhouette only (the rope's core,
    under `light`), because a bundle of shrouds a few pixels apart is one wide band in the silhouette
    and only the lum tells the ropes from the board between them. Each line goes with the chroma it
    bled into the board beside it. The edge a plain opening would shave off every thick form is put
    back, so the masts and yards keep their outline and only the free lines go."""
    core = raw & (lum < light)
    opened = ndimage.binary_opening(core, disk(radius))
    kept = ndimage.binary_dilation(opened, disk(2))
    thin = core & ~kept
    halo = ndimage.binary_dilation(thin, disk(3))
    return raw & ~halo


def paint_out(a, fg, box, colour, tolerance, grain, grow=3):
    """A blank nameplate painted over with the surface it sits on. `box` (x0, y0, x1, y1) bounds the
    plate, `colour` is its cream and `tolerance` how far a pixel may be from it and still be plate;
    the rivets on it are taken with the plate by growing the mask `grow` px. Each covered pixel is
    then filled by walking along `grain` (dx, dy), the direction of the planking, to the nearest
    unpainted pixel either way and blending the two by distance, so a plank line runs through where
    the plate was rather than stopping at its edge."""
    x0, y0, x1, y1 = box
    H, W, _ = a.shape
    region = np.zeros((H, W), bool)
    region[y0:y1, x0:x1] = True
    plate = region & fg & (np.abs(a - np.array(colour, np.float32)).max(axis=2) < tolerance)
    plate = keep_components(ndimage.binary_closing(plate, disk(2)), 400)
    plate = ndimage.binary_dilation(plate, disk(grow)) & region
    out = a.copy()
    dx, dy = grain
    norm = max(1e-6, (dx * dx + dy * dy) ** 0.5)
    dx, dy = dx / norm, dy / norm
    ys, xs = np.where(plate)
    for y, x in zip(ys, xs):
        donors = []
        for sign in (1, -1):
            for step in range(1, 400):
                px = int(round(x + dx * step * sign))
                py = int(round(y + dy * step * sign))
                if px < 0 or py < 0 or px >= W or py >= H or not fg[py, px]:
                    break
                if not plate[py, px]:
                    donors.append((step, a[py, px]))
                    break
        if len(donors) == 2:
            (d0, c0), (d1, c1) = donors
            out[y, x] = (c0 * d1 + c1 * d0) / (d0 + d1)
        elif donors:
            out[y, x] = donors[0][1]
    # the fill is a ruled set of lines, and a touch of blur across them takes the ruling out
    blurred = ndimage.gaussian_filter(out, (1.2, 1.2, 0))
    out[plate] = blurred[plate]
    return out, int(plate.sum())


def drop_smoke(fg, a, light=200, chroma=30):
    """A steam plume above a hull is a live effect on the map, not part of the drawing: everything
    pale and near grey that stands above the hull's top goes, and the stacks, which are dark, stay.
    The hull's top is the first row the drawing runs wide on."""
    width = fg.sum(axis=1)
    hull_top = int(np.argmax(width > fg.shape[1] * 0.3))
    lum = a.mean(axis=2)
    neutral = a.max(axis=2) - a.min(axis=2)
    pale = (lum > light) & (neutral < chroma)
    above = np.zeros_like(fg)
    above[:hull_top + 6, :] = True
    return fg & ~(above & pale), hull_top


# ---- the cut ----------------------------------------------------------------------------------------

def defringe(a, fg, depth=2):
    """A drawing's edge pixels are its colour mixed with the board's grey, and keyed out they leave a
    pale halo. Each pixel within `depth` of the edge takes the colour of the nearest pixel further
    in, so the edge carries the drawing's own colour out to the alpha."""
    inner = ndimage.binary_erosion(fg, disk(depth))
    if not inner.any():
        return a
    _, (iy, ix) = ndimage.distance_transform_edt(~inner, return_indices=True)
    out = a.copy()
    rim = fg & ~inner
    out[rim] = a[iy[rim], ix[rim]]
    return out


def key(a, job):
    """The drawing's silhouette: everything that is not board."""
    H, W, _ = a.shape
    # the board, by every model the picture needs; the lander stands on two. What touches the
    # picture's edge is board. What does not but is board coloured is either a pale part of the
    # drawing (a sail) or a patch of board the drawing encloses (between rigging lines, between the
    # spokes of a wheel), and the two are told apart by whether the patch holds both of the board's
    # greys
    models = job.get('boards', [dict()])
    like = np.zeros((H, W), bool)
    for model in models:
        rows = model.get('rows', (0, H))
        m = board_mask(a, **{k: v for k, v in model.items() if k != 'rows'})
        band = np.zeros((H, W), bool)
        band[rows[0]:rows[1], :] = True
        like |= m & band
    # rigging first, before anything joins it up: the lines are stripped from the raw silhouette, so
    # that the slivers of board between a bundle of shrouds open to the edge and go with the board
    # rather than being filled in as drawing
    raw = ~like
    notes = []
    if 'strip' in job:
        stripped = strip_thin(raw, a.mean(axis=2), job['strip'])
        notes.append(f'stripped {int(raw.sum() - stripped.sum())} px of line')
        raw = stripped
    bg = border_connected(~raw)
    enclosed = ~raw & ~bg
    lbl, n = ndimage.label(enclosed)
    lum = a.mean(axis=2)
    patches = 0
    if n:
        sizes = ndimage.sum(enclosed, lbl, range(1, n + 1))
        for i in range(n):
            if sizes[i] < job.get('hole', 200):
                continue
            region = lbl == i + 1
            if any(looks_like_board(lum[region], m.get('dark', CHECKER_DARK), m.get('light', CHECKER_LIGHT)) for m in models):
                bg |= region
                patches += 1
    if patches:
        notes.append(f'{patches} enclosed patches of board')
    fg = ~bg
    fg = ndimage.binary_closing(fg, np.ones((3, 3)))
    fg = fill_small_holes(fg, job.get('hole', 200))
    fg = ndimage.binary_opening(fg, np.ones((3, 3)))
    return fg, notes


def cut(job):
    name = job['name']
    src = os.path.join(SOURCE, job['source'])
    if job.get('keyed'):
        # already cut, on an earlier pass of this pipeline or by hand: only the scale is applied
        im = Image.open(src).convert('RGBA')
        a = np.array(im).astype(np.float32)
        fg = a[..., 3] > 8
        a = a[..., :3]
        notes = ['already keyed']
    else:
        im = Image.open(src).convert('RGB')
        a = np.array(im).astype(np.float32)
        fg, notes = key(a, job)
    H, W, _ = a.shape
    if job.get('smoke'):
        fg, top = drop_smoke(fg, a)
        notes.append(f'smoke dropped above row {top}')
    for plate in job.get('plates', []):
        a, n = paint_out(a, fg, plate['box'], plate['colour'], plate.get('tolerance', 40), plate['grain'])
        notes.append(f'painted out {n} px of plate')
    fg = keep_components(fg, job.get('component', 3000))
    fg = fill_small_holes(fg, job.get('hole', 200))

    # trim
    ys, xs = np.where(fg)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    a = defringe(a, fg)
    crop = a[y0:y1, x0:x1]
    mask = fg[y0:y1, x0:x1]

    # the scale: the piece's reference height, in source pixels, becomes its height in people times
    # the person. The reference is the whole trimmed height unless the job says which rows, as it
    # does for a figure with a tool held over its head
    ref_top, ref_bottom = job.get('reference', (y0, y1))
    ref_px = max(1, ref_bottom - ref_top)
    scale = job['people'] * PERSON_PX * job.get('resolution', 1.0) / ref_px
    out_w, out_h = max(1, int(round((x1 - x0) * scale))), max(1, int(round((y1 - y0) * scale)))

    # the alpha, soft by under a pixel at the source, then both down together
    alpha = ndimage.gaussian_filter(mask.astype(np.float32), 0.6)
    rgba = np.zeros((y1 - y0, x1 - x0, 4), np.float32)
    rgba[..., :3] = crop
    rgba[..., 3] = np.clip(alpha, 0, 1) * 255
    # premultiply before the resample so the board's grey in the transparent gutter cannot bleed in,
    # then unpremultiply for the file, which stores straight alpha with edge extended colour
    pre = rgba.copy()
    pre[..., :3] *= pre[..., 3:4] / 255
    small = np.array(Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8)).resize((out_w, out_h), Image.LANCZOS)).astype(np.float32)
    al = small[..., 3:4]
    rgb = np.where(al > 2, small[..., :3] * 255 / np.maximum(al, 1), 0)
    # transparent pixels take the colour of the nearest drawn pixel: the gutter a mip pulls from
    solid = small[..., 3] > 2
    if solid.any():
        _, (iy, ix) = ndimage.distance_transform_edt(~solid, return_indices=True)
        rgb = rgb[iy, ix]
    final = np.zeros((out_h, out_w, 4), np.uint8)
    step = 2 ** (8 - COLOUR_BITS)
    final[..., :3] = (np.clip(rgb, 0, 255) // step * step + step // 2).astype(np.uint8)
    final[..., 3] = np.clip(small[..., 3], 0, 255).astype(np.uint8)

    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(final).save(os.path.join(OUT, f'{name}.png'))
    entry = {
        'source': job['source'],
        'w': out_w, 'h': out_h,
        'people': job['people'],
        # how many pixels a standing person is in this piece: the sheet's person, less for a piece
        # stored at a lower resolution. The renderer sizes the piece from this, so a drawing that
        # stands taller than its subject, a figure with a pick over its head, stands taller on the map
        'personPx': round(PERSON_PX * job.get('resolution', 1.0), 1),
        'facing': job.get('facing', 'front'),
    }
    if 'waterline' in job:
        # the row the drawing sits in the water on, from its own top, so that a hull is anchored at
        # the waterline and not at the keel
        entry['waterline'] = round((job['waterline'] - y0) * scale, 1)
    print(f"{name:>16}  {x1 - x0}x{y1 - y0} at source -> {out_w}x{out_h}  scale {scale:.3f}  " + '; '.join(notes))
    return entry


# ---- jobs -------------------------------------------------------------------------------------------

# Boxes, reference rows and waterlines are source pixels, read off the drawing once.
NEUTRAL = dict()
UNITS = [
    # the colonist as it first shipped, cut from its own one piece sheet by hand before this pipeline
    # existed, and carried along so every unit comes off one run
    dict(name='colonist', source='colonist.png', people=1.0, keyed=True),
    dict(name='militia', source='militia.jpg', people=1.0),
    dict(name='improver', source='improver.jpg', people=1.0,
         # the pick and shovel stand over the hat; the person is from the hat's crown down
         reference=(205, 997)),
    dict(name='company-regular', source='regulars.jpg', people=1.0),
    dict(name='outrider', source='outrider.jpg', people=1.35, facing='left'),
    dict(name='hauler', source='hauler.jpg', people=1.0, facing='left'),
    dict(name='battery', source='battery.jpg', people=0.6, facing='left',
         plates=[dict(box=(620, 560, 820, 720), colour=(228, 222, 196), tolerance=38, grain=(1.0, 0.52))]),
    dict(name='trader', source='trader.jpg', people=3.0, facing='left',
         # the rigging is four to six pixels of rope over the board and will not key: it goes, and
         # the masts, yards, sails and bowsprit stay. Stored at six tenths: a hull three people
         # tall is still most of its size on the screen at the closest zoom, and these two are the weight of the sheet
         strip=3, component=1500, resolution=0.6,
         plates=[dict(box=(770, 660, 920, 780), colour=(214, 198, 172), tolerance=38, grain=(1.0, 0.0))],
         waterline=800),
    dict(name='lander', source='lander.jpg', people=1.8,
         # a two toned board: the neutral checker above, a blue grey one below row 615
         boards=[dict(rows=(0, 615)),
                 dict(rows=(615, 1024), dark=186.0, light=222.0, tint=(0, 5, 7), low=0.92, high=1.06, chroma=12)],
         smoke=True, resolution=0.6,
         waterline=640),
]

# The first era buildings came off their own board with an earlier form of this script, and the
# committed art/settlement-early.png and .json are what the sheet was cut to by hand after it. This
# job is kept so the cut can be repeated on new buildings; it is not what is on the map.
SETTLEMENT = dict(
    name='settlement-early', source='1787475302501.jpg',
    names=['hall', 'steading', 'frame', 'longhouse', 'store', 'cabin', 'barn', 'shed'],
)


def cut_settlement(job):
    a = np.array(Image.open(os.path.join(SOURCE, job['source'])).convert('RGB')).astype(np.float32)
    bg = checker_mask(a)
    fg = ~border_connected(bg)
    fg = ndimage.binary_closing(fg, np.ones((3, 3)))
    fg = fill_small_holes(fg, 1500)
    fg = ndimage.binary_opening(fg, np.ones((3, 3)))
    cross = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]])
    sl, big = None, []
    for e in range(6, 40):
        seed = ndimage.binary_erosion(fg, np.ones((e, e)))
        sl, sn = ndimage.label(seed, structure=cross)
        sz = ndimage.sum(seed, sl, range(1, sn + 1))
        big = [i + 1 for i in range(sn) if sz[i] > 1200]
        if len(big) >= len(job['names']) - 1:
            print(f'erosion {e}px -> {len(big)} seeds')
            break
    seed = np.isin(sl, big)
    sl2, _ = ndimage.label(seed, structure=cross)
    _, (iy, ix) = ndimage.distance_transform_edt(~seed, return_indices=True)
    parts = np.where(fg, sl2[iy, ix], 0)
    res = []
    for i in range(1, sl2.max() + 1):
        m = parts == i
        if m.sum() < 3000:
            continue
        ys_, xs_ = np.where(m)
        x0, x1, y0, y1 = xs_.min(), xs_.max() + 1, ys_.min(), ys_.max() + 1
        rgba = np.zeros((y1 - y0, x1 - x0, 4), np.uint8)
        rgba[..., :3] = a[y0:y1, x0:x1].astype(np.uint8)
        al = ndimage.gaussian_filter(m[y0:y1, x0:x1].astype(np.float32), 0.6)
        rgba[..., 3] = np.clip(al * 255, 0, 255).astype(np.uint8)
        res.append((m.sum(), rgba))
    res.sort(key=lambda t: -t[0])
    os.makedirs(os.path.join(OUT, 'settlement'), exist_ok=True)
    man = {}
    for name, (_, rgba) in zip(job['names'], res):
        img = Image.fromarray(rgba)
        img.save(os.path.join(OUT, 'settlement', f'{name}.png'))
        man[name] = {'w': img.width, 'h': img.height}
        print(f'{name:>10}  {img.width}x{img.height}')
    json.dump(man, open(os.path.join(OUT, 'settlement', 'manifest.json'), 'w'), indent=1)


if __name__ == '__main__':
    wanted = sys.argv[1:]
    if wanted == ['settlement']:
        cut_settlement(SETTLEMENT)
        sys.exit(0)
    path = os.path.join(OUT, 'manifest.json')
    manifest = json.load(open(path)) if os.path.exists(path) else {}
    for job in UNITS:
        if wanted and job['name'] not in wanted:
            continue
        manifest[job['name']] = cut(job)
    manifest = {k: manifest[k] for k in sorted(manifest)}
    json.dump(manifest, open(path, 'w'), indent=1)
    print(f'{path}: {len(manifest)} pieces')
