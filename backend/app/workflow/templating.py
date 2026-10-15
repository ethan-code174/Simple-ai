"""Safe {{variable}} substitution. Only plain names are allowed — no expressions, no code."""
import re

VAR_PATTERN = re.compile(r"\{\{\s*([A-Za-z_][A-Za-z0-9_]{0,63})\s*\}\}")


def find_variables(template: str) -> list[str]:
    return list(dict.fromkeys(VAR_PATTERN.findall(template or "")))


def render(template: str, variables: dict[str, str]) -> tuple[str, list[str]]:
    """Returns (rendered_text, missing_variable_names). Missing variables become empty strings."""
    missing: list[str] = []

    def sub(m: re.Match) -> str:
        name = m.group(1)
        if name not in variables:
            missing.append(name)
            return ""
        return str(variables[name])

    return VAR_PATTERN.sub(sub, template or ""), missing
