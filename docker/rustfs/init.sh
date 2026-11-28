#!/bin/sh
# Создаёт бакет media Messenger. Доступ только по presigned URL / через API.
set -eu

attempt=1
until mc alias set local "http://rustfs:9000" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" &&
    mc mb --ignore-existing "local/$S3_BUCKET"; do
    if [ "$attempt" -ge 12 ]; then
        echo "Could not initialize storage bucket: $S3_BUCKET" >&2
        exit 1
    fi
    attempt=$((attempt + 1))
    sleep 3
done

echo "Storage initialized: $S3_BUCKET"
