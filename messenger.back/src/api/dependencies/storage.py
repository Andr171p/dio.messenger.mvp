from typing import Annotated

from aiobotocore.config import AioConfig
from ddf.infra.s3 import S3Client, S3Config
from fastapi import Depends
from pydantic import HttpUrl


class MessengerS3Config(S3Config):
    public_endpoint_url: HttpUrl | None = None


s3_config = MessengerS3Config()  # type: ignore[call-arg]
s3_client = S3Client(s3_config)
s3_signer = (
    S3Client(s3_config.model_copy(update={"endpoint_url": s3_config.public_endpoint_url}))
    if s3_config.public_endpoint_url is not None
    else s3_client
)
if s3_signer is not s3_client:
    s3_signer.session.set_default_client_config(AioConfig(signature_version="s3v4"))


def get_s3_client() -> S3Client:
    return s3_client


S3ClientDep = Annotated[S3Client, Depends(get_s3_client)]


def get_s3_signer() -> S3Client:
    return s3_signer


S3SignerDep = Annotated[S3Client, Depends(get_s3_signer)]

__all__ = ["S3ClientDep", "S3SignerDep", "s3_client", "s3_signer"]
