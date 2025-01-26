import base64
import logging
from typing import Optional

from src.audio.data_processing import audio_bytes_to_ms
from src.aws_utils import S3Client

logger = logging.getLogger(__name__)

sounds_cache: dict[str, tuple[str, int]] = {}


def get_sound_base64(sound_name: str) -> Optional[tuple[str, int]]:
    return sounds_cache.get(sound_name)


async def initialize_sounds_cache():
    async with S3Client() as s3_client:
        for sound_name in ["hang_up_sound_24k", "hang_up_sound_8k"]:
            data, _, _ = await s3_client.download_file(
                f"s3://helixion-sounds/{sound_name}.pcm"
            )
            audio_ms = audio_bytes_to_ms(
                data,
                2,
                8000 if sound_name.endswith("_8k") else 24000,
            )
            sounds_cache[sound_name] = (
                base64.b64encode(data).decode("utf-8"),
                audio_ms,
            )
