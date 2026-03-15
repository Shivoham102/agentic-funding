from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings


ENV_FILE = Path(__file__).resolve().parent / ".env"


class Settings(BaseSettings):
    MONGODB_URL: str = "mongodb://localhost:27017"
    DATABASE_NAME: str = "agentic_funding"
    BACKEND_CORS_ORIGINS: str = "http://localhost:3000,http://localhost:3001"
    BACKEND_CORS_ORIGIN_REGEX: str = ""
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
    DECISION_NODE_EXECUTABLE: str = "node"
    TREASURY_NODE_EXECUTABLE: str = "node"
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
    TREASURY_MAX_IDLE_DEPLOYMENT_RATIO: float = 0.85
    TREASURY_MAX_SINGLE_VAULT_ALLOCATION_RATIO: float = 0.6
    TREASURY_MARKET_RISK_OFF: bool = False
    TREASURY_MARKET_VOLATILITY_SCORE: float = 30.0
    TREASURY_MARKET_LIQUIDITY_STRESS_SCORE: float = 20.0
    TREASURY_MARKET_WITHDRAWAL_DEMAND_SCORE: float = 20.0
    TREASURY_MARKET_MIN_AVERAGE_APY_PCT: float = 2.0
    TREASURY_MARKET_MIN_WITHDRAWABLE_COVERAGE_RATIO: float = 0.4
    TREASURY_MARKET_MIN_STRATEGY_COUNT: int = 1
    TREASURY_METEORA_ENABLED: bool = False
    TREASURY_METEORA_TOKEN_SYMBOLS: str = "USDC,SOL"
    TREASURY_METEORA_CLUSTER: str = "devnet"
    TREASURY_METEORA_RPC_URL: str = ""
    TREASURY_METEORA_DYNAMIC_VAULT_API_URL: str = "https://merv2-api.meteora.ag"
    TREASURY_METEORA_TIMEOUT_SECONDS: float = 15.0
    TREASURY_METEORA_TOKEN_MINT_OVERRIDES: str = ""
    DECISION_AGENT_MODE: str = "gemini"
    DECISION_AGENT_MODEL: str = "gemini-3.1-flash-lite-preview"
    DECISION_TIMEOUT_SECONDS: float = 45.0
    DECISION_MAX_RETRIES: int = 0
    DECISION_MIN_REQUEST_INTERVAL_SECONDS: float = 5.0
    DECISION_ALLOW_HEURISTIC_FALLBACK: bool = True
    DECISION_PER_PROPOSAL_CAP_RATIO: float = 0.2
    DECISION_SECTOR_EXPOSURE_CAP_RATIO: float = 0.35
    DECISION_MINIMUM_FUNDABLE_SCORE: float = 60.0
    DECISION_MINIMUM_ACCEPT_SCORE: float = 78.0
    DECISION_MINIMUM_CONFIDENCE: float = 0.45
    DECISION_HIGH_RISK_REJECT_BELOW_SCORE: float = 72.0
    DECISION_HIGH_RISK_MIN_CONFIDENCE: float = 0.55
    DECISION_MAX_REVISION_ATTEMPTS: int = 3
    DECISION_MAX_MILESTONE_COUNT: int = 5

    # Alkahest / On-Chain Payment Config (Base Sepolia)
    ORACLE_PRIVATE_KEY: str = ""
    BASE_SEPOLIA_RPC_URL: str = "https://sepolia.base.org"
    ORACLE_WALLET_ADDRESS: str = ""
    ESCROW_TOKEN_ADDRESS: str = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    ESCROW_GROWTH_TARGET: float = 30.0
    ESCROW_CHECK_INTERVAL_MINUTES: int = 60

    # LLM Provider Keys (for NLA oracle arbitration)
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""

    @property
    def cors_origins(self) -> List[str]:
        return [
            origin.strip()
            for origin in self.BACKEND_CORS_ORIGINS.split(",")
            if origin.strip()
        ]

    class Config:
        env_file = ENV_FILE


settings = Settings()
