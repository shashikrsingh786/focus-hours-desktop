"""Synthesize Piper cues and mux them onto docs/demo.mp4."""

from __future__ import annotations

import io
import json
import re
import shutil
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
CUES_PATH = HERE / "cues.json"
VIDEO = ROOT / "docs" / "demo.mp4"
WAV_OUT = HERE / "narration.wav"
FFMPEG = ROOT / "node_modules" / "ffmpeg-static" / "ffmpeg.exe"


def load_cues():
    return json.loads(CUES_PATH.read_text(encoding="utf-8"))


def video_duration_seconds(path: Path) -> float:
    result = subprocess.run(
        [str(FFMPEG), "-i", str(path)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    match = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", result.stderr)
    if not match:
        raise RuntimeError("Could not read video duration")
    hours, minutes, seconds = match.groups()
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def synthesize(voice, text: str, config) -> tuple[np.ndarray, int]:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        voice.synthesize_wav(text, wav_file, syn_config=config)
    buffer.seek(0)
    with wave.open(buffer, "rb") as wav_file:
        sample_rate = wav_file.getframerate()
        frames = wav_file.readframes(wav_file.getnframes())
        channels = wav_file.getnchannels()
    samples = np.frombuffer(frames, dtype=np.int16).astype(np.float32)
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1)
    return samples, sample_rate


def write_wav(path: Path, samples: np.ndarray, sample_rate: int) -> None:
    clipped = np.clip(samples, -32767, 32767).astype(np.int16)
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(clipped.tobytes())


def mux(video: Path, narration: Path) -> None:
    staged = video.with_suffix(".vo.mp4")
    cmd = [
        str(FFMPEG), "-y",
        "-i", str(video),
        "-i", str(narration),
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-map", "0:v:0", "-map", "1:a:0",
        "-shortest",
        "-movflags", "+faststart",
        str(staged),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise RuntimeError(result.stderr[-2000:])
    shutil.move(str(staged), str(video))


def main() -> int:
    from piper import PiperVoice, SynthesisConfig

    cues = load_cues()
    model = HERE / "voices" / f"{cues['voice']}.onnx"
    if not model.exists():
        print(f"Missing voice model: {model}", file=sys.stderr)
        return 1
    if not VIDEO.exists() or not FFMPEG.exists():
        print("Need docs/demo.mp4 and ffmpeg-static.", file=sys.stderr)
        return 1

    voice = PiperVoice.load(str(model))
    config = SynthesisConfig(
        volume=float(cues.get("volume", 1.0)),
        length_scale=float(cues.get("lengthScale", 1.0)),
    )

    duration = video_duration_seconds(VIDEO)
    sample_rate = None
    timeline = None

    for cue in cues["cues"]:
        samples, rate = synthesize(voice, cue["text"], config)
        if sample_rate is None:
            sample_rate = rate
            timeline = np.zeros(int(duration * sample_rate) + rate, dtype=np.float32)
        start = int(float(cue["at"]) * sample_rate)
        end = start + len(samples)
        if end > len(timeline):
            pad = np.zeros(end - len(timeline), dtype=np.float32)
            timeline = np.concatenate([timeline, pad])
        timeline[start:end] += samples
        print(f"  {cue['at']:5.1f}s  {len(samples) / sample_rate:4.1f}s  {cue['text']}")

    write_wav(WAV_OUT, timeline, sample_rate)
    mux(VIDEO, WAV_OUT)
    print(f"wrote {WAV_OUT}")
    print(f"wrote {VIDEO}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
