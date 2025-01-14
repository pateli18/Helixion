import base64
import json
import logging

from src.clinicontact_types import Speaker, SpeakerSegment

logger = logging.getLogger(__name__)


def process_audio_data(
    file_bytes: bytes,
) -> tuple[list[SpeakerSegment], bytearray]:
    file_str = file_bytes.decode("utf-8")
    speaker_segments: list[SpeakerSegment] = []
    total_ms = 0
    input_data_ms = 300
    user_speaking = False
    input_buffer_data: list[tuple[bytes, int]] = []
    audio_data = bytearray()
    for line in file_str.splitlines():
        # exlcude timestamp
        line_data = json.loads(line.split("]", 1)[1].strip())
        if line_data["type"] == "input_audio_buffer.speech_started":
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
                    audio_data.extend(decoded_data)
                    total_ms += len(decoded_data) // 8

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
            audio_data.extend(decoded_data)
            total_ms += len(decoded_data) // 8

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
            decoded_data_ms = len(decoded_data) // 8
            input_data_ms += decoded_data_ms
            if user_speaking:
                total_ms += decoded_data_ms
                audio_data.extend(decoded_data)
            else:
                input_buffer_data.append((decoded_data, input_data_ms))

    return speaker_segments, audio_data
