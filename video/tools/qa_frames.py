"""Sample QA frames from the rendered video: ~1s after every click / camera move / scene start.
usage: python tools/qa_frames.py render/timeline.json render/coa-tutorial-4k.mp4 render/qa
writes <outdir>/qNNN_TTTT.T.jpg (1920px wide) + <outdir>/index.json [{file, t, caption}]"""
import json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor

tl_path, video, outdir = sys.argv[1:4]
base = os.path.dirname(os.path.dirname(os.path.abspath(tl_path)))
tl = json.load(open(tl_path, encoding='utf-8'))
spec = json.load(open(os.path.join(base, 'render/overlays.json'), encoding='utf-8'))
items = spec['items'] if isinstance(spec, dict) and 'items' in spec else (spec if isinstance(spec, list) else list(spec.values()))
cap_text = {it['id']: it.get('text', '') for it in items if isinstance(it, dict) and 'id' in it}

times = [c['t'] + 0.9 for c in tl['clicks']]
times += [k['t'] + k.get('dur', 0.9) + 0.3 for k in tl['camera']]
times += [o['t0'] + 1.0 for o in tl['overlays'] if o.get('layer') == 'title']
times = sorted(t for t in times if t < tl['duration'] - 0.2)
picked = []
for t in times:
    if not picked or t - picked[-1] >= 1.4:
        picked.append(round(t, 1))

def caption_at(t):
    for o in tl['overlays']:
        if o.get('layer') == 'caption' and o['t0'] <= t <= o['t1']:
            return cap_text.get(o.get('id'), '')
    return ''

os.makedirs(outdir, exist_ok=True)
for f in os.listdir(outdir):
    if f.endswith('.jpg'):
        os.remove(os.path.join(outdir, f))

def grab(i_t):
    i, t = i_t
    name = f'q{i:03d}_{t:06.1f}.jpg'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.2f}', '-i', video, '-frames:v', '1',
                    '-vf', 'scale=1920:-1', '-q:v', '3', os.path.join(outdir, name)], check=True)
    return {'file': f'{os.path.relpath(outdir, base)}/{name}'.replace('\\', '/'), 't': t, 'caption': caption_at(t)}

with ThreadPoolExecutor(8) as ex:
    index = list(ex.map(grab, enumerate(picked)))
json.dump(index, open(os.path.join(outdir, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(index), 'frames ->', outdir)
