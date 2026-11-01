"""Turn storyboard narration + captured action metadata into a resolved timeline.

Inputs (all under the project dir):
  script.json   scenes: [{id, kind:'title'|'screen', overlay?, chapter?:{badge,title}, narration,
                          lead?, tail?, voice? (ElevenLabs voice id)}]
                narration syntax:  {a}  = sync marker (action 'a' fires at the next spoken word)
                                   |    = caption break
                                   [display|spoken] = caption shows display, TTS speaks spoken
  capture.json  {css_size:[w,h], primary:'#hex', scenes:{scene_id:[action...]}} written by capture.mjs
                action: {act:'shot', src, fade?, mark?}
                        {act:'hover'|'click', pos:[x,y], kind?, src?, after?, mark?}
                        {act:'type', pos:[x,y], frames:[src...], mark?, click?:bool}
                        {act:'frames', frames:[src...], step?, mark?}       (scroll / progressive states)
                        {act:'zoom', center:[x,y], z, mark?, dur?}  {act:'unzoom', mark?}
                        {act:'cursor', hide:bool, mark?}
Outputs: timeline.json, overlays.json (spec for overlays.mjs), audio/narration.wav
usage: python build_timeline.py <project_dir> [--no-tts]
"""
import hashlib, json, os, re, subprocess, sys, wave
import numpy as np

PROJ = os.path.abspath(sys.argv[1])
NO_TTS = '--no-tts' in sys.argv
FPS = 30
SR = 48000
VOICE = 'nealpwJT5tCyJFKDzEq8'  # ElevenLabs Aom (Thai female, in this account)

# layout (final 3840x2160 units) — keep in sync with overlays chrome size
CONTENT = [480, 225, 2880, 1620]
CHROME_H = 80
RADIUS = 36
SCREEN_ACTS = ('shot', 'hover', 'click', 'type', 'frames', 'drag', 'key')


def parse_narration(text):
    """returns display_text, spoken_text, markers{name: spoken_idx}, breaks[spoken_idx...], disp_breaks"""
    disp, spoken = [], []
    markers, breaks, dbreaks = {}, [], []
    i = 0
    while i < len(text):
        c = text[i]
        if c == '{':
            j = text.index('}', i)
            markers[text[i + 1:j]] = len(''.join(spoken))
            i = j + 1
            continue
        if c == '|':
            breaks.append(len(''.join(spoken)))
            dbreaks.append(len(''.join(disp)))
            i += 1
            continue
        if c == '[':
            j = text.index(']', i)
            d, s = text[i + 1:j].split('|', 1) if '|' in text[i + 1:j] else (text[i + 1:j], text[i + 1:j])
            disp.append(d)
            spoken.append(s)
            i = j + 1
            continue
        disp.append(c)
        spoken.append(c)
        i += 1
    return ''.join(disp), ''.join(spoken), markers, breaks, dbreaks


ELEVEN_MODEL = 'eleven_v4'
ELEVEN_SETTINGS = {'stability': 0.5, 'similarity_boost': 0.75}  # 0.5 = ElevenLabs "Natural": lively but steady for a tutorial


