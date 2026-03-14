from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "agentic_funding"
    UNBROWSE_API_KEY: str = ""
    ARKHAI_API_KEY: str = ""

    # Alkahest / On-Chain Payment Config (Base Sepolia)
    ORACLE_PRIVATE_KEY: str = ""
    BASE_SEPOLIA_RPC_URL: str = "https://sepolia.base.org"
    ORACLE_WALLET_ADDRESS: str = ""
    ESCROW_TOKEN_ADDRESS: str = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    ESCROW_GROWTH_TARGET: float = 30.0
    ESCROW_CHECK_INTERVAL_MINUTES: int = 60

    class Config:
        env_file = ".env"


settings = Settings()
