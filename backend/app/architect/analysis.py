"""Rule-based understanding of plain-English requests. No hosted AI API is used.

This is deliberately transparent: it recognises roles, features and unsupported integrations from
keywords and phrases, and it says so honestly when it doesn't understand something.
"""
import re
from dataclasses import dataclass, field

ROLES: list[tuple[str, str, list[str]]] = [
    # (role id, display name, trigger phrases)
    ("receptionist", "Receptionist", ["receptionist", "front desk", "front-desk", "answer calls", "take bookings"]),
    ("email", "Email Assistant", ["email", "e-mail", "inbox"]),
    ("research", "Research Assistant", ["research", "summarise", "summarize", "analyse", "analyze", "literature"]),
    ("tutor", "Tutor", ["tutor", "teach", "study", "homework", "explain concepts", "quiz me"]),
    ("writer", "Writing Assistant", ["blog", "caption", "marketing copy", "social media", "write posts", "copywrit"]),
    ("translator", "Translator", ["translate", "translator", "translation"]),
    ("faq", "FAQ Assistant", ["faq", "frequently asked"]),
    ("support", "Support Assistant", ["customer support", "customer service", "support", "help desk", "helpdesk",
                                      "enquir", "inquir", "customer question", "answers customer", "answer customer",
                                      "chatbot", "chat bot"]),
    ("docqa", "Document Assistant", ["document", "pdf", "manual", "handbook", "policy", "policies"]),
]

KNOWLEDGE_HINTS = ["document", "docs", "pdf", "file", "upload", "manual", "handbook", "knowledge", "policy",
                   "policies", "faq", "price list", "menu", "information about", "my business info",
                   "website content", "terms", "brochure", "catalog", "catalogue", "notes"]
BOOKING_HINTS = ["booking", "book ", "appointment", "reservation", "schedule a", "collect", "lead", "contact details",
                 "phone number", "quote request", "sign up", "enquiry form"]
REVIEW_HINTS = ["human review", "for review", "a human", "a person", "staff member", "manager", "escalat", "approval",
                "approve", "hand off", "handoff", "complicated", "complex"]
TONES = {
    "friendly": "warm, friendly and approachable",
    "friendlier": "warm, friendly and approachable",
    "casual": "relaxed and casual",
    "formal": "formal and polite",
    "professional": "professional and courteous",
    "concise": "concise; keep replies short and to the point",
    "short": "concise; keep replies short and to the point",
    "shorter": "concise; keep replies short and to the point",
    "detailed": "thorough and detailed",
    "funny": "light-hearted with a touch of humour",
    "playful": "playful and fun",
    "empathetic": "empathetic and reassuring",
    "patient": "patient and encouraging",
    "enthusiastic": "upbeat and enthusiastic",
}

# Things the engine can't do yet. (pattern, what it is, honest explanation)
UNSUPPORTED: list[tuple[str, str, str]] = [
    (r"\bsend(s|ing)? (an? )?(e-?mails?|emails?)\b|\bemail (me|the team|us|them)\b|\bnotify\b|\bnotification",
     "Sending emails or notifications",
     "AI Factory can draft the text, but sending emails or notifications needs an email integration that isn't available yet."),
    (r"\bsms\b|\btext message|\bwhatsapp\b|\btelegram\b|\bmessenger\b",
     "SMS / WhatsApp / messaging apps",
     "Messaging-app integrations aren't available yet. Your agent works on its own web chat page."),
    (r"\bcalendar\b|\bgoogle calendar\b|\bcalendly\b|\bbook(s|ing)? (it|them) in\b|\bconfirm(s)? (the )?booking",
     "Adding bookings to a calendar",
     "The agent can collect booking details in the chat (you'll see them in the run history), but writing to a "
     "calendar needs an integration that isn't available yet."),
    (r"\bslack\b|\bdiscord\b|\bteams\b", "Slack / Discord / Teams",
     "Chat-platform integrations aren't available yet."),
    (r"\b(search|browse) (the )?(web|internet)\b|\bgoogle (it|search)\b|\blive (prices|data|news)\b|\bwebsite scraping\b",
     "Searching the internet",
     "Your agent can only use the documents you upload and its built-in model knowledge. Web search isn't available yet."),
    (r"\bpayments?\b|\bcharge (the )?customer|\bstripe\b|\binvoice", "Taking payments",
     "Taking payments inside an agent isn't supported."),
    (r"\bphone calls?\b|\bvoice\b|\bcall (customers|people|them)\b", "Phone calls / voice",
     "Voice and phone calls aren't supported yet. Agents chat by text."),
    (r"\bcrm\b|\bhubspot\b|\bsalesforce\b|\bspreadsheet\b|\bgoogle sheets?\b|\bairtable\b|\bdatabase\b",
     "Saving to a CRM, spreadsheet or database",
     "Saving data to outside tools isn't available yet. Conversations are kept in your run history."),
    (r"\bimages?\b|\bphotos?\b|\bpictures?\b|\bgenerate (a )?logo", "Images",
     "Agents work with text only for now."),
]

