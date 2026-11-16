#!/usr/bin/env python3
"""Second takes for the clips verify.py could not confirm (tools/tts/report.json -> failed).

The voice model now and then stumbles over one sentence (a swallowed syllable, a stray sound at
the end). The same sentence at a slightly different speed is a different take, so this tries a
few speeds, keeps the first one the speech recogniser hears correctly, and writes the speed to
tools/tts/tweaks.json so synth.py makes the same take next time. The file name does not change.

  python tools/tts/retake.py     # then run verify.py again

Whatever is still listed after this needs different words (or a line in accepted.json).
"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import synth  # noqa: E402
import verify  # noqa: E402

ROOT = synth.ROOT
FACTORS = [0.93, 1.07, 0.87, 1.13, 0.8]


def main():
    report = json.loads((ROOT / "tools" / "tts" / "report.json").read_text())
    failed = report.get("failed", [])
    if not failed:
        print("nothing to retake")
        return 0
    manifest = {c["file"]: c for c in json.loads((ROOT / "tools" / "tts" / "manifest.json").read_text())}
    tweaks_path = ROOT / "tools" / "tts" / "tweaks.json"
    tweaks = json.loads(tweaks_path.read_text()) if tweaks_path.exists() else {}

    from faster_whisper import WhisperModel

    g2p, kokoro = synth.load_engine()
    ears = [WhisperModel(name, device="cpu", compute_type="int8", cpu_threads=4) for name in ("base.en", "small.en")]
    left = 0
    for f in failed:
        c = manifest.get(f["file"])
        if not c:
            continue
        want = verify.words(c["text"])
        phonemes, _ = g2p(synth.clean(c["text"]))
        done = False
        for factor in FACTORS:
            speed = round(float(c["speed"]) * factor, 3)
            samples, _ = kokoro.create(phonemes, voice=c["voice"], speed=speed, is_phonemes=True)
            with tempfile.TemporaryDirectory() as tmp:
                take = Path(tmp) / "take.mp3"
                synth.encode(synth.polish(samples), take)
                audio = verify.load(take)
                heard = [verify.transcribe(m, audio) for m in ears]
                if all(verify.distance(want, verify.words(h)) == 0 for h in heard):  # stricter than verify.py: both must agree
                    (ROOT / c["file"]).write_bytes(take.read_bytes())
                    tweaks[c["text"]] = {"speed": speed, "why": f"the usual take was heard as: {f['heard_large_model'].strip()}"}
                    print(f"  ok at speed {speed}: {c['text']}")
                    done = True
                    break
        if not done:
            left += 1
            tweaks.pop(c["text"], None)
            print(f"  no clean take: {c['text']}")
    tweaks_path.write_text(json.dumps(dict(sorted(tweaks.items())), indent=1) + "\n")
    print(f"{len(failed) - left} retaken, {left} still unclear. Now run verify.py.")
    return 1 if left else 0


if __name__ == "__main__":
    sys.exit(main())