def tts(text, out_wav, voice):
    """ElevenLabs with-timestamps -> 48 kHz mono WAV + per-character timings (same shape as the old word list)."""
    import base64, time, urllib.error, urllib.request
    # key read at run time only, never printed or written (same file as BotPress/Botstery)
    key = open(os.path.join(os.environ['LOCALAPPDATA'], 'BotPress', 'elevenlabs.key'), encoding='utf-8').read().strip()
    body = json.dumps({'text': text, 'model_id': ELEVEN_MODEL, 'language_code': 'th', 'voice_settings': ELEVEN_SETTINGS}).encode('utf-8')
    url = f'https://api.elevenlabs.io/v1/text-to-speech/{voice}/with-timestamps?output_format=pcm_48000'
    for attempt in range(5):
        req = urllib.request.Request(url, body, {'xi-api-key': key, 'Content-Type': 'application/json; charset=utf-8'})
        try:
            j = json.load(urllib.request.urlopen(req, timeout=180))
            break
        except urllib.error.HTTPError as e:
            if e.code != 429 and e.code < 500 or attempt == 4:
                raise RuntimeError(f'ElevenLabs {e.code}: ' + e.read()[:300].decode('utf-8', 'replace'))
        except urllib.error.URLError as e:
            if attempt == 4:
                raise
        print('tts retry', attempt, flush=True)
        time.sleep(2 * 2 ** attempt)
    with wave.open(out_wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(base64.b64decode(j['audio_base64']))
    al = j['alignment']
    return [{'t': t0, 'd': t1 - t0, 'text': ch} for ch, t0, t1 in
            zip(al['characters'], al['character_start_times_seconds'], al['character_end_times_seconds'])]


def word_char_starts(spoken, words):
    pos = 0
    out = []
    for w in words:
        k = spoken.find(w['text'], pos)
        if k < 0:
            k = pos
        out.append(k)
        pos = k + len(w['text'])
    return out


def time_at_char(idx, words, starts, audio_len):
    for w, s in zip(words, starts):
        if s >= idx:
            return w['t']
    return audio_len


def decode(mp3):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', mp3, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32)


def click_sfx():
    n = int(0.045 * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(7)
    noise = rng.standard_normal(n) * np.exp(-t * 180)
    tone = np.sin(2 * np.pi * 1850 * t) * np.exp(-t * 120)
    s = (0.55 * tone + 0.25 * noise)
    return (s / np.abs(s).max() * 0.16).astype(np.float32)


def key_sfx(i):
    # mechanical key tick; pitch/level vary per press so typing does not sound like a metronome
    rng = np.random.default_rng(100 + i)
    n = int(0.03 * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n) * np.exp(-t * 260)
    tone = np.sin(2 * np.pi * rng.uniform(2300, 3100) * t) * np.exp(-t * 300)
    s = 0.5 * tone + 0.5 * noise
    return (s / np.abs(s).max() * rng.uniform(0.05, 0.08)).astype(np.float32)


def pop_sfx():
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    f = 520 + 900 * (t / t[-1])
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 34)
    return (s / np.abs(s).max() * 0.13).astype(np.float32)


def main():
    script = json.load(open(os.path.join(PROJ, 'script.json'), encoding='utf-8'))
    cap = json.load(open(os.path.join(PROJ, 'capture.json'), encoding='utf-8'))
    os.makedirs(os.path.join(PROJ, 'tts'), exist_ok=True)
    os.makedirs(os.path.join(PROJ, 'audio'), exist_ok=True)
    theme = {'primary': cap.get('primary') or script.get('primary', '#812920')}
    voice = script.get('voice', VOICE)
    tvars = cap.get('vars', {})
    for sc in script['scenes']:  # {{name}} -> value captured at record time (issue codes etc.)
        sc['narration'] = re.sub(r'\{\{(\w+)\}\}', lambda m: str(tvars.get(m.group(1), m.group(0))), sc.get('narration', ''))

    # 1) TTS per scene (cached by text hash)
    scene_audio = {}
    for sc in script['scenes']:
        disp, spoken, markers, breaks, dbreaks = parse_narration(sc.get('narration', ''))
        sc['_p'] = (disp, spoken, markers, breaks, dbreaks)
        if not spoken.strip():
            continue
        key = sc['id'] + '-' + hashlib.md5('|'.join([spoken, sc.get('voice', voice), ELEVEN_MODEL, json.dumps(ELEVEN_SETTINGS)]).encode('utf-8')).hexdigest()[:10]
        mp3 = os.path.join(PROJ, 'tts', key + '.wav')
        meta = mp3 + '.json'
        if os.path.exists(mp3) and os.path.exists(meta):
            words = json.load(open(meta, encoding='utf-8'))
        else:
            if NO_TTS:
                raise SystemExit('missing tts for ' + sc['id'])
            print('tts', sc['id'], flush=True)
            words = tts(spoken, mp3, sc.get('voice', voice))
            json.dump(words, open(meta, 'w', encoding='utf-8'), ensure_ascii=False)
        pcm = decode(mp3)
        scene_audio[sc['id']] = (mp3, words, pcm)

    # 2) overlays spec (static ones first)
    ov_items = [
        {'id': 'chrome', 'kind': 'chrome', 'width': int(CONTENT[2] * 1.5), 'height': int(CHROME_H * 1.5), 'radius': int(RADIUS * 1.5),
         'url': cap.get('url_display', 'localhost:3300')},
        {'id': 'brand', 'kind': 'brand', 'text': script.get('brand_text', 'สอนใช้งาน · ผังบัญชี')},
    ]
    for it in script.get('title_cards', []):
        ov_items.append(dict(it, kind='title'))

    tl = {'fps': FPS, 'size': [3840, 2160], 'ss': 1.5, 'theme': theme,
          'window': {'content': CONTENT, 'chrome_h': CHROME_H, 'radius': RADIUS, 'chrome_png': 'render/ov/chrome.png'},
          'shot_css_size': cap['css_size'], 'cursor_px': 92,
          'shots': [], 'camera': [], 'cursor': [], 'clicks': [], 'overlays': [], 'anims': [], 'vars': tvars, 'audio_track': 'audio/narration.wav'}
    audio_events = []
    caption_cues = []
    typing_ts, pops, key_ids = [], [], set()
    after_anim = False
    chapters = []
    t = 0.0
    cur_pos = None
    first_shot = None
    cam_end = 0.0
    for sc in script['scenes']:
        disp, spoken, markers, breaks, dbreaks = sc['_p']
        lead = sc.get('lead', 0.45)
        tail = sc.get('tail', 0.7)
        a = scene_audio.get(sc['id'])
        alen = len(a[2]) / SR if a else 0.0
        words = a[1] if a else []
        starts = word_char_starts(spoken, words) if a else []
        t_audio = t + lead

        def mark_time(name, default):
            if name and name in markers:
                return t_audio + time_at_char(markers[name], words, starts, alen)
            return default

        if a:
            audio_events.append((t_audio, a[2]))
            # caption cues: split display text at breaks, time by spoken breaks
            dparts, last = [], 0
            for b in dbreaks + [len(disp)]:
                dparts.append(disp[last:b].strip())
                last = b
            sb = [0] + breaks
            for i, part in enumerate(dparts):
                if not part:
                    continue
                c0 = t_audio + time_at_char(sb[i], words, starts, alen) - 0.05
                c1 = (t_audio + time_at_char(sb[i + 1], words, starts, alen) - 0.05) if i + 1 < len(sb) else t_audio + alen + 0.35
                caption_cues.append((max(t, c0), c1, part))
        scene_end = t_audio + alen + tail

        if sc.get('kind') == 'anim':
            # full-screen motion graphics (anim.mjs renders stage frames); markers become stage cues, {!x} adds a pop
            d = max(scene_end - t, sc.get('min', 3.0))
            cues = {'_' + sc['id']: 0.0}
            if sc.get('chapter'):  # YouTube chapter only: no on-screen badge over motion graphics
                chapters.append((t, dict(sc['chapter'], yt_only=True)))
            for n in markers:
                ct = mark_time(n, t) - t
                if n.startswith('!'):
                    pops.append(t + ct)
                cues[n.lstrip('!')] = round(ct, 3)
            if sc.get('typing'):  # key ticks while the stage typewriter runs between two cues
                a0, a1 = (cues[k] for k in sc['typing'])
                typing_ts.extend(t + a0 + i / 17.0 for i in range(int((a1 - 0.4 - a0) * 17)))
            prev = tl['anims'][-1] if tl['anims'] else None
            if prev and prev['stage'] == sc['stage'] and abs(prev['t1'] - t) < 1e-3:
                off = t - prev['t0']
                prev['cues'].update({k: round(v + off, 3) for k, v in cues.items()})
                prev['t1'] = round(t + d, 3)
            else:
                tl['anims'].append({'t0': round(t, 3), 't1': round(t + d, 3), 'stage': sc['stage'], 'cues': cues})
            t = round(t + d, 3)
            after_anim = True
            continue

        if sc.get('kind') == 'title':
            d = max(scene_end - t, sc.get('min', 4.0))
            tl['overlays'].append({'t0': t, 't1': t + d, 'src': f"render/ov/{sc['overlay']}.png", 'pos': [0, 0], 'fade': 0.5 if t > 0 else 0.01, 'layer': 'title'})
            t += d
            continue

        if sc.get('chapter'):
            chapters.append((t, sc['chapter']))
        # actions
        acts = cap['scenes'].get(sc['id'], [])
        cursor_t = t + 0.2
        last_end = t
        for ac in acts:
            at = mark_time(ac.get('mark'), max(cursor_t, last_end + ac.get('gap', 0.35)))
            kind = ac['act']
            if kind in SCREEN_ACTS and at < last_end + 0.05:
                if last_end + 0.05 - at > 0.6:
                    print(f"  late {sc['id']}:{ac.get('mark') or kind} by {last_end + 0.05 - at:.2f}s", flush=True)
                at = last_end + 0.05
            if kind in ('zoom', 'unzoom'):
                if kind == 'unzoom' and not ac.get('mark'):  # hold the zoomed spot long enough to read
                    at = max(at, cam_end + 1.6)
                at = max(at, cam_end)
                cam_end = at + ac.get('dur', 0.9)
            if kind == 'shot':
                if after_anim and not ac.get('mark'):  # be on screen already while the anim fades out
                    at, ac = t, dict(ac, fade=0)
                after_anim = False
                tl['shots'].append({'t': at, 'src': ac['src'], 'fade': ac.get('fade', 0.3)})
                first_shot = first_shot or ac['src']
                last_end = at + ac.get('fade', 0.3)
            elif kind in ('hover', 'click', 'type'):
                pos = ac['pos']
                mv = ac.get('move', 0.75 if cur_pos else 0.0)
                if cur_pos is None:
                    tl['cursor'].append({'t': max(t, at - 0.5), 'pos': pos, 'kind': ac.get('kind', 'arrow'), 'dur': 0})
                else:
                    start = max(last_end, at - mv)
                    tl['cursor'].append({'t': start, 'pos': pos, 'kind': ac.get('kind', 'arrow'), 'dur': max(0.15, at - start)})
                cur_pos = pos
                if ac.get('src'):  # hover state screenshot
                    tl['shots'].append({'t': at - 0.12, 'src': ac['src'], 'fade': 0.12})
                if kind == 'click' or (kind == 'type' and ac.get('click', True)):
                    tl['clicks'].append({'t': at, 'pos': pos})
                if ac.get('after'):
                    tl['shots'].append({'t': at + ac.get('after_delay', 0.18), 'src': ac['after'], 'fade': ac.get('fade', 0.25)})
                last_end = at + ac.get('after_delay', 0.18) + 0.25
                if kind == 'type':
                    step = ac.get('step', 0.085)
                    for i, fr in enumerate(ac['frames']):
                        tl['shots'].append({'t': at + 0.3 + i * step, 'src': fr, 'fade': 0})
                        typing_ts.append(at + 0.3 + i * step)
                    last_end = at + 0.3 + len(ac['frames']) * step
            elif kind == 'drag':
                p0, p1 = ac['from'], ac['to']
                start = max(last_end, at - 0.75) if cur_pos else at - 0.5
                tl['cursor'].append({'t': start, 'pos': p0, 'kind': ac.get('kind', 'arrow'), 'dur': max(0.15, at - start) if cur_pos else 0})
                if ac.get('src'):
                    tl['shots'].append({'t': at - 0.12, 'src': ac['src'], 'fade': 0.12})
                step = ac.get('step', 0.11)
                tl['cursor'].append({'t': at + 0.15, 'pos': p1, 'kind': ac.get('kind', 'arrow'), 'dur': len(ac['frames']) * step})
                for i, fr in enumerate(ac['frames']):
                    tl['shots'].append({'t': at + 0.15 + (i + 1) * step, 'src': fr, 'fade': 0})
                cur_pos = p1
                last_end = at + 0.15 + len(ac['frames']) * step + 0.2
            elif kind == 'frames':
                step = ac.get('step', 0.12)
                for i, fr in enumerate(ac['frames']):
                    tl['shots'].append({'t': at + i * step, 'src': fr, 'fade': ac.get('fade', 0.08)})
                last_end = at + len(ac['frames']) * step
            elif kind == 'zoom':
                tl['camera'].append({k: v for k, v in {'t': at, 'center': ac['center'], 'z': ac['z'], 'dur': ac.get('dur', 0.9), 'free': ac.get('free'), 'bias': ac.get('bias')}.items() if v is not None})
                last_end = max(last_end, at)
            elif kind == 'unzoom':
                tl['camera'].append({'t': at, 'full': True, 'dur': ac.get('dur', 0.9)})
                last_end = max(last_end, at)
            elif kind == 'key':  # keycap overlay (e.g. Ctrl + K) + optional screen change
                kid = 'key_' + '_'.join(k.lower() for k in ac['keys'])
                if kid not in key_ids:
                    key_ids.add(kid)
                    ov_items.append({'id': kid, 'kind': 'keys', 'keys': ac['keys']})
                tl['overlays'].append({'t0': at, 't1': at + ac.get('show', 1.5), 'src': f'render/ov/{kid}.png', 'id': kid, 'fade': 0.15, 'layer': 'keys'})
                typing_ts.extend([at, at + 0.09] if len(ac['keys']) > 1 else [at])
                if ac.get('after'):
                    tl['shots'].append({'t': at + 0.15, 'src': ac['after'], 'fade': ac.get('fade', 0.2)})
                last_end = at + 0.4
            elif kind == 'toast':  # "AI did X via MCP" notification while the screen shows the result
                tid = f'toast{len(key_ids):02d}'
                key_ids.add(tid)
                ov_items.append({'id': tid, 'kind': 'toast', 'emoji': ac.get('emoji', ''), 'who': ac['who'], 'text': ac['text']})
                tl['overlays'].append({'t0': at, 't1': at + ac.get('show', 3.2), 'src': f'render/ov/{tid}.png', 'id': tid, 'fade': 0.25, 'layer': 'keys'})
                pops.append(at)
                last_end = max(last_end, at)
            elif kind == 'cursor':
                tl['cursor'].append({'t': at, 'hide': ac.get('hide', True)})
            cursor_t = last_end
        t = max(scene_end, last_end + sc.get('hold', 0.6))

    tl['duration'] = round(t + 0.5, 3)
    tl['shots'].sort(key=lambda s: s['t'])
    tl['cursor'].sort(key=lambda s: s['t'])
    tl['camera'].sort(key=lambda s: s['t'])
    if tl['shots'] and tl['shots'][0]['t'] > 0:
        tl['shots'].insert(0, {'t': 0, 'src': tl['shots'][0]['src'], 'fade': 0})

    # chapter + caption overlays
    for i, (ct, ch) in enumerate(chapters):
        if ch.get('yt_only'):
            continue
        oid = f'chap{i:02d}'
        ov_items.append({'id': oid, 'kind': 'chapter', 'badge': ch['badge'], 'title': ch['title']})
        t1 = chapters[i + 1][0] if i + 1 < len(chapters) else tl['duration']
        # end chapter badge when a title card starts
        for o in tl['overlays'] + [dict(a, layer='title') for a in tl['anims']]:
            if o.get('layer') == 'title' and ct < o['t0'] < t1:
                t1 = o['t0']
        tl['overlays'].append({'t0': ct, 't1': t1, 'src': f'render/ov/{oid}.png', 'id': oid, 'fade': 0.35})
    # brand mark whenever not on a title card
    titles = sorted([(o['t0'], o['t1']) for o in tl['overlays'] if o.get('layer') == 'title'] + [(a['t0'], a['t1']) for a in tl['anims']])
    free, last = [], 0.0
    for a0, a1 in titles:
        if a0 > last:
            free.append((last, a0))
        last = max(last, a1)
    if last < tl['duration']:
        free.append((last, tl['duration']))
    for i, (a0, a1) in enumerate(free):
        tl['overlays'].append({'t0': a0, 't1': a1, 'src': 'render/ov/brand.png', 'id': 'brand', 'fade': 0.35})
    srt = []
    for i, (c0, c1, text) in enumerate(caption_cues):
        oid = f'cap{i:03d}'
        ov_items.append({'id': oid, 'kind': 'caption', 'text': text})
        cue = {'t0': c0, 't1': c1, 'src': f'render/ov/{oid}.png', 'id': oid, 'fade': 0.12, 'layer': 'caption'}
        # back-to-back captions swap text in place: a fade-out + fade-in would blink the box half-transparent
        if i > 0 and c0 - caption_cues[i - 1][1] < 0.05:
            cue['fade_in'] = 0
        if i + 1 < len(caption_cues) and caption_cues[i + 1][0] - c1 < 0.05:
            cue['fade_out'] = 0
        tl['overlays'].append(cue)
        srt.append((c0, c1, text))
    # title overlays must be drawn above everything except captions: order = title, chapter/brand, caption
    order = {'title': 0, None: 1, 'keys': 2, 'caption': 3}
    tl['overlays'].sort(key=lambda o: (order.get(o.get('layer')), o['t0']))
    json.dump({'theme': theme, 'items': ov_items}, open(os.path.join(PROJ, 'render/overlays.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    # 3) audio track
    total = int((tl['duration'] + 1) * SR)
    mix = np.zeros(total, np.float32)
    for at, pcm in audio_events:
        i0 = int(at * SR)
        mix[i0:i0 + len(pcm)] += pcm[:max(0, total - i0)]
    sfx = click_sfx()
    for c in tl['clicks']:
        i0 = int(c['t'] * SR)
        mix[i0:i0 + len(sfx)] += sfx[:max(0, total - i0)]
    for i, kt in enumerate(typing_ts):
        k = key_sfx(i)
        i0 = int(kt * SR)
        mix[i0:i0 + len(k)] += k[:max(0, total - i0)]
    pop = pop_sfx()
    for pt in pops:
        i0 = int(pt * SR)
        mix[i0:i0 + len(pop)] += pop[:max(0, total - i0)]
    peak = np.abs(mix).max() or 1
    mix = mix / peak * 0.89
    raw_wav = os.path.join(PROJ, 'audio/narration_raw.wav')
    with wave.open(raw_wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw_wav, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=9', '-ar', str(SR), '-ac', '2',
                    os.path.join(PROJ, 'audio/narration.wav')], check=True)

    # 4) SRT + chapters list for YouTube
    def ts(x, sep=','):
        h, r = divmod(x, 3600); m, s = divmod(r, 60)
        return f'{int(h):02d}:{int(m):02d}:{int(s):02d}{sep}{int((s - int(s)) * 1000):03d}'
    with open(os.path.join(PROJ, 'render/subtitles_th.srt'), 'w', encoding='utf-8') as f:
        for i, (c0, c1, text) in enumerate(srt, 1):
            f.write(f'{i}\n{ts(c0)} --> {ts(c1)}\n{text}\n\n')
    with open(os.path.join(PROJ, 'render/chapters.txt'), 'w', encoding='utf-8') as f:
        f.write('00:00 บทนำ\n')
        for ct, ch in chapters:
            m, s = divmod(int(ct), 60)
            f.write(f"{m:02d}:{s:02d} {ch['title']}\n")
    json.dump(tl, open(os.path.join(PROJ, 'render/timeline.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f"timeline {tl['duration']:.1f}s, shots {len(tl['shots'])}, clicks {len(tl['clicks'])}, captions {len(srt)}, chapters {len(chapters)}")


if __name__ == '__main__':
    main()
