from typing import Optional

from twilio.request_validator import RequestValidator
from twilio.rest import Client

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
) -> Optional[str]:
    response = twilio_client.messages.create(
        from_=from_phone_number,
        body=body,
        to=to_phone_number,
        status_callback=status_callback,
    )
    return response.sid
