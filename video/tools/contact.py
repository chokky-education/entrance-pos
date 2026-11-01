import sys, glob, os
from PIL import Image, ImageDraw, ImageFont
pat, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 5
files = sorted(glob.glob(pat))
tw, th = 576, 324
rows = (len(files) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * (th + 26)), 'white')
d = ImageDraw.Draw(sheet)
f = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 18)
for i, p in enumerate(files):
    im = Image.open(p).convert('RGB'); im.thumbnail((tw, th))
    x, y = (i % cols) * tw, (i // cols) * (th + 26)
    sheet.paste(im, (x, y + 26)); d.text((x + 4, y + 3), os.path.basename(p)[:-4], fill='black', font=f)
sheet.save(out); print(out, sheet.size, len(files))