LANGUAGES = ["english", "spanish", "french", "german", "italian", "portuguese", "dutch", "chinese", "mandarin",
             "japanese", "korean", "hindi", "arabic", "russian", "vietnamese", "indonesian", "thai", "turkish",
             "polish", "greek", "swedish", "tagalog"]

BUSINESS_NOUNS = r"business|company|shop|store|clinic|practice|restaurant|salon|agency|firm|startup|cafe|café|gym|" \
                 r"school|studio|bakery|hotel|bar|dental|surgery|garage|service|team|brand|website"


@dataclass
class Analysis:
    prompt: str
    role: str = "general"
    role_name: str = "Assistant"
    business: str | None = None
    needs_knowledge: bool = False
    collects_bookings: bool = False
    human_review: bool = False
    tones: list[str] = field(default_factory=list)
    language: str | None = None
    unsupported: list[dict] = field(default_factory=list)
    recognised: list[str] = field(default_factory=list)

    @property
    def agent_name(self) -> str:
        if self.business:
            return f"{self.business.title()} {self.role_name}"[:80]
        return f"My {self.role_name}"


def find_unsupported(text: str) -> list[dict]:
    low = text.lower()
    out = []
    for pattern, what, why in UNSUPPORTED:
        if re.search(pattern, low):
            out.append({"feature": what, "explanation": why})
    return out


def find_language(text: str) -> str | None:
    m = re.search(r"\b(?:in|speaks?|reply in|respond in|answer in)\s+(" + "|".join(LANGUAGES) + r")\b", text.lower())
    return m.group(1).title() if m else None


def find_tones(text: str) -> list[str]:
    low = text.lower()
    return [t for t in TONES if re.search(rf"\b{t}\b", low)]


def analyse(prompt: str) -> Analysis:
    text = " ".join(prompt.split())
    low = text.lower()
    a = Analysis(prompt=text)
    for role, name, hints in ROLES:
        if any(h in low for h in hints):
            a.role, a.role_name = role, name
            a.recognised.append(f"Role: {name}")
            break

    m = re.search(rf"\bfor (?:my|our|a|an|the) ([a-z0-9&' \-]{{2,40}}?) ({BUSINESS_NOUNS})\b", low)
    if m:
        a.business = m.group(1).strip()
    else:
        m = re.search(r"\bfor (?:my|our) ([a-z0-9&'\-]{3,30})\b", low)
        if m and m.group(1) not in ("customers", "clients", "users", "team", "students", "documents", "website"):
            a.business = m.group(1)
    if a.business:
        a.recognised.append(f"Business: {a.business}")

    a.needs_knowledge = any(h in low for h in KNOWLEDGE_HINTS) or a.role in ("docqa", "faq")
    if a.needs_knowledge:
        a.recognised.append("Answers from your uploaded documents")
    a.collects_bookings = any(h in low for h in BOOKING_HINTS) or a.role == "receptionist" and "book" in low
    if a.collects_bookings:
        a.recognised.append("Collects booking / contact details in the chat")
    a.human_review = any(h in low for h in REVIEW_HINTS) and not re.search(r"\bcustomer review", low)
    if a.human_review:
        a.recognised.append("Sends some messages to a person for approval")
    a.tones = find_tones(low)
    a.language = find_language(low)
    a.unsupported = find_unsupported(low)
    return a
