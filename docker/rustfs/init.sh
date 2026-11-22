#!/bin/sh
# Создаёт бакет media Messenger. Доступ только по presigned URL / через API.
set -eu

mc alias set local "http://rustfs:9000" "$S3_ACCESS_KEY" "$S3_SECRET_KEY"
mc mb --ignore-existing "local/$S3_BUCKET"

echo "Storage initialized: $S3_BUCKET"
