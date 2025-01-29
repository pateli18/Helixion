#!/bin/bash

# Check if an ID parameter was provided
if [ -z "$1" ]; then
    echo "Error: Please provide a log ID as parameter"
    echo "Usage: ./download_log.sh <log_id>"
    exit 1
fi

LOG_ID="$1"
S3_PATH="s3://clinicontact/logs/${LOG_ID}.log"
AWS_PROFILE="helixion"

# Download the file using AWS CLI with specified profile
aws s3 cp "${S3_PATH}" "./logs/${LOG_ID}.log" --profile "${AWS_PROFILE}"

if [ $? -eq 0 ]; then
    echo "Successfully downloaded ${LOG_ID}.log"
else
    echo "Failed to download log file"
    exit 1
fi
