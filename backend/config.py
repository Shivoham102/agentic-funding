from pathlib import Path

from pydantic_settings import BaseSettings


ENV_FILE = Path(__file__).resolve().parent / ".env"


class Settings(BaseSettings):
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "agentic_funding"
    UNBROWSE_API_KEY: str = ""
    UNBROWSE_URL: str = "http://127.0.0.1:6969"
    UNBROWSE_TIMEOUT_SECONDS: float = 45.0
    UNBROWSE_MAX_RETRIES: int = 2
    SOLANA_RPC_URL: str = "https://api.mainnet-beta.solana.com"
    SOLANA_RPC_COMMITMENT: str = "finalized"
    SOLANA_RECENT_SIGNATURE_LIMIT: int = 25
    SOLANA_ANALYTICS_PROVIDER: str = "rpc_history"
    SOLANA_ANALYTICS_SIGNATURE_LIMIT: int = 100
    SOLANA_TIMEOUT_SECONDS: float = 20.0
    SOLANA_MAX_RETRIES: int = 2
    GITHUB_API_URL: str = "https://api.github.com"
    GITHUB_API_TOKEN: str = ""
    GITHUB_TIMEOUT_SECONDS: float = 20.0
    GITHUB_MAX_RETRIES: int = 2
    GITHUB_COMMITS_LOOKBACK_DAYS: int = 90
    GITHUB_MAX_PAGES: int = 5
    SCORING_NODE_EXECUTABLE: str = "node"
    GEMINI_API_KEY: str = ""
    GEMINI_API_URL: str = "https://generativelanguage.googleapis.com/v1beta"
    GEMINI_MARKET_MODEL: str = "gemini-3.1-flash-lite-preview"
    GEMINI_TIMEOUT_SECONDS: float = 60.0
    GEMINI_MAX_RETRIES: int = 0
    GEMINI_MIN_REQUEST_INTERVAL_SECONDS: float = 5.0
    MARKET_SEARCH_TIMEOUT_SECONDS: float = 12.0
    MARKET_SEARCH_RESULTS_PER_QUERY: int = 2
    MARKET_MAX_SOURCE_DOCUMENTS: int = 4
    ARKHAI_API_KEY: str = ""
    TREASURY_TOTAL_CAPITAL: float = 1_000_000
    TREASURY_HOT_RESERVE_RATIO: float = 0.15
    TREASURY_STRATEGIC_BUFFER_RATIO: float = 0.1
    TREASURY_HOT_WINDOW_DAYS: int = 30

    # Alkahest / On-Chain Payment Config (Base Sepolia)
    ORACLE_PRIVATE_KEY: str = ""
    BASE_SEPOLIA_RPC_URL: str = "https://sepolia.base.org"
    ORACLE_WALLET_ADDRESS: str = ""
    ESCROW_TOKEN_ADDRESS: str = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    ESCROW_GROWTH_TARGET: float = 30.0
    ESCROW_CHECK_INTERVAL_MINUTES: int = 60

    class Config:
        env_file = ENV_FILE


settings = Settings()
