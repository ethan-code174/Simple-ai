"""The Architect, part 1: plain-English description -> validated workflow."""
from dataclasses import dataclass, field

from app.architect.analysis import TONES, Analysis, analyse
from app.workflow.layout import auto_layout

ROLE_PROMPTS = {
    "receptionist": "You are the friendly virtual receptionist for {biz}. You greet customers, answer their questions "
                    "and help them make booking requests.",
    "support": "You are a customer support assistant for {biz}. You answer customer questions clearly and helpfully.",
    "faq": "You answer frequently asked questions for {biz}.",
    "docqa": "You answer questions using the documents provided by {biz}.",
    "email": "You are an email drafting assistant for {biz}. Given what the user wants to say, write a clear, "
             "well-structured email with a subject line, greeting, body and sign-off.",
    "research": "You are a research assistant. You explain topics clearly, summarise information, compare viewpoints "
                "and point out what is uncertain.",
    "tutor": "You are a patient tutor. You explain concepts step by step with simple examples and check understanding.",
    "writer": "You are a writing assistant for {biz}. You write engaging, clear copy in the requested style.",
    "translator": "You are a translator. Translate the user's text accurately and naturally, keeping its meaning and tone.",
    "general": "You are a helpful assistant for {biz}.",
}
ROLE_RULES = {
    "receptionist": ["Keep replies short and friendly", "If you don't know something, say so and offer to have someone "
                     "get back to them"],
    "support": ["Be accurate and polite", "If you can't help, offer to pass the question to a person"],
    "faq": ["Answer only what was asked"],
    "docqa": ["Mention which document an answer comes from when you can"],
    "email": ["Return only the email, ready to copy", "Never claim the email has been sent"],
    "research": ["Separate facts from opinions", "Say clearly when you are unsure; don't make up sources"],
    "tutor": ["Ask a follow-up question to check understanding"],
    "writer": ["Ask for the audience if it isn't clear"],
    "translator": ["Only output the translation unless asked otherwise"],
    "general": [],
}
BOOKING_RULES = [
    "When someone wants to book, collect their name, phone number, address or suburb, what they need help with, "
    "and their preferred day and time. Ask for missing details one or two at a time",
    "When you have all the details, repeat them back as a short summary starting with 'Booking request:' and tell "
    "them the team will confirm. Never promise a specific time slot",
]
COMPLEX_KEYWORDS = "complaint, refund, urgent, emergency, legal, lawyer, damage, cancel, manager"


@dataclass
class Plan:
    analysis: Analysis
    name: str
    description: str
    spec: dict
    explanation: str
    steps: list[str] = field(default_factory=list)


def _node(nid: str, type_: str, label: str, config: dict) -> dict:
    return {"id": nid, "type": type_, "label": label, "position": {"x": 0, "y": 0}, "config": config}


def _edge(src: str, tgt: str, handle: str | None = None) -> dict:
    eid = f"e_{src}_{tgt}" + (f"_{handle}" if handle else "")
    return {"id": eid, "source": src, "target": tgt, "source_handle": handle}


def system_prompt_for(a: Analysis) -> tuple[str, list[str]]:
    biz = f"a {a.business} business" if a.business else "the user"
    if a.business and a.business.endswith(("business", "company")):
        biz = f"a {a.business}"
    system = ROLE_PROMPTS.get(a.role, ROLE_PROMPTS["general"]).format(biz=biz)
    if a.tones:
        system += " Your tone is " + ", ".join(dict.fromkeys(TONES[t] for t in a.tones)) + "."
    rules = list(ROLE_RULES.get(a.role, []))
    if a.collects_bookings:
        rules += BOOKING_RULES
    if a.needs_knowledge:
        rules.append("Answer using the business documents. If they don't contain the answer, say you don't know "
                     "instead of guessing")
    if a.language:
        rules.append(f"Always reply in {a.language}")
    return system, rules


