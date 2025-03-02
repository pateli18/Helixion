from typing import Optional

from twilio.request_validator import RequestValidator
from twilio.rest import Client

from src.helixion_types import SerializedUUID
from src.settings import settings

twilio_client = Client(
    account_sid=settings.twilio_account_sid,
    password=settings.twilio_password,
    username=settings.twilio_username,
)
twilio_request_validator = RequestValidator(settings.twilio_auth_token)


def hang_up_phone_call(call_sid: str):
    twilio_client.calls(call_sid).update(status="completed")


def transfer_call(call_sid: str, to_phone_number: str):
    twilio_client.calls(call_sid).update(
        twiml=f"<Response><Dial><Number>{to_phone_number}</Number></Dial></Response>",
    )


def send_digits(call_sid: str, digits: str):
    twilio_client.calls(call_sid).update(
        twiml=f'<Response><Play digits="{digits}" /></Response>',
    )


def send_text_message(
    to_phone_number: str,
    body: str,
    from_phone_number: str,
    status_callback: str,
) -> str:
    response = twilio_client.messages.create(
        from_=from_phone_number,
        body=body,
        to=to_phone_number,
        status_callback=status_callback,
    )
    if response.sid is None:
        return "no-sid"
    return response.sid


def available_phone_numbers(country_code: str, area_code: int) -> list[str]:
    available_numbers = twilio_client.available_phone_numbers(
        country_code
    ).local.list(
        area_code=area_code,
    )
    return [
        number.phone_number
        for number in available_numbers
        if number.phone_number is not None
    ]


def buy_phone_number(phone_number: str) -> Optional[str]:
    response = twilio_client.incoming_phone_numbers.create(
        phone_number=phone_number,
    )
    return response.sid


def update_call_webhook_url(phone_number_sid: str, webhook_url: str):
    twilio_client.incoming_phone_numbers(phone_number_sid).update(
        voice_url=webhook_url,
        voice_method="POST",
    )


def update_message_webhook_url(phone_number_sid: str, webhook_url: str):
    twilio_client.incoming_phone_numbers(phone_number_sid).update(
        sms_url=webhook_url,
        sms_method="POST",
    )


def create_call(
    to_phone_number: str,
    from_phone_number: str,
    phone_call_id: SerializedUUID,
) -> str:
    call = twilio_client.calls.create(
        to=to_phone_number,
        from_=from_phone_number,
        twiml=f'<?xml version="1.0" encoding="UTF-8"?><Response><Connect><Stream url="wss://{settings.host}/api/v1/phone/call-stream/{phone_call_id}" /></Connect></Response>',
        status_callback=f"https://{settings.host}/api/v1/phone/webhook/call-status/{phone_call_id}",
        status_callback_event=[
            "initiated",
            "ringing",
            "answered",
            "completed",
        ],
    )
    if call.sid is None:
        return "no-sid"
    return call.sid
