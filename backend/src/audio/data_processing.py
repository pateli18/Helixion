import base64
import io
import json
import logging
import wave
from typing import Optional

import numpy as np

from src.helixion_types import BarHeight, Speaker, SpeakerSegment

logger = logging.getLogger(__name__)


def process_audio_data(
    file_bytes: bytes,
    sample_rate: int,
) -> tuple[list[SpeakerSegment], bytearray]:
    bytes_per_sample = 1 if sample_rate == 8000 else 2
    file_str = file_bytes.decode("utf-8")
    speaker_segments: list[SpeakerSegment] = []
    total_ms = 0
    input_data_ms = 300
    user_speaking = False
    input_buffer_data: list[tuple[bytes, float]] = []
    audio_data: list[tuple[bytes, float, float, Optional[str]]] = (
        []
    )  # audio bytes, timestamp within item, item id
    segment_indices_to_remove = set()
    input_item_time_elapsed = 0
    output_item_time_elapsed = 0
    for line in file_str.splitlines():
        # exlcude timestamp
        line_data = json.loads(line.split("]", 1)[1].strip())
        if line_data["type"] == "input_audio_buffer.speech_started":
            output_item_time_elapsed = 0
            user_speaking = True
            speaker_segments.append(
                SpeakerSegment(
                    timestamp=total_ms / 1000,
                    speaker=Speaker.user,
                    transcript="",
                    item_id=line_data["item_id"],
                )
            )
            audio_start_ms = line_data["audio_start_ms"]
            for decoded_data, ms in input_buffer_data:
                if ms >= audio_start_ms:
                    segment_ms = (
                        (len(decoded_data) / bytes_per_sample)
                        * 1000.0
                        / sample_rate
                    )
                    input_item_time_elapsed += segment_ms
                    audio_data.append(
                        (
                            decoded_data,
                            segment_ms,
                            input_item_time_elapsed,
                            None,
                        )
                    )
                    total_ms += segment_ms

        elif (
            line_data["type"]
            == "conversation.item.input_audio_transcription.completed"
        ):
            item_id = line_data["item_id"]
            for segment in speaker_segments:
                if segment.item_id == item_id:
                    if segment.speaker != Speaker.user:
                        logger.exception("Matching segment is not the user")
                    else:
                        segment.transcript = line_data["transcript"]
                        break

        elif line_data["type"] == "input_audio_buffer.speech_stopped":
            user_speaking = False
            input_item_time_elapsed = 0
            speaker_segments.append(
                SpeakerSegment(
                    timestamp=total_ms / 1000,
                    speaker=Speaker.assistant,
                    transcript="",
                    item_id="",
                )
            )
        elif line_data["type"] == "response.audio.delta":
            decoded_data = base64.b64decode(line_data["delta"])
            segment_ms = (
                (len(decoded_data) / bytes_per_sample) * 1000.0 / sample_rate
            )
            output_item_time_elapsed += segment_ms
            audio_data.append(
                (
                    decoded_data,
                    segment_ms,
                    output_item_time_elapsed,
                    line_data["item_id"],
                )
            )
            total_ms += segment_ms

            # check if the latest speaker does not have an item_id, if not, add one
            if len(speaker_segments) == 0:
                speaker_segments.append(
                    SpeakerSegment(
                        timestamp=total_ms / 1000,
                        speaker=Speaker.assistant,
                        transcript="",
                        item_id=line_data["item_id"],
                    )
                )
            elif speaker_segments[-1].item_id == "":
                if speaker_segments[-1].speaker != Speaker.assistant:
                    logger.exception(
                        "Speaker segment does not have an item_id, but is not the assistant"
                    )
                else:
                    speaker_segments[-1].item_id = line_data["item_id"]

        elif line_data["type"] == "response.audio_transcript.done":
            item_id = line_data["item_id"]

            for segment in speaker_segments:
                if segment.item_id == item_id:
                    if segment.speaker != Speaker.assistant:
                        logger.exception(
                            "Matching segment is not the assistant"
                        )
                    else:
                        segment.transcript = line_data["transcript"]
                        break

        elif line_data["type"] == "input_audio_buffer.append":
            audio = line_data["audio"]
            decoded_data = base64.b64decode(audio)
            decoded_data_ms = (
                (len(decoded_data) / bytes_per_sample) * 1000.0 / sample_rate
            )
            input_data_ms += decoded_data_ms
            if user_speaking:
                total_ms += decoded_data_ms
                input_item_time_elapsed += decoded_data_ms
                audio_data.append(
                    (
                        decoded_data,
                        decoded_data_ms,
                        input_item_time_elapsed,
                        None,
                    )
                )
            else:
                input_buffer_data.append((decoded_data, input_data_ms))

        elif line_data["type"] == "conversation.item.truncated":
            amount_to_remove = 0
            for i, (_, segment_ms, elapsed_ms, item_id) in enumerate(
                audio_data
            ):
                if (
                    item_id is not None
                    and item_id == line_data["item_id"]
                    and line_data["audio_end_ms"] < elapsed_ms
                ):
                    # check previous elapsed_ms, and if it's not less than audio_end_ms, then this is a partially truncated segment.
                    if (
                        i > 0
                        and line_data["audio_end_ms"] >= audio_data[i - 1][2]
                    ):
                        # figure out number of bytes to remove
                        segment_ms_to_remove = (
                            elapsed_ms - line_data["audio_end_ms"]
                        )
                        amount_to_remove += segment_ms_to_remove
                        num_bytes_to_remove = int(
                            segment_ms_to_remove
                            * sample_rate
                            * bytes_per_sample
                            / 1000
                        )
                        audio_data[i] = (
                            audio_data[i][0][:-num_bytes_to_remove],
                            audio_data[i][1],
                            audio_data[i][2],
                            audio_data[i][3],
                        )
                    else:
                        amount_to_remove += segment_ms
                        segment_indices_to_remove.add(i)
            for i, speaker_segment in enumerate(speaker_segments):
                if speaker_segment.item_id == line_data["item_id"]:
                    speaker_segments[i + 1].timestamp -= (
                        amount_to_remove / 1000
                    )
            total_ms -= amount_to_remove
    final_audio_data = bytearray()
    for i, (audio_bytes, _, _, _) in enumerate(audio_data):
        if i not in segment_indices_to_remove:
            final_audio_data.extend(audio_bytes)
    return speaker_segments, final_audio_data