def build_plan(prompt: str, provider: str = "ollama", model: str = "llama3.2") -> Plan:
    a = analyse(prompt)
    system, rules = system_prompt_for(a)
    nodes = [_node("input_1", "input", "Customer message" if a.role in ("receptionist", "support", "faq") else "Message",
                   {"name": "message", "input_type": "text", "default_value": "", "required": True})]
    edges: list[dict] = []
    steps = ["**Input** receives each message a person types."]

    head = "input_1"  # the node new steps attach after
    if a.human_review:
        nodes.append(_node("condition_1", "condition", "Needs a person?",
                           {"value_source": "message", "operator": "contains_any", "compare_value": COMPLEX_KEYWORDS,
                            "case_sensitive": False}))
        nodes.append(_node("approval_1", "human_approval", "Human review", {
            "reviewer_note": "This message looked complicated or sensitive. Approve to let the AI answer it.",
            "waiting_reply": "Thanks for your message! A member of our team needs to look at this one and will get back to you.",
            "rejected_reply": "Thanks for your patience. Our team will contact you directly about this."}))
        edges.append(_edge("input_1", "condition_1"))
        edges.append(_edge("condition_1", "approval_1", "true"))
        steps.append(f"**Condition** checks if the message mentions things like {COMPLEX_KEYWORDS}. "
                     "If it does, **Human Approval** pauses until you approve it. You can change the words.")
    if a.needs_knowledge:
        nodes.append(_node("knowledge_1", "knowledge_search", "Search documents", {"query_source": "message", "top_k": 4}))
        steps.append("**Knowledge Search** finds the parts of your uploaded documents that match the question.")
    nodes.append(_node("prompt_1", "prompt", "Instructions", {
        "system_prompt": system, "instructions": "\n".join(rules), "user_prompt": "{{message}}"}))
    steps.append("**Prompt** tells the AI who it is and the rules it follows.")
    nodes.append(_node("model_1", "ai_model", "AI brain", {
        "provider": provider, "model": model, "temperature": 0.3 if a.needs_knowledge else 0.6,
        "max_tokens": 700 if a.role in ("email", "research", "writer") else 400,
        "use_knowledge": a.needs_knowledge, "use_history": True, "output_variable": "ai_response"}))
    steps.append("**AI Model** is the brain: it writes the reply.")
    nodes.append(_node("output_1", "output", "Reply", {
        "name": "reply", "content_source": "ai_response", "format": "as_is", "include_sources": a.needs_knowledge}))
    steps.append("**Output** sends the reply back" + (" with the document sources." if a.needs_knowledge else "."))

    first_main = "knowledge_1" if a.needs_knowledge else "prompt_1"
    if a.human_review:
        edges.append(_edge("condition_1", first_main, "false"))
        edges.append(_edge("approval_1", first_main))
    else:
        edges.append(_edge(head, first_main))
    if a.needs_knowledge:
        edges.append(_edge("knowledge_1", "prompt_1"))
    edges += [_edge("prompt_1", "model_1"), _edge("model_1", "output_1")]

    spec = auto_layout({"schema_version": 1, "nodes": nodes, "edges": edges})
    understood = ", ".join(a.recognised) if a.recognised else "a general-purpose assistant"
    parts = [f"I built **{a.agent_name}** ({understood}).", "", "How it works:"]
    parts += [f"{i + 1}. {s}" for i, s in enumerate(steps)]
    if a.needs_knowledge:
        parts += ["", "Next: upload your documents in the **Knowledge** tab so it has something to answer from."]
    if a.unsupported:
        parts += ["", "What I couldn't build yet:"]
        parts += [f"- **{u['feature']}**: {u['explanation']}" for u in a.unsupported]
    if not a.recognised:
        parts += ["", "I didn't recognise a specific job in your description, so I made a general assistant. "
                      "Tell me more (for example “answer questions about my bakery's menu”) and I'll adjust it."]
    desc = a.prompt if len(a.prompt) <= 280 else a.prompt[:277] + "…"
    return Plan(analysis=a, name=a.agent_name, description=desc, spec=spec, explanation="\n".join(parts), steps=steps)
