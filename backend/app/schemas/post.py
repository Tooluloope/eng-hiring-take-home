from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field, field_serializer, model_validator


def _serialize_utc(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    else:
        value = value.astimezone(timezone.utc)
    return value.isoformat(timespec="seconds").replace("+00:00", "Z")


class PostBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    platform: str = Field(..., min_length=1, max_length=64)
    scheduled_at: Optional[datetime] = None
    status: str = "draft"
    series_id: Optional[int] = None
    series_position: Optional[int] = None


class PostCreate(PostBase):
    @model_validator(mode="after")
    def scheduled_posts_require_time(self):
        if self.status == "scheduled" and self.scheduled_at is None:
            raise ValueError("scheduled_at is required when status is scheduled")
        return self


class PostUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    platform: Optional[str] = Field(default=None, min_length=1, max_length=64)
    scheduled_at: Optional[datetime] = None
    status: Optional[str] = None
    series_id: Optional[int] = None
    series_position: Optional[int] = None


class PostResponse(PostBase):
    id: int
    owner_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @field_serializer("scheduled_at", "created_at", "updated_at", when_used="json")
    def serialize_utc_datetimes(self, value: Optional[datetime]) -> Optional[str]:
        return _serialize_utc(value)

    class Config:
        from_attributes = True
