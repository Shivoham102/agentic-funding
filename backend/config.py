from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "agentic_funding"
    UNBROWSE_API_KEY: str = ""
    ARKHAI_API_KEY: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
