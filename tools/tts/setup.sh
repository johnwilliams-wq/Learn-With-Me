#!/usr/bin/env bash
# One-time setup for making voice clips. Only needed when new sentences are added.
# Needs network access to PyPI and Hugging Face (huggingface.co and its download CDN).
# Everything is installed OUTSIDE the repo: a Python 3.12 virtualenv at ~/.venvs/tts
# and the model files (about 350 MB) in ~/.cache/tts.
set -euo pipefail

VENV="${LWM_TTS_VENV:-$HOME/.venvs/tts}"
MODELS="${LWM_TTS_MODELS:-$HOME/.cache/tts}"
export UV_LINK_MODE=copy

command -v uv >/dev/null || { echo "uv is required (https://docs.astral.sh/uv/)"; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg is required"; exit 1; }

# misaki (the pronunciation engine) needs Python < 3.13
[ -x "$VENV/bin/python" ] || uv venv --python 3.12 "$VENV"
uv pip install --python "$VENV/bin/python" kokoro-onnx "misaki==0.9.4" espeakng-loader num2words phonemizer-fork spacy soundfile faster-whisper numpy

# spaCy's small English model. Its wheel on Hugging Face has a non-standard file name,
# so download it and rename it with its real version before installing.
mkdir -p "$MODELS/wheels"
WHEEL="$MODELS/wheels/en_core_web_sm-any.whl"
[ -s "$WHEEL" ] || curl -fsSL -o "$WHEEL" "https://huggingface.co/spacy/en_core_web_sm/resolve/main/en_core_web_sm-any-py3-none-any.whl"
VER=$(python3 -c "import zipfile,re,sys; z=zipfile.ZipFile(sys.argv[1]); m=[n for n in z.namelist() if n.endswith('METADATA')][0]; print(re.search(r'^Version: (.+)$', z.read(m).decode(), re.M).group(1).strip())" "$WHEEL")
cp "$WHEEL" "$MODELS/wheels/en_core_web_sm-$VER-py3-none-any.whl"
uv pip install --python "$VENV/bin/python" "$MODELS/wheels/en_core_web_sm-$VER-py3-none-any.whl"

# The voice model (Kokoro-82M v1.0, Apache-2.0) in ONNX form.
for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  [ -s "$MODELS/$f" ] || curl -fsSL -o "$MODELS/$f" "https://huggingface.co/fastrtc/kokoro-onnx/resolve/main/$f"
done

echo "Ready. Make clips with:   $VENV/bin/python tools/tts/synth.py --prune"
echo "Then check them with:     $VENV/bin/python tools/tts/verify.py"
