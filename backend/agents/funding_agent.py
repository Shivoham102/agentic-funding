import json
import logging
from typing import Any

import anthropic

from config import Settings
from agents.payment import PaymentAgent
from database import get_database

logger = logging.getLogger(__name__)

# Tool definitions for Claude
TOOLS = [
    {
        "name": "get_project",
        "description": "Get a project's details from the database by its ID. Returns project name, website, description, category, status, escrow info, etc.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "description": "The MongoDB project ID"
                }
            },
            "required": ["project_id"]
        }
    },
    {
        "name": "list_projects",
        "description": "List projects from the database, optionally filtered by status. Returns an array of projects.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "description": "Filter by status: submitted, processing, reviewed, ranked, funded, rejected",
                    "enum": ["submitted", "processing", "reviewed", "ranked", "funded", "rejected"]
                },
                "limit": {
                    "type": "integer",
                    "description": "Max number of projects to return (default 10)",
                    "default": 10
                }
            }
        }
    },
    {
        "name": "create_escrow",
        "description": "Create an on-chain escrow that locks USDC tokens with a natural language condition. The condition will be evaluated by an LLM oracle later. Use this when a project is approved for funding.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "description": "The project ID to fund"
                },
                "amount_usdc": {
                    "type": "number",
                    "description": "Amount in USDC (human readable, e.g. 100 = 100 USDC)"
                },
                "demand": {
                    "type": "string",
                    "description": "Natural language condition for releasing funds, e.g. 'Release when the project demonstrates 30% user growth within 90 days as evidenced by analytics data'"
                }
            },
            "required": ["project_id", "amount_usdc", "demand"]
        }
    },
    {
        "name": "submit_fulfillment",
        "description": "Submit evidence that a project has met its escrow conditions. The evidence will be evaluated by an LLM oracle.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "description": "The project ID"
                },
                "evidence": {
                    "type": "string",
                    "description": "Evidence that conditions are met, e.g. 'Project user count grew from 1000 to 1500 (50% growth) over 60 days, as shown by analytics dashboard'"
                }
            },
            "required": ["project_id", "evidence"]
        }
    },
    {
        "name": "trigger_arbitration",
        "description": "Trigger LLM arbitration to evaluate whether submitted fulfillment evidence satisfies the escrow's natural language demand.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "description": "The project ID"
                }
            },
            "required": ["project_id"]
        }
    },
    {
        "name": "collect_funds",
        "description": "Collect funds from an approved escrow, transferring tokens to the project. Only works after successful arbitration.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "description": "The project ID"
                }
            },
            "required": ["project_id"]
        }
    },
    {
        "name": "check_escrow_status",
        "description": "Check the current on-chain status of a project's escrow.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "description": "The project ID"
                }
            },
            "required": ["project_id"]
        }
    },
    {
        "name": "update_project_status",
        "description": "Update a project's status in the database.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "description": "The project ID"
                },
                "status": {
                    "type": "string",
                    "description": "New status",
                    "enum": ["submitted", "processing", "reviewed", "ranked", "funded", "rejected"]
                }
            },
            "required": ["project_id", "status"]
        }
    },
    {
        "name": "wait_and_fulfill",
        "description": "Wait for a specified number of seconds, then automatically submit fulfillment evidence for a time-based escrow. Use this for demo/testing with time-based conditions.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {
                    "type": "string",
                    "description": "The project ID"
                },
                "wait_seconds": {
                    "type": "integer",
                    "description": "Seconds to wait before submitting fulfillment (default 30)",
                    "default": 30
                },
                "escrow_created_at": {
                    "type": "string",
                    "description": "ISO timestamp of when the escrow was created"
                }
            },
            "required": ["project_id", "wait_seconds"]
        }
    },
]

