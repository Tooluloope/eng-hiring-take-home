import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_posts_empty(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/posts", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == []


@pytest.mark.asyncio
async def test_create_post(client: AsyncClient, auth_headers: dict):
    r = await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": "My first post",
            "platform": "youtube",
            "status": "draft",
        },
    )
    assert r.status_code == 201
    data = r.json()
    assert data["title"] == "My first post"
    assert data["platform"] == "youtube"
    assert data["status"] == "draft"
    assert "id" in data
    assert "owner_id" in data


@pytest.mark.asyncio
async def test_create_post_stores_and_returns_scheduled_time_as_utc(client: AsyncClient, auth_headers: dict):
    r = await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": "Evening local post",
            "platform": "instagram",
            "status": "scheduled",
            "scheduled_at": "2026-05-27T21:45:00-04:00",
        },
    )
    assert r.status_code == 201
    assert r.json()["scheduled_at"] == "2026-05-28T01:45:00Z"

    fetched = await client.get(f"/api/posts/{r.json()['id']}", headers=auth_headers)
    assert fetched.status_code == 200
    assert fetched.json()["scheduled_at"] == "2026-05-28T01:45:00Z"


@pytest.mark.asyncio
async def test_create_scheduled_post_requires_schedule(client: AsyncClient, auth_headers: dict):
    r = await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": "Missing schedule",
            "platform": "instagram",
            "status": "scheduled",
        },
    )
    assert r.status_code == 422
    assert "scheduled_at is required" in str(r.json()["detail"])


@pytest.mark.asyncio
async def test_create_post_rejects_same_platform_within_15_minutes(client: AsyncClient, auth_headers: dict):
    r = await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": "Launch announcement",
            "platform": "instagram",
            "status": "scheduled",
            "scheduled_at": "2026-06-01T10:00:00Z",
        },
    )
    assert r.status_code == 201

    conflict = await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": "Launch reminder",
            "platform": "instagram",
            "status": "scheduled",
            "scheduled_at": "2026-06-01T10:14:00Z",
        },
    )
    assert conflict.status_code == 409
    assert "15 minutes apart" in conflict.json()["detail"]
    assert "2026-06-01T10:14:00Z" in conflict.json()["detail"]
    assert "2026-06-01T10:00:00Z" in conflict.json()["detail"]

    allowed = await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": "Launch follow-up",
            "platform": "instagram",
            "status": "scheduled",
            "scheduled_at": "2026-06-01T10:15:00Z",
        },
    )
    assert allowed.status_code == 201


@pytest.mark.asyncio
async def test_update_post_rejects_same_platform_schedule_conflict(client: AsyncClient, auth_headers: dict):
    first = await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": "Announcement",
            "platform": "linkedin",
            "status": "scheduled",
            "scheduled_at": "2026-06-01T10:00:00Z",
        },
    )
    assert first.status_code == 201
    second = await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": "Follow-up",
            "platform": "linkedin",
            "status": "scheduled",
            "scheduled_at": "2026-06-01T10:30:00Z",
        },
    )
    assert second.status_code == 201

    r = await client.patch(
        f"/api/posts/{second.json()['id']}",
        headers=auth_headers,
        json={"scheduled_at": "2026-06-01T10:10:00Z"},
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_update_post_rejects_scheduled_status_without_schedule(client: AsyncClient, auth_headers: dict):
    create = await client.post(
        "/api/posts",
        headers=auth_headers,
        json={"title": "Needs a time", "platform": "youtube", "status": "draft"},
    )
    post_id = create.json()["id"]

    r = await client.patch(
        f"/api/posts/{post_id}",
        headers=auth_headers,
        json={"status": "scheduled"},
    )
    assert r.status_code == 422
    assert "scheduled_at is required" in r.json()["detail"]


@pytest.mark.asyncio
async def test_list_posts_returns_own(client: AsyncClient, auth_headers: dict):
    await client.post(
        "/api/posts",
        headers=auth_headers,
        json={"title": "Post A", "platform": "instagram", "status": "draft"},
    )
    r = await client.get("/api/posts", headers=auth_headers)
    assert r.status_code == 200
    posts = r.json()
    assert len(posts) == 1
    assert posts[0]["title"] == "Post A"


@pytest.mark.asyncio
async def test_get_post(client: AsyncClient, auth_headers: dict):
    create = await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": "Get me",
            "platform": "twitter",
            "status": "scheduled",
            "scheduled_at": "2026-06-01T10:00:00Z",
        },
    )
    post_id = create.json()["id"]
    r = await client.get(f"/api/posts/{post_id}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["title"] == "Get me"
    assert r.json()["platform"] == "twitter"


@pytest.mark.asyncio
async def test_update_post(client: AsyncClient, auth_headers: dict):
    create = await client.post(
        "/api/posts",
        headers=auth_headers,
        json={"title": "Original", "platform": "youtube", "status": "draft"},
    )
    post_id = create.json()["id"]
    r = await client.patch(
        f"/api/posts/{post_id}",
        headers=auth_headers,
        json={
            "title": "Updated title",
            "status": "scheduled",
            "scheduled_at": "2026-06-01T10:00:00Z",
        },
    )
    assert r.status_code == 200
    assert r.json()["title"] == "Updated title"
    assert r.json()["status"] == "scheduled"
    assert r.json()["platform"] == "youtube"


@pytest.mark.asyncio
async def test_delete_post(client: AsyncClient, auth_headers: dict):
    create = await client.post(
        "/api/posts",
        headers=auth_headers,
        json={"title": "To delete", "platform": "tiktok", "status": "draft"},
    )
    post_id = create.json()["id"]
    r = await client.delete(f"/api/posts/{post_id}", headers=auth_headers)
    assert r.status_code == 204
    get_r = await client.get(f"/api/posts/{post_id}", headers=auth_headers)
    assert get_r.status_code == 404


@pytest.mark.asyncio
async def test_posts_require_auth(client: AsyncClient):
    r = await client.get("/api/posts")
    assert r.status_code == 401

    r = await client.post(
        "/api/posts",
        json={"title": "No auth", "platform": "youtube", "status": "draft"},
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_get_post_404(client: AsyncClient, auth_headers: dict):
    r = await client.get("/api/posts/99999", headers=auth_headers)
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_filter_posts_by_status(client: AsyncClient, auth_headers: dict):
    await client.post(
        "/api/posts",
        headers=auth_headers,
        json={"title": "Draft", "platform": "youtube", "status": "draft"},
    )
    await client.post(
        "/api/posts",
        headers=auth_headers,
        json={
            "title": "Scheduled",
            "platform": "youtube",
            "status": "scheduled",
            "scheduled_at": "2026-06-01T10:00:00Z",
        },
    )
    r = await client.get("/api/posts?status=draft", headers=auth_headers)
    assert r.status_code == 200
    posts = r.json()
    assert len(posts) == 1
    assert posts[0]["status"] == "draft"
