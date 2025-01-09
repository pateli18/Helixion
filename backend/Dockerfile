FROM python:3.11

RUN pip install --upgrade pip
WORKDIR /app
COPY ./requirements.txt /app/requirements.txt

RUN pip install -r ./requirements.txt

COPY ./src /app/src


EXPOSE 8000
CMD ["uvicorn", "src.server:app", "--host", "0.0.0.0"]