def calculate_bar_heights(
    samples: np.ndarray,
    num_bars: int,
    speaker_segments: list[SpeakerSegment],
    sample_rate: int,
) -> list[BarHeight]:
    if len(speaker_segments) == 0:
        return []

    # Reshape samples into num_bars segments
    samples_per_bar = len(samples) // num_bars
    segments = samples[: samples_per_bar * num_bars].reshape(
        (num_bars, samples_per_bar)
    )

    # Calculate RMS for each segment using numpy operations
    rms = np.sqrt(np.mean(segments.astype(np.float32) ** 2, axis=1))

    # Normalize to 0-1 range using 90% of max value instead of fixed 16-bit maximum
    max_value = np.max(rms)
    normalized_heights = rms / (max_value * 1.3) if max_value > 0 else rms

    # Calculate timestamp for each bar using numpy
    samples_per_ms = sample_rate / 1000
    ms_per_bar = samples_per_bar / samples_per_ms
    bar_timestamps = np.arange(num_bars) * ms_per_bar / 1000

    # Create arrays of segment timestamps and speakers
    segment_timestamps = np.array(
        [segment.timestamp for segment in speaker_segments]
    )
    segment_speakers = np.array(
        [segment.speaker.value for segment in speaker_segments]
    )

    # Find the corresponding speaker for each bar using numpy searchsorted
    speaker_indices = (
        np.searchsorted(segment_timestamps, bar_timestamps, side="right") - 1
    )
    bar_speakers = segment_speakers[speaker_indices]

    assert len(normalized_heights) == len(bar_speakers)
    return [
        BarHeight(height=height, speaker=speaker)
        for height, speaker in zip(normalized_heights, bar_speakers)
    ]


def audio_bytes_to_ms(
    audio_bytes: bytes, bytes_per_sample: int, sample_rate: int
) -> int:
    return int((len(audio_bytes) / bytes_per_sample) * 1000 / sample_rate)


def pcm_to_wav_buffer(audio_data: bytes, sample_rate: int) -> io.BytesIO:
    wav_buffer = io.BytesIO()
    with wave.open(wav_buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(audio_data)
    return wav_buffer
