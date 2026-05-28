from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user_id
from app.core.database import get_db
from app.models.post import Post
from app.models.series import ContentSeries
from app.schemas.series import (
    ContentSeriesCreate,
    ContentSeriesResponse,
    ContentSeriesUpdate,
)
from app.services.scheduling import (
    ScheduleCandidate,
    assert_no_existing_conflict,
    assert_no_internal_conflicts,
    to_utc_naive,
)

router = APIRouter(prefix="/series", tags=["series"])


def _series_query(user_id: int):
    return (
        select(ContentSeries)
        .options(selectinload(ContentSeries.posts))
        .where(ContentSeries.owner_id == user_id)
    )


async def _get_series_or_404(
    db: AsyncSession,
    user_id: int,
    series_id: int,
) -> ContentSeries:
    result = await db.execute(
        _series_query(user_id).where(ContentSeries.id == series_id)
    )
    series = result.scalar_one_or_none()
    if not series:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Series not found")
    return series


@router.get("", response_model=list[ContentSeriesResponse])
async def list_series(
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    result = await db.execute(
        _series_query(user_id).order_by(ContentSeries.updated_at.desc(), ContentSeries.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("", response_model=ContentSeriesResponse, status_code=status.HTTP_201_CREATED)
async def create_series(
    data: ContentSeriesCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    posts_with_schedule = [
        (post, to_utc_naive(post.scheduled_at))
        for post in data.posts
    ]
    candidates = [
        ScheduleCandidate(
            title=post.title,
            platform=post.platform,
            scheduled_at=scheduled_at,
        )
        for post, scheduled_at in posts_with_schedule
    ]
    assert_no_internal_conflicts(candidates)
    for candidate in candidates:
        await assert_no_existing_conflict(db, user_id, candidate)

    series = ContentSeries(
        name=data.name,
        description=data.description,
        cadence=data.cadence,
        owner_id=user_id,
    )
    db.add(series)
    await db.flush()

    for index, (post_data, scheduled_at) in enumerate(posts_with_schedule, start=1):
        db.add(
            Post(
                title=post_data.title,
                platform=post_data.platform,
                scheduled_at=scheduled_at,
                status=post_data.status,
                owner_id=user_id,
                series_id=series.id,
                series_position=post_data.series_position or index,
            )
        )

    await db.commit()
    return await _get_series_or_404(db, user_id, series.id)


@router.get("/{series_id}", response_model=ContentSeriesResponse)
async def get_series(
    series_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    return await _get_series_or_404(db, user_id, series_id)


@router.patch("/{series_id}", response_model=ContentSeriesResponse)
async def update_series(
    series_id: int,
    data: ContentSeriesUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    series = await _get_series_or_404(db, user_id, series_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(series, key, value)
    await db.commit()
    return await _get_series_or_404(db, user_id, series_id)


@router.delete("/{series_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_series(
    series_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    series = await _get_series_or_404(db, user_id, series_id)
    for post in series.posts:
        post.series_id = None
        post.series_position = None
    await db.delete(series)
    await db.commit()
