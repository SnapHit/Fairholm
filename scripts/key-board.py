#!/usr/bin/env python3
# Keys a drawing off the checkerboard it was generated on, for the boards scripts/extract-sprites.py
# cannot key by colour alone: two greys far apart (black and mid grey), squares not on one grid, and
# a drawing with dark outlines and grey trim that a colour range would take with the board.
#
# The board's own squares reached from the picture's edge are the background for certain, and the
# soft seams between squares a few pixels from them; anything with colour is the drawing for
# certain; GrabCut decides the rest. Then what is left of the board is taken off: board coloured
# pixels along the edge, peeled a pixel at a time, and board the drawing encloses (between a mast
# and its ropes), found as a patch where both of the board's greys lie close together and nothing
# has colour. Writes an rgba png the same size as the source, which the extraction job then takes
# as already keyed.
#
# Run with:  python3 scripts/key-board.py SOURCE.jpg OUT.png DARK LIGHT
#            DARK and LIGHT are the board's two greys, read off its corner squares. A sixth argument,
#            faded, peels back ground drawn fading into the board.
# Needs numpy, scipy and opencv (cv2).

import sys

import cv2
import numpy as np
from scipy import ndimage


def key(path, greys, out, faded=False):
    a = cv2.imread(path).astype(np.float32)
    lum = a.mean(axis=2)
    chroma = a.max(axis=2) - a.min(axis=2)
    neutral = chroma < 10
    core = np.zeros(lum.shape, bool)
    for g in greys:
        core |= neutral & (np.abs(lum - g) < 12)
    between = neutral & (lum >= min(greys) - 12) & (lum <= max(greys) + 12)
    lbl, _ = ndimage.label(core)
    edge = np.zeros_like(core)
    edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
    bg = np.isin(lbl, list(set(np.unique(lbl[edge & core])) - {0}))
    for _ in range(4):
        bg |= ndimage.binary_dilation(bg) & between
    mask = np.full(lum.shape, cv2.GC_PR_FGD, np.uint8)
    mask[bg] = cv2.GC_BGD
    mask[between & ~bg] = cv2.GC_PR_BGD
    mask[chroma > 25] = cv2.GC_FGD
    cv2.grabCut(a.astype(np.uint8), mask, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
    fg = (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)
    # board along the edge, peeled off
    boardish = np.zeros(lum.shape, bool)
    for g in greys:
        boardish |= (chroma < 16) & (np.abs(lum - g) < 26)
    for _ in range(16):
        touching = ndimage.binary_dilation(~fg) & fg & boardish
        if not touching.any():
            break
        fg &= ~touching
    # board the drawing encloses
    n16 = chroma < 16
    near = [n16 & (np.abs(lum - g) < 26) for g in greys]
    fd = [ndimage.uniform_filter(m.astype(np.float32), 11) for m in near]
    fn = ndimage.uniform_filter(n16.astype(np.float32), 11)
    texture = ndimage.binary_dilation((fd[0] > 0.08) & (fd[1] > 0.08) & (fn > 0.75), iterations=3)
    fg &= ~(texture & (near[0] | near[1]))
    # and what is left in strips too narrow for that, between ropes: small patches of either grey,
    # flat and colourless, each followed by any of the other grey it touches
    flat = chroma < 10
    for _ in range(3):
        for g in greys:
            square = fg & flat & (np.abs(lum - g) < 14)
            sl, sn = ndimage.label(square)
            if not sn:
                continue
            ss = ndimage.sum(square, sl, range(1, sn + 1))
            small = np.isin(sl, [i + 1 for i in range(sn) if ss[i] < 1500])
            # a patch counts as board only where it lies against background already taken
            touched = ndimage.binary_dilation(~fg, iterations=2)
            keep_ids = set(np.unique(sl[small & touched])) - {0}
            fg &= ~np.isin(sl, list(keep_ids))
    if faded:
        # ground drawn fading out into the board leaves a pale, washed ring of board and ground mixed:
        # peeled back from the edge to where the ground has its own colour. A dark outline stops it,
        # so a hull or a roof against the board is never touched
        for _ in range(60):
            washed = ndimage.binary_dilation(~fg) & fg & (chroma < 75) & (lum > 150)
            if not washed.any():
                break
            fg &= ~washed
    fg = ndimage.binary_opening(fg, np.ones((3, 3)))
    lbl, n = ndimage.label(fg)
    sizes = ndimage.sum(fg, lbl, range(1, n + 1))
    fg = np.isin(lbl, [i + 1 for i in range(n) if sizes[i] > 4000])
    holes = ndimage.binary_fill_holes(fg) & ~fg
    hl, hn = ndimage.label(holes)
    hs = ndimage.sum(holes, hl, range(1, hn + 1))
    fg |= np.isin(hl, [i + 1 for i in range(hn) if hs[i] < 300])
    alpha = ndimage.gaussian_filter(fg.astype(np.float32), 0.7) * 255
    rgba = np.dstack([a, alpha]).clip(0, 255).astype(np.uint8)
    cv2.imwrite(out, rgba)


if __name__ == '__main__':
    src, out, dark, light = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
    key(src, [dark, light], out, faded=len(sys.argv) > 5 and sys.argv[5] == 'faded')
    print(f'{out} keyed from {src}')
