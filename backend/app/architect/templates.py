"""Template library. Templates are built from the same block registry the engine runs, so every
'available' template is runnable. Templates needing missing integrations are listed as unavailable."""
from app.architect.planner import build_plan

TEMPLATES = [
    {"id": "customer-support", "name": "Customer Support Assistant", "icon": "Headphones",
     "description": "Answers customer questions from your documents and sends complaints or urgent issues to you for approval.",
     "prompt": "A friendly customer support assistant for my business that answers questions using my uploaded "
               "documents and sends complicated questions for human review."},
    {"id": "business-faq", "name": "Business FAQ Assistant", "icon": "HelpCircle",
     "description": "Answers frequently asked questions (hours, prices, services) using your FAQ document.",
     "prompt": "A friendly FAQ assistant for my business that answers questions from my FAQ document."},
    {"id": "document-qa", "name": "Document Question Answering", "icon": "FileSearch",
     "description": "Upload manuals, policies or notes and ask questions. Replies show which document they came from.",
     "prompt": "Answer questions about my documents and policies using the uploaded files."},
    {"id": "email-drafting", "name": "Email Drafting Assistant", "icon": "Mail",
     "description": "Describe what you want to say and get a polished email draft. (It drafts only; it doesn't send.)",
     "prompt": "A professional email assistant that drafts clear emails."},
    {"id": "research", "name": "Research Assistant", "icon": "Microscope",
     "description": "Explains and summarises topics, separating facts from opinions. Uses the model's own knowledge "
                    "plus any documents you upload (no web search).",
     "prompt": "A research assistant that summarises topics and analyses information from my uploaded notes."},
]

UNAVAILABLE_TEMPLATES = [
    {"id": "lead-to-crm", "name": "Lead Capture to CRM", "icon": "Database",
     "description": "Collects leads and saves them to HubSpot or Salesforce.",
     "unavailable_reason": "Needs a CRM integration that isn't available yet."},
    {"id": "inbox-autoreply", "name": "Inbox Auto-Reply", "icon": "Inbox",
     "description": "Reads your inbox and replies automatically.",
     "unavailable_reason": "Needs an email integration that isn't available yet."},
]


def list_templates() -> list[dict]:
    out = [{**{k: v for k, v in t.items() if k != "prompt"}, "available": True} for t in TEMPLATES]
    out += [{**t, "available": False} for t in UNAVAILABLE_TEMPLATES]
    return out


def build_template(template_id: str, provider: str, model: str):
    t = next((t for t in TEMPLATES if t["id"] == template_id), None)
    if t is None:
        return None, None
    plan = build_plan(t["prompt"], provider=provider, model=model)
    plan.name = t["name"]
    plan.description = t["description"]
    return t, plan
