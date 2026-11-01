"""Compose the tutorial video from screenshots + a resolved timeline.

Pipeline: timeline.json (absolute seconds) -> per-frame composition (numpy/PIL) -> ffmpeg (NVENC) chunks
-> concat -> mux narration. Coordinates in the timeline are CSS pixels of the captured page; the
renderer maps them onto a supersampled canvas (background + browser window) and then through a camera.

usage: python render.py timeline.json out.mp4 [--workers N] [--from S --to S] [--preview]
"""
import json, math, os, subprocess, sys, time
from concurrent.futures import ProcessPoolExecutor
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))


def ease(x):  # easeInOutCubic
    x = max(0.0, min(1.0, x))
    return 4 * x * x * x if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2


def hex_rgb(h):
    h = h.strip().lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


class Composer:
    def __init__(self, tl, base_dir):
        self.tl = tl
        self.base = base_dir
        self.W, self.H = tl['size']
        self.ss = tl.get('ss', 1.5)
        self.CW, self.CH = int(self.W * self.ss), int(self.H * self.ss)
        win = tl['window']
        self.content = win['content']  # x, y, w, h in final canvas units
        self.css_w, self.css_h = tl['shot_css_size']
        self.css_to_canvas = self.content[2] / self.css_w  # final units per CSS px
        self.primary = hex_rgb(tl['theme']['primary'])
        self._shot_cache = {}
        self._canvas_cache = {}
        self._img_cache = {}
        self._frame_cache_key = None
        self._frame_cache = None
        self.bg = self._make_background()
        self.cursors = {
            'arrow': self._load_cursor(os.path.join(self.base, 'assets/aero_arrow_xl.png'), (0, 0)),
            'hand': self._load_cursor(os.path.join(self.base, 'assets/aero_link_xl.png'), (40, 0)),
            'no': self._load_cursor(os.path.join(self.base, 'assets/aero_unavail_xl.png'), (48, 48)),
        }
        self.cursor_px = tl.get('cursor_px', 92)
        self.anims = tl.get('anims', [])
        self._anim_cache = {}
        res = os.path.join(self.base, 'render/ov_result.json')
        if os.path.exists(res):
            r = json.load(open(res, encoding='utf-8'))
            for ov in tl.get('overlays', []):
                oid = ov.get('id') or os.path.splitext(os.path.basename(ov['src']))[0]
                if 'pos' not in ov and oid in r:
                    ov['pos'] = r[oid]['pos']

    # ---------- static assets ----------
    def _make_background(self):
        W, H = self.CW, self.CH
        y, x = np.mgrid[0:H, 0:W].astype(np.float32)
        p = np.array(self.primary, np.float32)
        base = np.array([22, 20, 26], np.float32)
        # vertical gradient + two soft primary glows
        g = (y / H)[..., None]
        img = base * (1 - 0.35 * g) + np.array([34, 28, 36], np.float32) * (0.35 * g)
        for (gx, gy, rad, a) in [(0.18, 0.12, 0.55, 0.55), (0.88, 0.95, 0.6, 0.35)]:
            d = np.sqrt(((x - gx * W) / (rad * W)) ** 2 + ((y - gy * H) / (rad * H)) ** 2)
            w = np.clip(1 - d, 0, 1) ** 2 * a
            img = img * (1 - w[..., None]) + p * w[..., None]
        bg = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), 'RGB')
        # window shadow + chrome
        win = self.tl['window']
        cx, cy, cw, ch = [v * self.ss for v in self.content]
        chrome_h = win.get('chrome_h', 0) * self.ss
        r = int(win.get('radius', 36) * self.ss)
        box = (int(cx), int(cy - chrome_h), int(cx + cw), int(cy + ch))
        sh = Image.new('L', (W // 4, H // 4), 0)
        ImageDraw.Draw(sh).rounded_rectangle([v // 4 for v in (box[0], box[1] + int(30 * self.ss), box[2], box[3] + int(40 * self.ss))], r // 4, fill=200)
        sh = sh.filter(ImageFilter.GaussianBlur(int(28 * self.ss / 4))).resize((W, H), Image.BILINEAR)
        bga = np.asarray(bg, np.float32)
        a = (np.asarray(sh, np.float32) / 255 * 0.75)[..., None]
        bg = Image.fromarray((bga * (1 - a)).astype(np.uint8), 'RGB')
        if win.get('chrome_png'):
            chrome = Image.open(os.path.join(self.base, win['chrome_png'])).convert('RGBA')
            chrome = chrome.resize((box[2] - box[0], int(chrome_h)), Image.LANCZOS)
            bg.paste(chrome, (box[0], box[1]), chrome)
        self._content_mask = Image.new('L', (int(cw), int(ch)), 0)
        md = ImageDraw.Draw(self._content_mask)
        md.rectangle([0, 0, int(cw), int(ch) - r], fill=255)
        md.rounded_rectangle([0, 0, int(cw) - 1, int(ch) - 1], r, fill=255)
        if chrome_h == 0:
            md.rounded_rectangle([0, 0, int(cw) - 1, int(ch) - 1], r, fill=255)
        self._content_box = (int(cx), int(cy), int(cw), int(ch))
        return bg

    def _load_cursor(self, path, hotspot):
        im = Image.open(path).convert('RGBA')
        bbox = im.getbbox()
        return im, hotspot, bbox

    def img(self, rel):
        if rel not in self._img_cache:
            self._img_cache[rel] = Image.open(os.path.join(self.base, rel)).convert('RGBA')
        return self._img_cache[rel]

    # ---------- canvas per shot ----------
    def canvas(self, shot_src):
        if shot_src in self._canvas_cache:
            return self._canvas_cache[shot_src]
        if len(self._canvas_cache) > 6:
            self._canvas_cache.pop(next(iter(self._canvas_cache)))
        cv = self.bg.copy()
        x, y, w, h = self._content_box
        shot = Image.open(os.path.join(self.base, shot_src)).convert('RGB')
        if shot.size != (w, h):
            shot = shot.resize((w, h), Image.LANCZOS)
        cv.paste(shot, (x, y), self._content_mask)
        arr = np.asarray(cv)
        self._canvas_cache[shot_src] = arr
        return arr

    def css_to_final(self, pt):
        return (self.content[0] + pt[0] * self.css_to_canvas, self.content[1] + pt[1] * self.css_to_canvas)

    # ---------- timeline sampling ----------
    def shot_at(self, t):
        shots = self.tl['shots']
        cur = None
        prev = None
        for s in shots:
            if s['t'] <= t:
                prev, cur = cur, s
            else:
                break
        if cur is None:
            return shots[0]['src'], None, 0.0
        fade = cur.get('fade', 0.25)
        if prev is not None and fade > 0 and t < cur['t'] + fade:
            return cur['src'], prev['src'], ease((t - cur['t']) / fade)
        return cur['src'], None, 1.0

    def camera_at(self, t):
        """returns (x0, y0, w, h) in final canvas units."""
        def rect_of(k):
            if k.get('full', False) or k.get('z', 1) <= 1.0001:
                return (0.0, 0.0, float(self.W), float(self.H))
            z = k['z']
            cx, cy = self.css_to_final(k['center'])
            w, h = self.W / z, self.H / z
            # keep the target a bit above centre so captions at the bottom do not cover it
            x0, y0 = cx - w / 2, cy - h * k.get('bias', 0.44)
            bx, by, bw, bh = self.content
            if w <= bw and h <= bh and not k.get('free'):  # stay inside the app window when the zoom allows it
                x0 = min(max(x0, bx), bx + bw - w)
                y0 = min(max(y0, by), by + bh - h)
            else:
                x0 = min(max(x0, 0), self.W - w)
                y0 = min(max(y0, 0), self.H - h)
            return (x0, y0, w, h)
        keys = self.tl.get('camera', [])
        cur = (0.0, 0.0, float(self.W), float(self.H))
        for k in keys:
            if k['t'] > t:
                break
            target = rect_of(k)
            d = k.get('dur', 0.9)
            if t < k['t'] + d:
                e = ease((t - k['t']) / d)
                cur = tuple(a + (b - a) * e for a, b in zip(cur, target))
                return cur
            cur = target
        return cur

    def cursor_at(self, t):
        keys = self.tl.get('cursor', [])
        pos, kind, visible = None, 'arrow', False
        for k in keys:
            if k['t'] > t:
                break
            if 'hide' in k:
                visible = not k['hide']
                continue
            kind = k.get('kind', kind)
            target = tuple(k['pos'])
            d = k.get('dur', 0.0)
            visible = True
            if pos is not None and d > 0 and t < k['t'] + d:
                e = ease((t - k['t']) / d)
                # curved path: quadratic bezier with a perpendicular control offset
                (x0, y0), (x1, y1) = pos, target
                mx, my = (x0 + x1) / 2, (y0 + y1) / 2
                dx, dy = x1 - x0, y1 - y0
                dist = math.hypot(dx, dy) or 1
                off = min(60, dist * 0.12)
                cxp, cyp = mx - dy / dist * off, my + dx / dist * off
                bx = (1 - e) ** 2 * x0 + 2 * (1 - e) * e * cxp + e * e * x1
                by = (1 - e) ** 2 * y0 + 2 * (1 - e) * e * cyp + e * e * y1
                return (bx, by), kind, True
            pos = target
        return pos, kind, visible

    # ---------- frame ----------
    # ---------- full-screen motion graphics (anim.mjs frames) ----------
    def anim_img(self, k, t):
        an = self.anims[k]
        n = math.ceil((an['t1'] - an['t0']) * self.tl['fps'])
        i = max(0, min(n - 1, int((t - an['t0']) * self.tl['fps'])))
        key = (k, i)
        if key not in self._anim_cache:
            if len(self._anim_cache) > 4:
                self._anim_cache.pop(next(iter(self._anim_cache)))
            p = os.path.join(self.base, 'render/anim', f"a{k:02d}-{an['stage']}", f'f{i:05d}.jpg')
            im = Image.open(p).convert('RGB')
            self._anim_cache[key] = im if im.size == (self.W, self.H) else im.resize((self.W, self.H), Image.LANCZOS)
        return self._anim_cache[key]

    def _contig(self, a, b):
        return 0 <= a and b < len(self.anims) and abs(self.anims[a]['t1'] - self.anims[b]['t0']) < 1e-3

    def _anim_mix(self, k, t, fade=0.45):
        an = self.anims[k]
        img = self.anim_img(k, t)
        if an['t0'] > 0 and t - an['t0'] < fade:
            under = self.anim_img(k - 1, an['t0'] - 1e-3) if self._contig(k - 1, k) else self._screen(t)[0]
            return Image.blend(under, img, ease((t - an['t0']) / fade))
        if an['t1'] - t < fade and not self._contig(k, k + 1) and an['t1'] < self.tl['duration'] - 0.6:
            return Image.blend(self._screen(an['t1'] + 0.02)[0], img, ease((an['t1'] - t) / fade))
        return img

    def frame(self, t):
        for k, an in enumerate(self.anims):
            if an['t0'] <= t < an['t1']:
                return self._overlays(self._anim_mix(k, t), t, (0.0, 0.0, float(self.W), float(self.H)))
        out, cam = self._screen(t)
        return self._overlays(out, t, cam)

    def _screen(self, t):
        src, prev_src, mix = self.shot_at(t)
        cam = self.camera_at(t)
        key = (src, prev_src, round(mix, 3), tuple(round(v, 2) for v in cam))
        if key == self._frame_cache_key:
            base = self._frame_cache
        else:
            cv = self.canvas(src)
            if prev_src is not None and mix < 1:
                pv = self.canvas(prev_src)
                cv = (pv.astype(np.float32) * (1 - mix) + cv.astype(np.float32) * mix).astype(np.uint8)
            x0, y0, w, h = [v * self.ss for v in cam]
            im = Image.fromarray(cv)
            if abs(w - self.CW) < 0.5 and abs(h - self.CH) < 0.5:
                im = im.resize((self.W, self.H), Image.LANCZOS) if self.ss != 1 else im
            else:
                im = im.resize((self.W, self.H), Image.BICUBIC, box=(x0, y0, x0 + w, y0 + h))
            base = im
            self._frame_cache_key, self._frame_cache = key, base
        out = base.copy()
        scale = self.W / cam[2]  # final px per canvas unit at this camera

        def to_screen(final_pt):
            return ((final_pt[0] - cam[0]) * scale, (final_pt[1] - cam[1]) * scale)

        # click ripples
        for c in self.tl.get('clicks', []):
            dt = t - c['t']
            if 0 <= dt < 0.55:
                sx, sy = to_screen(self.css_to_final(c['pos']))
                e = dt / 0.55
                rad = 26 + 90 * (1 - (1 - e) ** 3)
                alpha = int(210 * (1 - e))
                ov = Image.new('RGBA', (int(rad * 2 + 20), int(rad * 2 + 20)), (0, 0, 0, 0))
                d = ImageDraw.Draw(ov)
                o = 10
                d.ellipse([o, o, o + rad * 2, o + rad * 2], fill=self.primary + (int(alpha * 0.28),), outline=self.primary + (alpha,), width=9)
                out.paste(ov, (int(sx - rad - o), int(sy - rad - o)), ov)
        # cursor
        pos, kind, visible = self.cursor_at(t)
        if visible and pos is not None:
            sx, sy = to_screen(self.css_to_final(pos))
            press = 1.0
            for c in self.tl.get('clicks', []):
                dt = t - c['t']
                if -0.08 <= dt < 0.18:
                    press = 0.86
            im, (hx, hy), bbox = self.cursors.get(kind, self.cursors['arrow'])
            size = self.cursor_px * press * (0.9 + 0.1 * min(scale / (self.W / self.W), 1.6))
            f = size / im.size[1]
            cim = im.resize((max(1, int(im.size[0] * f)), max(1, int(im.size[1] * f))), Image.LANCZOS)
            # soft drop shadow
            shadow = Image.new('RGBA', cim.size, (0, 0, 0, 0))
            shadow.putalpha(cim.getchannel('A').point(lambda a: int(a * 0.35)))
            shadow = shadow.filter(ImageFilter.GaussianBlur(4))
            out.paste(shadow, (int(sx - hx * f + 6), int(sy - hy * f + 8)), shadow)
            out.paste(cim, (int(sx - hx * f), int(sy - hy * f)), cim)
        return out, cam

    def _overlays(self, out, t, cam):
        # screen-space overlays (captions, chapter badge, title cards, keycaps)
        for ov in self.tl.get('overlays', []):
            if ov['t0'] <= t < ov['t1']:
                fade = ov.get('fade', 0.2)
                fin, fout = ov.get('fade_in', fade), ov.get('fade_out', fade)
                a = 1.0
                if fin > 0:
                    a = min(a, (t - ov['t0']) / fin)
                if fout > 0:
                    a = min(a, (ov['t1'] - t) / fout)
                oid = ov.get('id') or ''
                if oid == 'brand' or oid.startswith('chap'):
                    # top pills sit over the app once the camera zooms in: fade them out
                    zoom = self.W / cam[2]
                    a *= max(0.0, min(1.0, (1.12 - zoom) / 0.12))
                    if a <= 0.01:
                        continue
                oimg = self.img(ov['src'])
                if a < 1:
                    oimg = oimg.copy()
                    oimg.putalpha(oimg.getchannel('A').point(lambda v, a=a: int(v * a)))
                out.paste(oimg, tuple(ov.get('pos', [0, 0])), oimg)
        return out


def encoder_args(tl):
    fps = tl['fps']
    return ['-c:v', 'h264_nvenc', '-preset', 'p6', '-tune', 'hq', '-rc', 'vbr', '-cq', '19',
            '-b:v', '42M', '-maxrate', '60M', '-bufsize', '84M', '-profile:v', 'high', '-level', '5.2',
            '-g', str(fps // 2), '-bf', '2', '-pix_fmt', 'yuv420p']


def render_chunk(args):
    tl_path, base, out, f0, f1 = args
    tl = json.load(open(tl_path, encoding='utf-8'))
    comp = Composer(tl, base)
    fps = tl['fps']
    W, H = tl['size']
    cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(fps),
           '-i', '-', *encoder_args(tl), out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    last_key, last_bytes = None, None
    t0 = time.time()
    for f in range(f0, f1):
        t = f / fps
        img = comp.frame(t)
        b = img.tobytes()
        p.stdin.write(b)
    p.stdin.close()
    p.wait()
    return out, f1 - f0, time.time() - t0


def main():
    tl_path, out = sys.argv[1], sys.argv[2]
    argv = sys.argv[3:]
    workers = int(argv[argv.index('--workers') + 1]) if '--workers' in argv else 6
    base = os.path.dirname(os.path.dirname(os.path.abspath(tl_path))) if '--base' not in argv else argv[argv.index('--base') + 1]
    tl = json.load(open(tl_path, encoding='utf-8'))
    fps = tl['fps']
    t_from = float(argv[argv.index('--from') + 1]) if '--from' in argv else 0.0
    t_to = float(argv[argv.index('--to') + 1]) if '--to' in argv else tl['duration']
    F0, F1 = int(t_from * fps), int(math.ceil(t_to * fps))
    n = max(1, min(workers, (F1 - F0) // (fps * 2) or 1))
    step = math.ceil((F1 - F0) / n)
    tmpdir = os.path.join(os.path.dirname(out), '_chunks')
    os.makedirs(tmpdir, exist_ok=True)
    jobs = [(tl_path, base, os.path.join(tmpdir, f'c{i:03d}.mp4'), F0 + i * step, min(F1, F0 + (i + 1) * step)) for i in range(n)]
    jobs = [j for j in jobs if j[3] < j[4]]
    t0 = time.time()
    with ProcessPoolExecutor(len(jobs)) as ex:
        for o, nf, dt in ex.map(render_chunk, jobs):
            print(f'chunk {os.path.basename(o)} {nf} frames {dt:.0f}s ({nf / max(dt, 0.01):.1f} fps)', flush=True)
    lst = os.path.join(tmpdir, 'list.txt')
    with open(lst, 'w') as fh:
        for j in jobs:
            fh.write(f"file '{os.path.abspath(j[2])}'\n")
    silent = out + '.video.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', silent], check=True)
    audio = tl.get('audio_track')
    if audio:
        a_path = os.path.join(base, audio)
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', silent, '-ss', str(t_from), '-to', str(t_to), '-i', a_path,
                        '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '384k', '-ac', '2', '-ar', '48000',
                        '-movflags', '+faststart', '-shortest', out], check=True)
        os.remove(silent)
    else:
        os.replace(silent, out)
    print(f'done {out} in {time.time() - t0:.0f}s')


if __name__ == '__main__':
    main()
