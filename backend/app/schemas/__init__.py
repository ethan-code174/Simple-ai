from pydantic import BaseModel, EmailStr, Field


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(default="", max_length=120)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(max_length=200)
    password: str = Field(min_length=8, max_length=128)


class ProfileIn(BaseModel):
    display_name: str = Field(max_length=120)


class AgentCreateIn(BaseModel):
    name: str = Field(default="Untitled agent", min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)


class AgentPatchIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)


class WorkflowIn(BaseModel):
    spec: dict


class VersionIn(BaseModel):
    note: str = Field(default="", max_length=300)


class ArchitectCreateIn(BaseModel):
    prompt: str = Field(min_length=3, max_length=4000)


class ArchitectProposeIn(BaseModel):
    instruction: str = Field(min_length=2, max_length=2000)
    spec: dict | None = None  # the editor's current (possibly unsaved) spec


class ArchitectApplyIn(BaseModel):
    spec: dict
    summary: list[str] = Field(default_factory=list, max_length=20)


class RunIn(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    history: list[dict] = Field(default_factory=list, max_length=40)


class DecisionIn(BaseModel):
    decision: str = Field(pattern="^(approved|rejected)$")
    note: str = Field(default="", max_length=1000)


class TestCaseIn(BaseModel):
    input_text: str = Field(min_length=1, max_length=4000)
    assertion: str = Field(pattern="^(contains|not_contains|equals|max_length|uses_documents|succeeds)$")
    expected: str = Field(default="", max_length=2000)


class PublicationIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    welcome_message: str = Field(default="Hi! How can I help you today?", max_length=1000)
    avatar_emoji: str = Field(default="🤖", max_length=16)
    accent_color: str = Field(default="#3f8f84", pattern=r"^#[0-9a-fA-F]{6}$")
    slug: str | None = Field(default=None, pattern=r"^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$")


class PublicChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[dict] = Field(default_factory=list, max_length=20)


class SearchIn(BaseModel):
    query: str = Field(min_length=1, max_length=1000)


class LimitsIn(BaseModel):
    monthly_spend_limit_usd: float = Field(ge=0, le=100000)
