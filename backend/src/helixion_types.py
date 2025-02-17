from datetime import datetime
from enum import Enum
from typing import Annotated, Literal, Optional, Union, cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict, PlainSerializer, model_serializer

AUDIO_QUEUE_NAME = "audio_queue"
METADATA_QUEUE_NAME = "metadata_queue"
CALL_END_EVENT = "END"
BROWSER_NAME = "browser"
AudioFormat = Literal["pcm16", "g711_ulaw", "g711_alaw"]
Voice = Literal[
    "alloy", "ash", "ballad", "coral", "echo", "sage", "shimmer", "verse"
]

SerializedUUID = Annotated[
    UUID, PlainSerializer(lambda x: str(x), return_type=str)
]
SerializedDateTime = Annotated[
    datetime, PlainSerializer(lambda x: x.isoformat(), return_type=str)
]


class ModelChatType(str, Enum):
    developer = "developer"
    system = "system"
    user = "user"
    assistant = "assistant"


class ModelChatContentImageDetail(str, Enum):
    low = "low"
    auto = "auto"
    high = "high"


class ModelChatContentImage(BaseModel):
    url: str
    detail: ModelChatContentImageDetail

    @classmethod
    def from_b64(
        cls,
        b64_image: str,
        detail: ModelChatContentImageDetail = ModelChatContentImageDetail.auto,
    ) -> "ModelChatContentImage":
        return cls(url=f"data:image/png;base64,{b64_image}", detail=detail)


class ModelChatContentType(str, Enum):
    text = "text"
    image_url = "image_url"


SerializedModelChatContent = dict[str, Union[str, dict]]


class ModelChatContent(BaseModel):
    type: ModelChatContentType
    content: Union[str, ModelChatContentImage]

    @model_serializer
    def serialize(self) -> SerializedModelChatContent:
        content_key = self.type.value
        content_value = (
            self.content
            if isinstance(self.content, str)
            else self.content.model_dump()
        )
        return {"type": self.type.value, content_key: content_value}

    @classmethod
    def from_serialized(
        cls, data: SerializedModelChatContent
    ) -> "ModelChatContent":
        type_ = ModelChatContentType(data["type"])
        content_key = type_.value
        content_value = data[content_key]
        if type_ == ModelChatContentType.image_url:
            content = ModelChatContentImage(**cast(dict, content_value))
        else:
            content = cast(str, content_value)
        return cls(type=type_, content=content)


class ModelChat(BaseModel):
    role: ModelChatType
    content: Union[str, list[ModelChatContent]]

    @classmethod
    def from_b64_image(
        cls, role: ModelChatType, b64_image: str
    ) -> "ModelChat":
        return cls(
            role=role,
            content=[
                ModelChatContent(
                    type=ModelChatContentType.image_url,
                    content=ModelChatContentImage.from_b64(b64_image),
                )
            ],
        )

    @classmethod
    def from_serialized(
        cls, data: dict[str, Union[str, list[SerializedModelChatContent]]]
    ) -> "ModelChat":
        role = ModelChatType(data["role"])
        if isinstance(data["content"], str):
            return cls(role=role, content=cast(str, data["content"]))
        else:
            content = [
                ModelChatContent.from_serialized(content_data)
                for content_data in data["content"]
            ]
            return cls(role=role, content=content)


class ToolChoiceFunction(BaseModel):
    name: str


class ToolChoiceObject(BaseModel):
    type: str = "function"
    function: ToolChoiceFunction


ToolChoice = Optional[Union[Literal["auto"], ToolChoiceObject]]


class ModelType(str, Enum):
    gpto1 = "o1-preview"
    gpt4o = "gpt-4o"
    claude35 = "claude-3-5-sonnet-20241022"
    realtime = "gpt-4o-realtime-preview-2024-12-17"
    gpt4o_mini = "gpt-4o-mini"


class ModelFunction(BaseModel):
    name: str
    description: Optional[str]
    parameters: Optional[dict]


class Tool(BaseModel):
    type: str = "function"
    function: ModelFunction


class ResponseType(BaseModel):
    type: Literal["json_object"] = "json_object"


class StreamOptions(BaseModel):
    include_usage: bool


class Prediction(BaseModel):
    type: Literal["content"] = "content"
    content: Union[str, list[ModelChatContent]]


