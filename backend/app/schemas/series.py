from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from app.schemas.post import PostResponse


class SeriesPostCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    platform: str = Field(..., min_length=1, max_length=64)
    scheduled_at: Optional[datetime] = None
    status: str = "scheduled"
    series_position: Optional[int] = None

    @model_validator(mode="after")
    def scheduled_posts_require_time(self):
        if self.status == "scheduled" and self.scheduled_at is None:
            raise ValueError("scheduled_at is required when status is scheduled")
        return self


class ContentSeriesBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    cadence: str = Field(default="custom", min_length=1, max_length=64)


class ContentSeriesCreate(ContentSeriesBase):
    posts: list[SeriesPostCreate] = Field(default_factory=list)


class ContentSeriesUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    cadence: Optional[str] = Field(default=None, min_length=1, max_length=64)


class ContentSeriesResponse(ContentSeriesBase):
    id: int
    owner_id: int
    posts: list[PostResponse] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
