#!/usr/bin/env python3
# Stores a packed sheet as an indexed png of 255 colours with their alpha, which is how the first
# settlement sheet shipped (88 colours, 137 kB). The drawings are flat colour, and at the size they are
# seen a palette is not told from the full colour sheet, which is three to four times the weight.
# Run after scripts/clean-sprites.mjs:  python3 scripts/index-sheet.py public/textures/settlement-early.png
import sys
from PIL import Image

for path in sys.argv[1:]:
    im = Image.open(path).convert('RGBA')
    im.quantize(255, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(path, optimize=True)
    print(path, 'indexed')
