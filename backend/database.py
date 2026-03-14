import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase

from config import settings

logger = logging.getLogger(__name__)

_client: AsyncIOMotorClient | None = None


async def connect_db() -> None:
    """Connect to MongoDB."""
    global _client
    try:
        _client = AsyncIOMotorClient(settings.MONGODB_URL)
        # Verify the connection is alive
        await _client.admin.command("ping")
        logger.info("Connected to MongoDB at %s", settings.MONGODB_URL)
    except Exception as exc:
        logger.error("Failed to connect to MongoDB: %s", exc)
        _client = None
        raise


async def close_db() -> None:
    """Close MongoDB connection."""
    global _client
    if _client is not None:
        _client.close()
        _client = None
        logger.info("MongoDB connection closed")


def get_database() -> AsyncIOMotorDatabase:
    """Return the application database instance."""
    if _client is None:
        raise RuntimeError("Database client is not initialised. Call connect_db() first.")
    return _client[settings.DATABASE_NAME]


def get_collection(name: str) -> AsyncIOMotorCollection:
    """Return a collection from the application database."""
    return get_database()[name]
