# Agentic Funding

AI-powered funding platform for developer projects. Developers submit their projects, AI agents analyze and rank them, and funding is distributed on-chain.

## Architecture

```
Developer submits project
        │
        ▼
┌─────────────────────┐
│  Data Collector Agent │  ← Uses Unbrowse to scrape & normalize project data
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│    Ranking Agent     │  ← Ranks projects by quality, traction, funding fit
└─────────┬───────────┘
          ▼
┌─────────────────────┐
│    Payment Agent     │  ← Arkhai agentic commerce + Solana on-chain payments
└─────────────────────┘    50% immediate / 50% escrow (conditional release)
```

## Tech Stack

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS
- **Backend:** Python, FastAPI, Motor (async MongoDB)
- **Database:** MongoDB
- **Integrations:** Unbrowse (web scraping), Arkhai (agentic commerce), Solana (on-chain payments)

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- Docker (for MongoDB)

### 1. Start MongoDB

```bash
docker compose up -d
```

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
├── frontend/          # Next.js app
│   └── src/
│       ├── app/       # Pages (landing, submit, dashboard)
│       └── components/
├── backend/           # FastAPI server
│   ├── agents/        # AI agent stubs
│   │   ├── data_collector.py  # Unbrowse integration
│   │   ├── ranking.py         # Project ranking
│   │   └── payment.py         # Arkhai/Solana payments
│   ├── models/        # Pydantic models
│   └── routes/        # API endpoints
└── docker-compose.yml # MongoDB
```

## Testing the payment agent

**Unit tests (dry-run, no chain):**

```bash
cd backend
python -m unittest tests.test_payment_agent -v
```

**Manual API tests (backend must be running on port 8000):**

```bash
cd backend
# Process payment (dry-run returns status "dry_run" and 50/50 split)
python scripts/test_payments_api.py process --project-id <MongoDB_ObjectId> --recipient 0x... --amount 100000000

# Release escrow
python scripts/test_payments_api.py release --project-id <id> --escrow-uid <uid>

# Oracle check cycle
python scripts/test_payments_api.py oracle-check

# Escrow status for a project
python scripts/test_payments_api.py escrow-status --project-id <id>
```

Without `ORACLE_PRIVATE_KEY` (and without a working Alkahest client), the agent runs in **dry-run mode**: it returns the same response shape but with `status: "dry_run"` and no real on-chain transactions.

## Status

This is a starter skeleton. Key TODOs:

- [ ] Unbrowse integration for data collection agent
- [ ] Ranking algorithm implementation
- [ ] Arkhai agentic commerce integration
- [ ] Solana SDK on-chain payment flow
- [ ] Escrow logic (50% held, conditional release on user growth metrics)
- [ ] Authentication & authorization
- [ ] Admin panel for fund management