SYSTEM_PROMPT = """You are the Payment Agent for Agentic Funding, an AI-powered funding platform for developer projects.

Your job is to execute funding operations on-chain using escrow. When given a task, reason step by step about what tools to use and in what order.

## Your capabilities:
- Look up projects in the database
- Create on-chain escrows that lock USDC tokens with natural language conditions
- Submit fulfillment evidence when projects meet their conditions
- Trigger LLM arbitration to evaluate fulfillment
- Collect funds after successful arbitration
- Update project statuses

## Escrow flow:
1. create_escrow: Lock tokens with a condition (e.g., "Release after 30 seconds" for demo, or "Release when project shows 30% user growth" for production)
2. submit_fulfillment: Submit evidence that the condition is met
3. trigger_arbitration: LLM oracle evaluates the evidence against the condition
4. collect_funds: If approved, tokens are released to the project

## Guidelines:
- Always look up the project first using get_project before any operation
- When funding a project, use the project's requested_funding field as the amount. If no amount was requested, ask for clarification. Never invent a funding amount.
- For demo/testing: use time-based conditions like "Release funds 30 seconds after escrow creation". Then use wait_and_fulfill to automatically wait and submit fulfillment.
- For production: use measurable growth conditions based on the project's category and stage
- When creating escrows, write clear, measurable conditions
- When asked to check on projects, look up their escrow status
- Report results clearly, including transaction hashes and UIDs when available
- If something fails, explain what went wrong and suggest next steps
- After creating an escrow with a time-based condition, automatically proceed to wait, fulfill, arbitrate, and collect unless told otherwise
"""

USDC_DECIMALS = 6