class OpenAiChatInput(BaseModel):
    messages: list[ModelChat]
    model: ModelType
    max_completion_tokens: Optional[int] = None
    n: int = 1
    temperature: float = 0.0
    stop: Optional[str] = None
    tools: Optional[list[Tool]] = None
    tool_choice: ToolChoice = None
    stream: bool = False
    logprobs: bool = False
    top_logprobs: Optional[int] = None
    response_format: Optional[ResponseType] = None
    stream_options: Optional[StreamOptions] = None
    prediction: Optional[Prediction] = None

    @property
    def data(self) -> dict:
        exclusion = set()
        if self.tools is None:
            exclusion.add("tools")
        if self.tool_choice is None:
            exclusion.add("tool_choice")
        if self.stream is True:
            self.stream_options = StreamOptions(include_usage=True)
        if self.model == ModelType.gpto1:
            exclusion.add("temperature")
            exclusion.add("stop")
        output = self.model_dump(
            exclude=exclusion,
        )
        if self.model == ModelType.claude35:
            output["max_tokens"] = self.max_completion_tokens or 8192
            del output["max_completion_tokens"]
            del output["n"]
            del output["stop"]
            del output["logprobs"]
            del output["top_logprobs"]
            del output["response_format"]
            del output["stream_options"]
        return output


class PhoneCallStatus(str, Enum):
    queued = "queued"
    ringing = "ringing"
    in_progress = "in-progress"
    completed = "completed"
    busy = "busy"
    failed = "failed"
    no_answer = "no-answer"
    initiated = "initiated"
    transferred = "transferred"


TERMINAL_PHONE_CALL_STATUSES = [
    PhoneCallStatus.completed,
    PhoneCallStatus.busy,
    PhoneCallStatus.failed,
    PhoneCallStatus.no_answer,
]


class AgentMetadata(BaseModel):
    base_id: SerializedUUID
    name: str
    version_id: SerializedUUID


class PhoneCallType(str, Enum):
    inbound = "inbound"
    outbound = "outbound"


class TextMessageType(str, Enum):
    inbound = "inbound"
    outbound = "outbound"


class PhoneCallEndReason(str, Enum):
    end_of_call_bot = "end_of_call_bot"
    voice_mail_bot = "voice_mail_bot"
    user_hangup = "user_hangup"
    unknown = "unknown"
    listener_hangup = "listener_hangup"
    transferred = "transferred"


class PhoneCallMetadata(BaseModel):
    id: SerializedUUID
    from_phone_number: str
    to_phone_number: str
    input_data: dict
    status: PhoneCallStatus
    created_at: SerializedDateTime
    duration: Optional[int] = None
    recording_available: bool
    agent_metadata: Optional[AgentMetadata]
    call_type: PhoneCallType
    end_reason: Optional[PhoneCallEndReason] = None
    initiator: Optional[str] = None


class Speaker(str, Enum):
    user = "User"
    assistant = "Assistant"


class SpeakerSegment(BaseModel):
    timestamp: float
    speaker: Speaker
    transcript: str
    item_id: str


class BarHeight(BaseModel):
    height: float
    speaker: Speaker


class AgentBase(BaseModel):
    name: str
    system_message: str
    base_id: SerializedUUID
    active: bool
    sample_values: dict
    tool_configuration: dict


class AgentPhoneNumber(BaseModel):
    id: SerializedUUID
    phone_number: str
    incoming: bool
    agent: Optional[AgentMetadata]


class Agent(AgentBase):
    model_config = ConfigDict(from_attributes=True)

    id: SerializedUUID
    created_at: SerializedDateTime
    test_values: Optional[dict] = None
    user_email: str
    phone_numbers: list[AgentPhoneNumber]


class AiMessageEventTypes(str, Enum):
    speaker = "speaker"
    call_end = "call_end"
    audio = "audio"


class DocumentMetadata(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: SerializedUUID
    name: str
    size: int
    mime_type: str
    created_at: SerializedDateTime


class KnowledgeBase(BaseModel):
    id: SerializedUUID
    name: str
    documents: list[DocumentMetadata]


class AnalyticsTag(BaseModel):
    id: SerializedUUID
    tag: str
    phone_call_id: SerializedUUID


class AnalyticsReport(BaseModel):
    id: SerializedUUID
    name: str
    text: str


class AnalyticsGroup(BaseModel):
    id: SerializedUUID
    name: str
    tags: list[AnalyticsTag]
    reports: list[AnalyticsReport]


class TransferCallNumber(BaseModel):
    phone_number: str
    label: str
