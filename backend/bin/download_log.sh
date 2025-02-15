#!/bin/bash

# Check if an ID parameter was provided
if [ -z "$1" ]; then
    echo "Error: Please provide a log ID as parameter"
    echo "Usage: ./download_log.sh <log_id>"
    exit 1
fi

LOG_ID="$1"
S3_PATH="s3://clinicontact/logs/${LOG_ID}.log"
GZ_S3_PATH="s3://clinicontact/logs/${LOG_ID}.zip"
AWS_PROFILE="helixion"

# Check if the gzipped log file exists on S3
GZ_FILE_CHECK=$(aws s3 ls "${GZ_S3_PATH}" --profile "${AWS_PROFILE}")

if [ -n "${GZ_FILE_CHECK}" ]; then
    echo ".zip file found. Downloading ${LOG_ID}.zip"
    aws s3 cp "${GZ_S3_PATH}" "./logs/${LOG_ID}.zip" --profile "${AWS_PROFILE}"
    if [ $? -eq 0 ]; then
        unzip -o "./logs/${LOG_ID}.zip" -d "./logs/"
        if [ $? -eq 0 ]; then
            rm "./logs/${LOG_ID}.zip"
            echo "Successfully downloaded and decompressed ${LOG_ID}.zip"
        else
            echo "Failed to decompress ${LOG_ID}.zip"
            exit 1
        fi
    else
        echo "Failed to download ${LOG_ID}.zip"
        exit 1
    fi
else
    echo "No zip file found. Downloading ${LOG_ID}.log"
    aws s3 cp "${S3_PATH}" "./logs/${LOG_ID}.log" --profile "${AWS_PROFILE}"
    if [ $? -eq 0 ]; then
        echo "Successfully downloaded ${LOG_ID}.log"
    else
        echo "Failed to download ${LOG_ID}.log file"
        exit 1
    fi
fi
