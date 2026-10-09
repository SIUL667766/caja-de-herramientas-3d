# Genera los iconos PNG de la app (lo ejecuta GitHub Actions)
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import math, random, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
def icon(S, pad=0.0):
    im = Image.new('RGB', (S, S), (5, 6, 15))
    g = Image.new('L', (S, S), 0); d = ImageDraw.Draw(g)
    for r in range(S // 2, 0, -2):
        d.ellipse([S/2-r, S/2-r, S/2+r, S/2+r], fill=int(255 * (1 - r / (S / 2)) ** 1.4))
    im = Image.composite(Image.new('RGB', (S, S), (60, 40, 150)), im, g)
    glow = Image.new('RGB', (S, S), (0, 0, 0)); dg = ImageDraw.Draw(glow)
    cols = ['#ffb84d','#ff5fa2','#4dd2ff','#a46bff','#44f0a0','#ff5a5a','#ffe14d','#5a8cff','#2ee6d6','#ff8a3d']
    c = S / 2; R = S * (0.30 - pad * 0.4); random.seed(3)
    for i, col in enumerate(cols):
        a = i / len(cols) * 2 * math.pi - math.pi / 2; x = c + R * math.cos(a); y = c + R * math.sin(a) * 0.62; rr = S * 0.05
        dg.line([c, c, x, y], fill=col, width=max(2, S // 110)); dg.ellipse([x-rr, y-rr, x+rr, y+rr], fill=col)
    dg.ellipse([c-S*0.11, c-S*0.11, c+S*0.11, c+S*0.11], fill='#cfc4ff')
    dg.ellipse([c-R*1.15, c-R*0.72, c+R*1.15, c+R*0.72], outline='#2ee6d6', width=max(2, S // 90))
    im = ImageChops.add(ImageChops.add(im, glow.filter(ImageFilter.GaussianBlur(S / 28))), glow)
    d2 = ImageDraw.Draw(im)
    for _ in range(60):
        x, y = random.random() * S, random.random() * S; s = random.random() * S / 300 + 0.5
        d2.ellipse([x-s, y-s, x+s, y+s], fill=(255, 255, 255))
    return im
icon(192).save('icon-192.png'); icon(512).save('icon-512.png'); icon(512, pad=0.12).save('icon-maskable-512.png')
