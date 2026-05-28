from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.post import Post

SCHEDULE_BUFFER = timedelta(minutes=15)


@dataclass(frozen=True)
class ScheduleCandidate:
    title: str
    platform: str
    scheduled_at: Optional[datetime]
    post_id: Optional[int] = None


def to_utc_naive(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _format_utc(value: datetime) -> str:
    return f"{to_utc_naive(value).isoformat(timespec='seconds')}Z"


def _conflict_detail(candidate: ScheduleCandidate, other_title: str, other_time: datetime) -> str:
    return (
        f"{candidate.platform} posts must be at least 15 minutes apart. "
        f"'{candidate.title}' at {_format_utc(candidate.scheduled_at)} conflicts with "
        f"'{other_title}' at {_format_utc(other_time)}."
    )


def assert_no_internal_conflicts(candidates: Iterable[ScheduleCandidate]) -> None:
    scheduled = [candidate for candidate in candidates if candidate.scheduled_at is not None]
    for index, candidate in enumerate(scheduled):
        candidate_time = to_utc_naive(candidate.scheduled_at)
        for other in scheduled[index + 1:]:
            if candidate.platform != other.platform:
                continue
            other_time = to_utc_naive(other.scheduled_at)
            if abs(candidate_time - other_time) < SCHEDULE_BUFFER:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=_conflict_detail(candidate, other.title, other.scheduled_at),
                )


async def assert_no_existing_conflict(
    db: AsyncSession,
    user_id: int,
    candidate: ScheduleCandidate,
) -> None:
    if candidate.scheduled_at is None:
        return

    result = await db.execute(
        select(Post).where(
            Post.owner_id == user_id,
            Post.platform == candidate.platform,
            Post.scheduled_at.is_not(None),
        )
    )
    candidate_time = to_utc_naive(candidate.scheduled_at)
    for post in result.scalars().all():
        if candidate.post_id is not None and post.id == candidate.post_id:
            continue
        if post.scheduled_at is None:
            continue
        if abs(candidate_time - to_utc_naive(post.scheduled_at)) < SCHEDULE_BUFFER:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=_conflict_detail(candidate, post.title, post.scheduled_at),
            )
