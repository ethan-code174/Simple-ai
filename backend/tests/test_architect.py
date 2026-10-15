import pytest

from app.architect.editor import propose_edit
from app.architect.planner import build_plan
from app.architect.templates import TEMPLATES, build_template
from app.workflow.blocks import BLOCKS
from app.workflow.validator import validate_workflow

PROMPTS = [
    "Create an AI receptionist for my plumbing business that answers customer questions, reads my business "
    "documents, and collects booking requests.",
    "Make me an AI that responds to customer enquiries using information from uploaded documents.",
    "An email assistant that writes friendly replies in Spanish",
    "A tutor for my daughter's maths homework",
    "Customer support bot that escalates complaints to a manager",
    "xyz",
]


@pytest.mark.parametrize("prompt", PROMPTS)
def test_generated_workflows_are_valid_and_only_use_real_blocks(prompt):
    plan = build_plan(prompt)
    rep = validate_workflow(plan.spec, provider_ids={"ollama"})
    assert rep.ok, rep.issues
    assert all(n["type"] in BLOCKS for n in plan.spec["nodes"])
    assert plan.explanation


def test_receptionist_plan_matches_request():
    plan = build_plan(PROMPTS[0])
    types = [n["type"] for n in plan.spec["nodes"]]
    assert "knowledge_search" in types
    prompt = next(n for n in plan.spec["nodes"] if n["type"] == "prompt")["config"]
    assert "plumbing" in prompt["system_prompt"] and "Booking request" in prompt["instructions"]


def test_unsupported_requests_are_explained_not_faked():
    plan = build_plan("A bot that sends SMS reminders and adds bookings to Google Calendar")
    feats = {u["feature"] for u in plan.analysis.unsupported}
    assert "SMS / WhatsApp / messaging apps" in feats and "Adding bookings to a calendar" in feats
    assert "couldn't build yet" in plan.explanation


def test_edit_adds_review_without_rebuilding_everything():
    spec = build_plan(PROMPTS[1]).spec
    p = propose_edit(spec, "Add a condition that sends complicated questions for human review.")
    added = [c for c in p.changes if c["kind"] == "added"]
    assert {c["type"] for c in added} == {"condition", "human_approval"}
    assert not [c for c in p.changes if c["kind"] == "removed"]
    old_ids = {n["id"] for n in spec["nodes"]}
    assert old_ids <= {n["id"] for n in p.spec["nodes"]}
    assert validate_workflow(p.spec).ok


@pytest.mark.parametrize("instruction,expect", [
    ("make it more formal", "modified"),
    ("reply in French", "modified"),
    ("remove the knowledge search", "removed"),
    ("limit replies to 60 words", "added"),
    ("never discuss competitors", "modified"),
    ("show sources", None),
])
def test_edit_intents(instruction, expect):
    spec = build_plan(PROMPTS[1]).spec
    if instruction == "show sources":
        for n in spec["nodes"]:
            if n["type"] == "output":
                n["config"]["include_sources"] = False
    p = propose_edit(spec, instruction)
    assert p.understood
    if expect:
        assert any(c["kind"] == expect for c in p.changes)
    assert validate_workflow(p.spec).ok


def test_unknown_edit_changes_nothing():
    spec = build_plan(PROMPTS[1]).spec
    p = propose_edit(spec, "purple monkey dishwasher")
    assert not p.understood and p.spec == spec and "didn't understand" in p.message


def test_all_templates_build_valid_workflows():
    for t in TEMPLATES:
        _, plan = build_template(t["id"], "ollama", "llama3.2")
        assert validate_workflow(plan.spec, provider_ids={"ollama"}).ok, t["id"]
