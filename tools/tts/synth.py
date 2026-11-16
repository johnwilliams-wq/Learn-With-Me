#!/usr/bin/env python3
"""Make the voice clips listed in tools/tts/manifest.json.

Each clip's file name is a hash of (voice, speed, text), so a clip that already exists
is always up to date and is skipped. Run tools/tts/setup.sh once first.

  python tools/tts/synth.py            # make whatever is missing
  python tools/tts/synth.py --prune    # ...and delete clips that are no longer used

tools/tts/tweaks.json (optional) is for the rare sentence whose rendering has a glitch that
verify.py catches: { "The sentence.": { "speed": 0.9 } } renders that one sentence at another
speed, which gives a different take. The file name does not change, so delete the old clip.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
MODELS = Path(os.environ.get("LWM_TTS_MODELS", Path.home() / ".cache" / "tts"))
SR = 24000
TARGET_RMS_DB = -18.0   # loudness of the spoken part of every clip
PEAK_LIMIT_DB = -1.5
LEAD_PAD = 0.25         # seconds of silence before / after the speech (Bluetooth speakers swallow the first instant)
TAIL_PAD = 0.18


def load_engine():
    from kokoro_onnx import Kokoro
    from misaki import en, espeak

    g2p = en.G2P(trf=False, british=False, fallback=espeak.EspeakFallback(british=False))
    kokoro = Kokoro(str(MODELS / "kokoro-v1.0.onnx"), str(MODELS / "voices-v1.0.bin"))
    return g2p, kokoro


def clean(text):
    return text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')


def polish(samples):
    """Trim silence, even out the loudness, add a little padding."""
    x = np.asarray(samples, dtype=np.float32).flatten()
    level = np.abs(x)
    loud = np.where(level > 0.012)[0]
    if len(loud):
        x = x[max(0, loud[0] - int(0.02 * SR)): min(len(x), loud[-1] + int(0.06 * SR))]
    frame = int(0.03 * SR)
    frames = [x[i:i + frame] for i in range(0, max(1, len(x) - frame), frame)]
    rms = np.array([np.sqrt(np.mean(f * f)) for f in frames if len(f)])
    active = rms[rms > 0.02] if np.any(rms > 0.02) else rms
    cur = float(np.sqrt(np.mean(active * active))) if len(active) else 0.0
    if cur > 0:
        gain = (10 ** (TARGET_RMS_DB / 20)) / cur
        peak = float(np.max(np.abs(x))) * gain
        limit = 10 ** (PEAK_LIMIT_DB / 20)
        if peak > limit:
            gain *= limit / peak
        x = x * gain
    fade = int(0.008 * SR)
    if len(x) > 2 * fade:
        x[:fade] *= np.linspace(0, 1, fade, dtype=np.float32)
        x[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    return np.concatenate([np.zeros(int(LEAD_PAD * SR), np.float32), x, np.zeros(int(TAIL_PAD * SR), np.float32)])


def encode(samples, out_path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav = tmp.name
    try:
        sf.write(wav, samples, SR, subtype="PCM_16")
        part = out_path.with_suffix(".part.mp3")
        subprocess.run(
            ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-ac", "1", "-ar", str(SR),
             "-c:a", "libmp3lame", "-b:a", "48k", "-id3v2_version", "0", "-write_xing", "0", str(part)],
            check=True,
        )
        part.replace(out_path)
    finally:
        os.unlink(wav)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", default=str(ROOT / "tools" / "tts" / "manifest.json"))
    ap.add_argument("--prune", action="store_true", help="delete clips that are not in the manifest")
    ap.add_argument("--limit", type=int, default=0, help="only make this many (for a quick test)")
    args = ap.parse_args()

    manifest = json.loads(Path(args.manifest).read_text())
    tweaks_path = ROOT / "tools" / "tts" / "tweaks.json"
    tweaks = json.loads(tweaks_path.read_text()) if tweaks_path.exists() else {}
    todo = [c for c in manifest if not (ROOT / c["file"]).exists()]
    if args.limit:
        todo = todo[: args.limit]
    print(f"{len(manifest)} clips in the manifest, {len(todo)} to make", flush=True)

    if todo:
        g2p, kokoro = load_engine()
        start = time.time()
        seconds = 0.0
        for n, c in enumerate(todo, 1):
            phonemes, _ = g2p(clean(c["text"]))
            speed = float(tweaks.get(c["text"], {}).get("speed", c["speed"]))
            samples, sr = kokoro.create(phonemes, voice=c["voice"], speed=speed, is_phonemes=True)
            assert sr == SR, sr
            out = polish(samples)
            encode(out, ROOT / c["file"])
            seconds += len(out) / SR
            if n % 25 == 0 or n == len(todo):
                print(f"  {n}/{len(todo)}  {seconds / 60:.1f} min of audio  ({time.time() - start:.0f}s)", flush=True)

    if args.prune:
        wanted = {str(ROOT / c["file"]) for c in manifest}
        removed = 0
        for d in {str((ROOT / c["file"]).parent) for c in manifest}:
            for f in Path(d).glob("*.mp3"):
                if str(f) not in wanted:
                    f.unlink()
                    removed += 1
        print(f"pruned {removed} unused clips")
    return 0


if __name__ == "__main__":
    sys.exit(main())
