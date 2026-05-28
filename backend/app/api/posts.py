from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.database import get_db
from app.models.post import Post
from app.models.series import ContentSeries
from app.schemas.post import PostCreate, PostUpdate, PostResponse
from app.services.scheduling import ScheduleCandidate, assert_no_existing_conflict, to_utc_naive

router = APIRouter(prefix="/posts", tags=["posts"])


async def _assert_series_owned(
    db: AsyncSession,
    user_id: int,
    series_id: Optional[int],
) -> None:
    if series_id is None:
        return
    result = await db.execute(
        select(ContentSeries.id).where(
            ContentSeries.id == series_id,
            ContentSeries.owner_id == user_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Series not found")


def _assert_scheduled_status_has_time(post_status: str, scheduled_at) -> None:
    if post_status == "scheduled" and scheduled_at is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="scheduled_at is required when status is scheduled",
        )


@router.get("", response_model=list[PostResponse])
async def list_posts(
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
    status: Optional[str] = Query(None, description="Filter by status"),
    platform: Optional[str] = Query(None, description="Filter by platform"),
    series_id: Optional[int] = Query(None, description="Filter by content series"),
):
    q = select(Post).where(Post.owner_id == user_id).order_by(Post.scheduled_at.desc().nulls_last(), Post.created_at.desc())
    if status:
        q = q.where(Post.status == status)
    if platform:
        q = q.where(Post.platform == platform)
    if series_id is not None:
        q = q.where(Post.series_id == series_id)
    result = await db.execute(q)
    return list(result.scalars().all())


@router.post("", response_model=PostResponse, status_code=status.HTTP_201_CREATED)
async def create_post(
    data: PostCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    await _assert_series_owned(db, user_id, data.series_id)
    scheduled_at = to_utc_naive(data.scheduled_at)
    await assert_no_existing_conflict(
        db,
        user_id,
        ScheduleCandidate(
            title=data.title,
            platform=data.platform,
            scheduled_at=scheduled_at,
        ),
    )
    post = Post(
        title=data.title,
        platform=data.platform,
        scheduled_at=scheduled_at,
        status=data.status,
        owner_id=user_id,
        series_id=data.series_id,
        series_position=data.series_position,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)
    return post


@router.get("/{post_id}", response_model=PostResponse)
async def get_post(
    post_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    result = await db.execute(select(Post).where(Post.id == post_id, Post.owner_id == user_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    return post


@router.patch("/{post_id}", response_model=PostResponse)
async def update_post(
    post_id: int,
    data: PostUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    result = await db.execute(select(Post).where(Post.id == post_id, Post.owner_id == user_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    updates = data.model_dump(exclude_unset=True)
    if "series_id" in updates:
        await _assert_series_owned(db, user_id, updates["series_id"])
    if "scheduled_at" in updates:
        updates["scheduled_at"] = to_utc_naive(updates["scheduled_at"])
    next_status = updates.get("status", post.status)
    next_scheduled_at = updates.get("scheduled_at", post.scheduled_at)
    _assert_scheduled_status_has_time(next_status, next_scheduled_at)
    candidate = ScheduleCandidate(
        title=updates.get("title", post.title),
        platform=updates.get("platform", post.platform),
        scheduled_at=next_scheduled_at,
        post_id=post.id,
    )
    await assert_no_existing_conflict(db, user_id, candidate)
    for k, v in updates.items():
        setattr(post, k, v)
    await db.commit()
    await db.refresh(post)
    return post


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_post(
    post_id: int,
    db: Annotated[AsyncSession, Depends(get_db)],
    user_id: Annotated[int, Depends(get_current_user_id)],
):
    result = await db.execute(select(Post).where(Post.id == post_id, Post.owner_id == user_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    await db.delete(post)
    await db.commit()
