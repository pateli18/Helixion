import logging
import logging.config

from dotenv import load_dotenv
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str
    log_level: str = "INFO"
    aws_default_region: str = "us-west-2"
    twilio_account_sid: str
    twilio_auth_token: str
    postgres_uri: str
    host: str = "localhost:8000"

    @property
    def postgres_connection_string(self) -> str:
        if self.postgres_uri.startswith("postgres://"):
            return self.postgres_uri.replace(
                "postgres://", "postgresql+asyncpg://"
            )
        else:
            return self.postgres_uri.replace(
                "postgresql://", "postgresql+asyncpg://"
            )


load_dotenv()
settings = Settings()  # type: ignore


class CustomLogFormatter(logging.Formatter):
    """Custom log formatter to include extra variables."""

    def format(self, record):
        extra_vars = []

        for key, value in record.__dict__.items():
            if (
                key
                not in logging.LogRecord(
                    "", 0, "", 0, "", (), None, None
                ).__dict__
                and key != "message"
            ):
                extra_vars.append(f"{key}={value}")

        if extra_vars:
            record.msg = f"{record.msg} {', '.join(extra_vars)}"
        return super().format(record)


class EndpointFilter(logging.Filter):
    """Filter out healthz requests from logs."""

    def filter(self, record):
        # filter out healthz requests
        return record.getMessage().find("/healthz") == -1


def setup_logging() -> None:
    """Setup logging configuration."""
    handlers = {
        "default": {
            "level": settings.log_level,
            "formatter": "default",
            "class": "logging.StreamHandler",
        }
    }

    logging_config = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "default": {
                "()": CustomLogFormatter,
                "format": "%(asctime)s %(levelname)s %(name)s %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            }
        },
        "handlers": handlers,
        "loggers": {
            "": {
                "handlers": list(handlers.keys()),
                "level": settings.log_level,
            },
        },
    }

    logging.config.dictConfig(logging_config)
    logging.getLogger("aiobotocore").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").addFilter(EndpointFilter())