class FundingAgent:
    """LLM agent that reasons about and executes funding operations."""

    def __init__(self, settings: Settings, payment_agent: PaymentAgent) -> None:
        self.settings = settings
        self.payment_agent = payment_agent
        self.client: anthropic.Anthropic | None = None

    def initialize(self) -> None:
        if not self.settings.ANTHROPIC_API_KEY:
            logger.warning("ANTHROPIC_API_KEY not set - agent unavailable")
            return
        self.client = anthropic.Anthropic(api_key=self.settings.ANTHROPIC_API_KEY)
        logger.info("Funding agent initialized with Claude")

    async def run(self, task: str) -> dict[str, Any]:
        """Run the agent with a task description. Returns the agent's response and actions taken."""
        if not self.client:
            return {"status": "error", "error": "Agent not initialized (ANTHROPIC_API_KEY not set)"}

        messages = [{"role": "user", "content": task}]
        actions_taken = []

        # Agent loop -- keep calling Claude until it stops using tools
        max_iterations = 10
        for iteration in range(max_iterations):
            response = self.client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                tools=TOOLS,
                messages=messages,
            )

            # Check if Claude wants to use tools
            if response.stop_reason == "tool_use":
                # Process all tool calls in the response
                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        tool_name = block.name
                        tool_input = block.input
                        logger.info(f"Agent calling tool: {tool_name}({json.dumps(tool_input)})")

                        result = await self._execute_tool(tool_name, tool_input)
                        actions_taken.append({
                            "tool": tool_name,
                            "input": tool_input,
                            "result": result,
                        })

                        tool_results.append({
                            "type": "tool_result",
                            "tool_use_id": block.id,
                            "content": json.dumps(result, default=str),
                        })

                # Add assistant response and tool results to messages
                messages.append({"role": "assistant", "content": response.content})
                messages.append({"role": "user", "content": tool_results})
            else:
                # Agent is done -- extract final text response
                final_text = ""
                for block in response.content:
                    if hasattr(block, "text"):
                        final_text += block.text

                return {
                    "status": "completed",
                    "response": final_text,
                    "actions_taken": actions_taken,
                    "iterations": iteration + 1,
                }

        return {
            "status": "max_iterations",
            "response": "Agent reached maximum iterations",
            "actions_taken": actions_taken,
        }

    async def _execute_tool(self, tool_name: str, tool_input: dict) -> Any:
        """Execute a tool and return the result."""
        try:
            if tool_name == "get_project":
                return await self._get_project(tool_input["project_id"])

            elif tool_name == "list_projects":
                return await self._list_projects(
                    status=tool_input.get("status"),
                    limit=tool_input.get("limit", 10),
                )

            elif tool_name == "create_escrow":
                raw_amount = int(tool_input["amount_usdc"] * (10 ** USDC_DECIMALS))
                result = await self.payment_agent.create_escrow(
                    project_id=tool_input["project_id"],
                    amount=raw_amount,
                    demand=tool_input["demand"],
                )
                # Store escrow info in the project document
                if result.get("escrow_uid"):
                    db = get_database()
                    if db:
                        from bson import ObjectId
                        from datetime import datetime, timezone
                        await db.projects.update_one(
                            {"_id": ObjectId(tool_input["project_id"])},
                            {"$set": {
                                "escrow_info": {
                                    "escrow_uid": result["escrow_uid"],
                                    "amount": result["amount"],
                                    "demand": result["demand"],
                                    "status": "active",
                                    "created_at": result.get("timestamp"),
                                },
                                "status": "funded",
                                "funding_amount": tool_input["amount_usdc"],
                                "updated_at": datetime.now(timezone.utc),
                            }}
                        )
                return result

            elif tool_name == "submit_fulfillment":
                return await self.payment_agent.submit_fulfillment(
                    escrow_uid=await self._get_escrow_uid(tool_input["project_id"]),
                    fulfillment_evidence=tool_input["evidence"],
                )

            elif tool_name == "trigger_arbitration":
                escrow_uid = await self._get_escrow_uid(tool_input["project_id"])
                return await self.payment_agent.arbitrate(escrow_uid)

            elif tool_name == "collect_funds":
                project = await self._get_project(tool_input["project_id"])
                escrow_info = project.get("escrow_info", {})
                return await self.payment_agent.collect_funds(
                    escrow_uid=escrow_info.get("escrow_uid", ""),
                    fulfillment_uid=escrow_info.get("fulfillment_uid", ""),
                )

            elif tool_name == "check_escrow_status":
                escrow_uid = await self._get_escrow_uid(tool_input["project_id"])
                return await self.payment_agent.get_escrow_status(escrow_uid)

            elif tool_name == "update_project_status":
                return await self._update_project_status(
                    tool_input["project_id"],
                    tool_input["status"],
                )

            elif tool_name == "wait_and_fulfill":
                import asyncio
                wait_secs = tool_input.get("wait_seconds", 30)
                project_id = tool_input["project_id"]
                logger.info(f"Waiting {wait_secs}s for time-based escrow on project {project_id}")
                await asyncio.sleep(wait_secs)

                escrow_uid = await self._get_escrow_uid(project_id)
                created_at = tool_input.get("escrow_created_at", "unknown time")
                evidence = (
                    f"The escrow was created at {created_at}. "
                    f"{wait_secs} seconds have now elapsed. "
                    f"The time-based condition of waiting {wait_secs} seconds has been fulfilled."
                )
                result = await self.payment_agent.submit_fulfillment(
                    escrow_uid=escrow_uid,
                    fulfillment_evidence=evidence,
                )

                # Store fulfillment UID in the project
                if result.get("fulfillment_uid"):
                    db = get_database()
                    if db:
                        from bson import ObjectId
                        await db.projects.update_one(
                            {"_id": ObjectId(project_id)},
                            {"$set": {"escrow_info.fulfillment_uid": result["fulfillment_uid"]}}
                        )

                return result

            else:
                return {"error": f"Unknown tool: {tool_name}"}
        except Exception as e:
            logger.error(f"Tool {tool_name} failed: {e}")
            return {"error": str(e)}

    async def _get_project(self, project_id: str) -> dict:
        db = get_database()
        if db is None:
            return {"error": "Database not available"}
        from bson import ObjectId
        try:
            project = await db.projects.find_one({"_id": ObjectId(project_id)})
        except Exception:
            return {"error": f"Invalid project ID: {project_id}"}
        if not project:
            return {"error": f"Project {project_id} not found"}
        project["id"] = str(project.pop("_id"))
        return json.loads(json.dumps(project, default=str))

    async def _list_projects(self, status: str | None = None, limit: int = 10) -> list:
        db = get_database()
        if db is None:
            return [{"error": "Database not available"}]
        query = {}
        if status:
            query["status"] = status
        cursor = db.projects.find(query).limit(limit)
        projects = await cursor.to_list(length=limit)
        for p in projects:
            p["id"] = str(p.pop("_id"))
        return json.loads(json.dumps(projects, default=str))

    async def _get_escrow_uid(self, project_id: str) -> str:
        project = await self._get_project(project_id)
        escrow_info = project.get("escrow_info", {})
        uid = escrow_info.get("escrow_uid", "")
        if not uid:
            raise ValueError(f"No escrow UID found for project {project_id}")
        return uid

    async def _update_project_status(self, project_id: str, status: str) -> dict:
        db = get_database()
        if db is None:
            return {"error": "Database not available"}
        from bson import ObjectId
        from datetime import datetime, timezone
        result = await db.projects.update_one(
            {"_id": ObjectId(project_id)},
            {"$set": {"status": status, "updated_at": datetime.now(timezone.utc)}},
        )
        return {"updated": result.modified_count > 0, "project_id": project_id, "status": status}
