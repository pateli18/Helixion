import logging
from contextlib import AsyncExitStack
from typing import AsyncContextManager, Optional

from aiobotocore.client import AioBaseClient
from aiobotocore.session import AioSession
from botocore.exceptions import ClientError

from src.settings import settings

logger = logging.getLogger(__name__)


class S3Client(AsyncContextManager["S3Client"]):
    def __init__(self):
        self._exit_stack = AsyncExitStack()
        self._s3_client: Optional[AioBaseClient] = None

    async def __aenter__(self) -> "S3Client":
        session = AioSession()
        self._s3_client = await self._exit_stack.enter_async_context(
            session.create_client(
                "s3", region_name=settings.aws_default_region
            )
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self._exit_stack.__aexit__(exc_type, exc_val, exc_tb)

    @staticmethod
    def bucket_prefix_from_file_url(file_url: str) -> tuple[str, str]:
        path_splits = file_url.split("://")[1].split("/")
        bucket = path_splits[0]
        prefix = "/".join(path_splits[1:])
        return bucket, prefix

    async def upload_file(
        self,
        obj: bytes,
        filepath: str,
        content_type: Optional[str] = None,
    ) -> None:
        bucket, prefix = self.bucket_prefix_from_file_url(filepath)
        base_params = {
            "Bucket": bucket,
            "Key": prefix,
            "Body": obj,
        }
        if content_type:
            base_params["ContentType"] = content_type
        await self._s3_client.put_object(**base_params)  # type: ignore
        logger.info(f"Successfully uploaded to {bucket=} {prefix=}")

    async def download_file(self, filepath: str) -> tuple[bytes, str, str]:
        bucket, prefix = self.bucket_prefix_from_file_url(filepath)
        response = await self._s3_client.get_object(Bucket=bucket, Key=prefix)  # type: ignore
        body = await response["Body"].read()
        return body, response["ContentType"], response["ETag"]

    async def check_file_exists(self, filepath: str) -> bool:
        bucket, prefix = self.bucket_prefix_from_file_url(filepath)
        try:
            await self._s3_client.head_object(Bucket=bucket, Key=prefix)  # type: ignore
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code in ("404", "NoSuchKey", "NotFound"):
                logger.info(
                    f"File {filepath} not found (error code: {error_code})"
                )
                return False
            else:
                raise e
        return True
