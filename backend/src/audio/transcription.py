import asyncio
import io
import json
import logging
import os

import librosa
import soundfile as sf

from src.ai.api import send_openai_request
from src.aws_utils import S3Client

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 25 * 1024 * 1024


async def _get_transcription(
    audio_data: bytes,
    file_path: str,
) -> dict:
    """Transcribe a single audio chunk"""
    response = await send_openai_request(
        {},
        "audio/transcriptions",
        files={
            "file": (os.path.basename(file_path), audio_data, "audio/mpeg")
        },
        data={"model": "whisper-1"},
    )
    return response


def _split_audio(
    audio_data: bytes, segment_duration: int = 5 * 60
) -> list[bytes]:
    """
    Split audio into chunks, returning each chunk as bytes.

    Args:
        audio_data: Raw MP3 bytes
        segment_duration: Duration in seconds (default 5 minutes)

    Returns:
        List of byte chunks
    """
    # Load audio using librosa
    y, sr = librosa.load(io.BytesIO(audio_data))

    # Calculate samples per segment
    samples_per_segment = int(sr * segment_duration)
    chunks = []

    # Split into chunks and convert each to bytes
    for i in range(0, len(y), samples_per_segment):
        chunk = y[i : i + samples_per_segment]

        # Convert numpy array to bytes using BytesIO
        byte_stream = io.BytesIO()
        sf.write(byte_stream, chunk, sr, format="mp3")
        chunks.append(byte_stream.getvalue())

    return chunks


def _stitch_transcripts(transcripts: list[dict]) -> dict:
    """Combine multiple transcript chunks into one"""
    full_text = " ".join(t["text"] for t in transcripts if t and "text" in t)
    return {"text": full_text}


async def create_transcription(
    s3_client: S3Client, audio_file_path: str
) -> None:
    transcript_file = audio_file_path.replace("audio.mp3", "transcript.json")
    exists = await s3_client.check_file_exists(transcript_file)
    if exists:
        return
    # download audio file
    audio_data, _, _ = await s3_client.download_file(audio_file_path)
    if len(audio_data) > MAX_FILE_SIZE:
        segments = _split_audio(audio_data)
        try:
            transcripts = await asyncio.gather(
                *[
                    _get_transcription(segment, f"{audio_file_path}.{i}.mp3")
                    for i, segment in enumerate(segments)
                ]
            )
        except Exception as e:
            logger.warning(f"Error transcribing {audio_file_path}: {e}")
            return
        response = _stitch_transcripts(transcripts)
    else:
        try:
            response = await _get_transcription(audio_data, audio_file_path)
        except Exception as e:
            logger.warning(f"Error transcribing {audio_file_path}: {e}")
            return
    await s3_client.upload_file(
        json.dumps(response).encode("utf-8"),
        transcript_file,
        "application/json",
    )
