from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base
from .config import settings

# SQLite with aiosqlite for async
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# Trade-off: a proper migration tool (Alembic) is the right answer in production,
# but for a take-home with one additive change this SQLite-only ALTER avoids the
# setup cost while still letting existing local databases pick up the new columns
# without a manual `rm scheduler.db`. Swap for Alembic the moment the schema
# evolves further or this ships beyond SQLite.
def _ensure_sqlite_schema(connection):
    if engine.dialect.name != "sqlite":
        return
    inspector = inspect(connection)
    if "posts" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("posts")}
    if "series_id" not in columns:
        connection.execute(text("ALTER TABLE posts ADD COLUMN series_id INTEGER"))
    if "series_position" not in columns:
        connection.execute(text("ALTER TABLE posts ADD COLUMN series_position INTEGER"))


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_sqlite_schema)
