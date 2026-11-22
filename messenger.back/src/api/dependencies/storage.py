from typing import Annotated

from ddf.infra.s3 import S3Client, S3Config
from fastapi import Depends

s3_config = S3Config()  # type: ignore[call-arg]
s3_client = S3Client(s3_config)


def get_s3_client() -> S3Client:
    return s3_client


S3ClientDep = Annotated[S3Client, Depends(get_s3_client)]

__all__ = ["S3ClientDep", "s3_client"]
