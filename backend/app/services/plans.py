"""Plan definitions live here, in one place. Limits are read from this table everywhere."""
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Plan:
    id: str
    name: str
    price_label: str
    monthly_executions: int
    max_agents: int
    max_documents: int
    max_published: int
    default_spend_limit_usd: float


PLANS: dict[str, Plan] = {
    "free": Plan("free", "Free", "$0/month", 300, 3, 10, 1, 0.0),
    "starter": Plan("starter", "Starter", "AUD $29/month", 3_000, 10, 100, 5, 20.0),
    "pro": Plan("pro", "Pro", "AUD $79/month", 15_000, 50, 500, 25, 80.0),
    "business": Plan("business", "Business", "AUD $199/month", 60_000, 200, 2_000, 100, 250.0),
}


def get_plan(plan_id: str) -> Plan:
    return PLANS.get(plan_id, PLANS["free"])


def plans_payload() -> list[dict]:
    return [asdict(p) for p in PLANS.values()]
