#!/usr/bin/env python3
"""Check every voice clip by "listening back" to it with a speech recogniser.

Nobody can proof-listen to hundreds of clips by ear, so each clip is transcribed
(faster-whisper) and the transcript is compared with the sentence it should say.
A clip passes when every word matches, allowing for made-up character names and
sound-alike spellings. Clips that fail the small model get a second opinion from a
larger one; whatever still fails is written to tools/tts/report.json for a human
(or Claude) to look at.

  python tools/tts/verify.py          # check clips that have not been checked yet
  python tools/tts/verify.py --all    # re-check everything
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")

# Invented names: the recogniser cannot be expected to spell these, so anything is accepted in their place.
NAMES = {"zip", "puff", "zazz", "sir", "clank", "pounce", "hoot", "boo", "dash", "blip", "blips"}
SAME = [
    {"two", "to", "too", "2"}, {"three", "3"}, {"four", "for", "4"}, {"one", "won", "1"},
    {"knight", "night"}, {"blue", "blew"}, {"red", "read"}, {"cozy", "cosy"}, {"color", "colour"},
    {"colors", "colours"}, {"ok", "okay"}, {"oh", "o"}, {"hi", "high", "hey"}, {"its", "it's"},
    {"lets", "let's"}, {"captains", "captain's"}, {"heros", "hero's", "heroes"}, {"camp", "camps"},
    {"campfire", "camp"}, {"bell", "belle"}, {"gem", "jem", "gym", "jam"}, {"boot", "boots"},
    {"wait", "weight"}, {"except", "accept"}, {"listened", "listen"}, {"ate", "eight"}, {"tap", "tapped"},
]
CANON = {}
for group in SAME:
    first = sorted(group)[0]
    for w in group:
        CANON[w] = first


def words(text):
    text = text.lower().replace("’", "'").replace("camp fire", "campfire")
    for long, short in (("every one", "everyone"), ("here is", "heres"), ("that is", "thats"), ("it is", "its"),
                        ("i am", "im"), ("do not", "dont"), ("you are", "youre"), ("what is", "whats"), ("let us", "lets")):
        text = text.replace(long, short)
    text = re.sub(r"[^a-z0-9' ]+", " ", text).replace("'", "")
    return [CANON.get(w, w) for w in text.split()]


def distance(ref, hyp):
    """Word edit distance where a name in the reference may match (or lose) any word for free."""
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        free = r in NAMES
        cur = [prev[0] + (0 if free else 1)]
        for j, h in enumerate(hyp, 1):
            sub = prev[j - 1] + (0 if (r == h or free) else 1)
            dele = prev[j] + (0 if free else 1)
            ins = cur[j - 1] + 1
            cur.append(min(sub, dele, ins))
        prev = cur
    return prev[-1]


def load(path):
    raw = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, dtype=np.float32)


def transcribe(model, audio):
    segments, _ = model.transcribe(audio, language="en", beam_size=5, condition_on_previous_text=False)
    return " ".join(s.text.strip() for s in segments)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    args = ap.parse_args()

    from faster_whisper import WhisperModel

    manifest = json.loads((ROOT / "tools" / "tts" / "manifest.json").read_text())
    done_path = ROOT / "tools" / "tts" / "verified.json"
    done = set() if args.all or not done_path.exists() else set(json.loads(done_path.read_text()))
    wanted = {c["file"] for c in manifest}
    done &= wanted
    todo = [c for c in manifest if c["file"] not in done]
    missing = [c["file"] for c in todo if not (ROOT / c["file"]).exists()]
    todo = [c for c in todo if (ROOT / c["file"]).exists()]
    print(f"{len(manifest)} clips, {len(done)} already checked, {len(todo)} to check, {len(missing)} missing", flush=True)

    failed = []
    if todo:
        small = WhisperModel("base.en", device="cpu", compute_type="int8", cpu_threads=4)
        start = time.time()
        for n, c in enumerate(todo, 1):
            audio = load(ROOT / c["file"])
            ref = words(c["text"])
            dur = len(audio) / 16000
            heard = transcribe(small, audio)
            ok = distance(ref, words(heard)) == 0 and 0.12 * len(ref) < dur < 1.2 * len(ref) + 1.5
            if ok:
                done.add(c["file"])
            else:
                failed.append({**c, "heard": heard, "seconds": round(dur, 2)})
            if n % 50 == 0 or n == len(todo):
                print(f"  {n}/{len(todo)}  {len(failed)} to double-check  ({time.time() - start:.0f}s)", flush=True)

    # Sentences a person has looked at and accepted, with the reason (tools/tts/accepted.json).
    accepted_path = ROOT / "tools" / "tts" / "accepted.json"
    accepted = json.loads(accepted_path.read_text()) if accepted_path.exists() else {}
    for c in [c for c in failed if c["text"] in accepted]:
        done.add(c["file"])
    failed = [c for c in failed if c["text"] not in accepted]

    still = []
    if failed:
        print(f"second opinion on {len(failed)} clips...", flush=True)
        big = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=4)
        for c in failed:
            heard2 = transcribe(big, load(ROOT / c["file"]))
            if distance(words(c["text"]), words(heard2)) == 0:
                done.add(c["file"])
            else:
                still.append({"file": c["file"], "text": c["text"], "heard_small_model": c["heard"], "heard_large_model": heard2, "seconds": c["seconds"]})

    done_path.write_text(json.dumps(sorted(done), indent=0) + "\n")
    report = {"clips": len(manifest), "verified": len(done), "missing": missing, "failed": still}
    (ROOT / "tools" / "tts" / "report.json").write_text(json.dumps(report, indent=1) + "\n")
    print(f"verified {len(done)}/{len(manifest)}; {len(still)} need a look; {len(missing)} missing")
    for f in still[:40]:
        print(f"  ? {f['text']!r}\n      heard {f['heard_large_model']!r}")
    return 1 if (still or missing) else 0


if __name__ == "__main__":
    sys.exit(main())
