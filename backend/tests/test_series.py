import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_series_with_posts(client: AsyncClient, auth_headers: dict):
    r = await client.post(
        "/api/series",
        headers=auth_headers,
        json={
            "name": "Product launch",
            "description": "Launch teaser through reminder",
            "cadence": "every 2 days",
            "posts": [
                {
                    "title": "Launch teaser",
                    "platform": "instagram",
                    "status": "scheduled",
                    "scheduled_at": "2026-06-01T10:00:00Z",
                    "series_position": 1,
                },
                {
                    "title": "Launch announcement",
                    "platform": "instagram",
                    "status": "scheduled",
                    "scheduled_at": "2026-06-03T10:00:00Z",
                    "series_position": 2,
                },
            ],
        },
    )

    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Product launch"
    assert data["cadence"] == "every 2 days"
    assert len(data["posts"]) == 2
    assert data["posts"][0]["series_id"] == data["id"]
    assert data["posts"][0]["series_position"] == 1

    listed = await client.get("/api/series", headers=auth_headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1
    assert listed.json()[0]["name"] == "Product launch"


@pytest.mark.asyncio
async def test_create_series_rejects_internal_schedule_conflicts(client: AsyncClient, auth_headers: dict):
    r = await client.post(
        "/api/series",
        headers=auth_headers,
        json={
            "name": "Too tight",
            "cadence": "custom",
            "posts": [
                {
                    "title": "Teaser",
                    "platform": "linkedin",
                    "status": "scheduled",
                    "scheduled_at": "2026-06-01T10:00:00Z",
                },
                {
                    "title": "Announcement",
                    "platform": "linkedin",
                    "status": "scheduled",
                    "scheduled_at": "2026-06-01T10:12:00Z",
                },
            ],
        },
    )
    assert r.status_code == 409
    assert "15 minutes apart" in r.json()["detail"]
    assert "2026-06-01T10:00:00Z" in r.json()["detail"]
    assert "2026-06-01T10:12:00Z" in r.json()["detail"]

    listed = await client.get("/api/series", headers=auth_headers)
    assert listed.status_code == 200
    assert listed.json() == []


@pytest.mark.asyncio
async def test_create_series_rejects_scheduled_post_without_schedule(client: AsyncClient, auth_headers: dict):
    r = await client.post(
        "/api/series",
        headers=auth_headers,
        json={
            "name": "Missing schedule",
            "cadence": "custom",
            "posts": [
                {
                    "title": "Needs a time",
                    "platform": "instagram",
                    "status": "scheduled",
                }
            ],
        },
    )
    assert r.status_code == 422
    assert "scheduled_at is required" in str(r.json()["detail"])


@pytest.mark.asyncio
async def test_create_series_rejects_conflict_with_existing_post(client: AsyncClient, auth_headers: dict):
    existing = await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": "Existing launch post",
            "platform": "instagram",
            "status": "scheduled",
            "scheduled_at": "2026-06-01T10:00:00Z",
        },
    )
    assert existing.status_code == 201

    r = await client.post(
        "/api/series",
        headers=auth_headers,
        json={
            "name": "Conflicting launch",
            "cadence": "daily",
            "posts": [
                {
                    "title": "Series teaser",
                    "platform": "instagram",
                    "status": "scheduled",
                    "scheduled_at": "2026-06-01T10:05:00Z",
                }
            ],
        },
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_delete_series_detaches_posts(client: AsyncClient, auth_headers: dict):
    series = await client.post(
        "/api/series",
        headers=auth_headers,
        json={
            "name": "Detach me",
            "cadence": "weekly",
            "posts": [
                {
                    "title": "Standalone later",
                    "platform": "youtube",
                    "status": "scheduled",
                    "scheduled_at": "2026-06-01T10:00:00Z",
                }
            ],
        },
    )
    assert series.status_code == 201
    series_id = series.json()["id"]
    post_id = series.json()["posts"][0]["id"]

    deleted = await client.delete(f"/api/series/{series_id}", headers=auth_headers)
    assert deleted.status_code == 204

    post = await client.get(f"/api/posts/{post_id}", headers=auth_headers)
    assert post.status_code == 200
    assert post.json()["series_id"] is None
    assert post.json()["series_position"] is None
