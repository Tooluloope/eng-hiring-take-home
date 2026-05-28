#!/usr/bin/env python3
"""
Seed the local SQLite database with random users and posts for visualization.
Run from repo root: python backend/scripts/seed_data.py
Or from backend: python scripts/seed_data.py
"""
import random
import sys
from datetime import datetime, timedelta
from pathlib import Path

# Add backend to path so we can import app
backend = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend))

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker
from app.core.security import get_password_hash
from app.models import ContentSeries, Post, User
from app.core.database import Base

# Use sync SQLite for script (same DB file as async app)
DB_PATH = backend / "scheduler.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

PLATFORMS = ["youtube", "instagram", "twitter", "tiktok", "linkedin"]
STATUSES = ["draft", "scheduled", "published", "failed"]
TITLE_PREFIXES = [
    "How to", "My take on", "Quick tip:", "Behind the scenes", "Launch day",
    "Tutorial:", "Update", "Announcement", "Week in review", "Deep dive",
]
TITLE_SUFFIXES = [
    "for beginners", "that changed everything", "you need to see", "thread",
    "video", "post", "story", "short", "live", "recap",
]
SERIES_STAGES = ["Teaser", "Announcement", "Follow-up", "Reminder"]


def is_slot_available(slots, platform, scheduled_at):
    return all(
        existing_platform != platform or abs(existing_at - scheduled_at) >= timedelta(minutes=15)
        for existing_platform, existing_at in slots
    )


def ensure_sqlite_schema(engine):
    inspector = inspect(engine)
    if "posts" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("posts")}
    with engine.begin() as connection:
        if "series_id" not in columns:
            connection.execute(text("ALTER TABLE posts ADD COLUMN series_id INTEGER"))
        if "series_position" not in columns:
            connection.execute(text("ALTER TABLE posts ADD COLUMN series_position INTEGER"))


def main():
    engine = create_engine(DATABASE_URL, echo=False)
    Base.metadata.create_all(engine)
    ensure_sqlite_schema(engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Create seed users (password: password123)
    hashed = get_password_hash("password123")
    users_data = [
        {"email": "alice@example.com", "full_name": "Alice Creator"},
        {"email": "bob@example.com", "full_name": "Bob Maker"},
        {"email": "charlie@example.com", "full_name": "Charlie Scheduler"},
    ]
    users = []
    for u in users_data:
        existing = session.query(User).filter(User.email == u["email"]).first()
        if existing:
            users.append(existing)
        else:
            user = User(email=u["email"], hashed_password=hashed, full_name=u["full_name"])
            session.add(user)
            session.commit()
            session.refresh(user)
            users.append(user)

    # Create random posts for each user
    now = datetime.utcnow()
    for user in users:
        scheduled_slots = [
            (post.platform, post.scheduled_at)
            for post in session.query(Post)
            .filter(Post.owner_id == user.id, Post.scheduled_at.isnot(None))
            .all()
        ]
        series = (
            session.query(ContentSeries)
            .filter(ContentSeries.owner_id == user.id, ContentSeries.name == "Launch sequence")
            .first()
        )
        if not series:
            series = ContentSeries(
                name="Launch sequence",
                description="A teaser, announcement, follow-up, and reminder cadence.",
                cadence="every 2 days",
                owner_id=user.id,
            )
            session.add(series)
            session.flush()
            for index, stage in enumerate(SERIES_STAGES):
                scheduled_at = (now + timedelta(days=index * 2 + 1)).replace(
                    hour=10,
                    minute=0,
                    second=0,
                    microsecond=0,
                )
                while not is_slot_available(scheduled_slots, "instagram", scheduled_at):
                    scheduled_at = scheduled_at + timedelta(minutes=15)
                scheduled_slots.append(("instagram", scheduled_at))
                session.add(
                    Post(
                        title=f"{stage}: new product drop",
                        platform="instagram",
                        scheduled_at=scheduled_at,
                        status="scheduled",
                        owner_id=user.id,
                        series_id=series.id,
                        series_position=index + 1,
                    )
                )

        n_posts = random.randint(5, 15)
        for _ in range(n_posts):
            title = f"{random.choice(TITLE_PREFIXES)} {random.choice(TITLE_SUFFIXES)}"
            platform = random.choice(PLATFORMS)
            status = random.choice(STATUSES)
            # Spread scheduled_at across past 7 days and next 14 days
            days = random.randint(-7, 14)
            hour = random.randint(8, 20)
            scheduled_at = (now + timedelta(days=days)).replace(hour=hour, minute=random.choice([0, 15, 30, 45]), second=0, microsecond=0) if status in ("scheduled", "published") else None
            if status == "draft":
                scheduled_at = None
            while scheduled_at and not is_slot_available(scheduled_slots, platform, scheduled_at):
                scheduled_at = scheduled_at + timedelta(minutes=15)
            if scheduled_at:
                scheduled_slots.append((platform, scheduled_at))
            post = Post(
                title=title,
                platform=platform,
                scheduled_at=scheduled_at,
                status=status,
                owner_id=user.id,
            )
            session.add(post)
    session.commit()
    print(f"Seeded {len(users)} users and posts into {DB_PATH}")
    print("Login with: alice@example.com / password123 (or bob@example.com, charlie@example.com)")
    session.close()


if __name__ == "__main__":
    main()
