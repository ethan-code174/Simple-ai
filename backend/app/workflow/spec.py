"""The workflow specification: the ONLY format the engine runs. It's data, never code."""
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

ID_PATTERN = r"^[A-Za-z0-9_\-]{1,64}$"


class Position(BaseModel):
    x: float = 0
    y: float = 0


class NodeSpec(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(pattern=ID_PATTERN)
    type: str = Field(max_length=40)
    label: str = Field(default="", max_length=80)
    position: Position = Field(default_factory=Position)
    config: dict[str, Any] = Field(default_factory=dict)

    @field_validator("config")
    @classmethod
    def _config_size(cls, v: dict[str, Any]) -> dict[str, Any]:
        if len(repr(v)) > 20_000:
            raise ValueError("Block settings are too large.")
        return v


class EdgeSpec(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(pattern=ID_PATTERN)
    source: str = Field(pattern=ID_PATTERN)
    target: str = Field(pattern=ID_PATTERN)
    source_handle: str | None = Field(default=None, max_length=20)


class WorkflowSpec(BaseModel):
    model_config = ConfigDict(extra="ignore")
    schema_version: int = 1
    nodes: list[NodeSpec] = Field(default_factory=list, max_length=200)
    edges: list[EdgeSpec] = Field(default_factory=list, max_length=400)

    def node(self, node_id: str) -> NodeSpec | None:
        return next((n for n in self.nodes if n.id == node_id), None)


def empty_spec() -> dict:
    return WorkflowSpec().model_dump()
