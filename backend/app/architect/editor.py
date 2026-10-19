"""The Architect, part 2: plain-English change requests -> a proposed, reviewable diff.

Each recognised intent edits only the blocks it needs to. Nothing is applied until the user accepts."""
import copy
import re
import uuid
from dataclasses import dataclass, field

from app.architect.analysis import TONES, find_language, find_tones, find_unsupported
from app.architect.planner import COMPLEX_KEYWORDS
from app.workflow.blocks import BLOCKS
from app.workflow.layout import auto_layout

BLOCK_NAMES = {
    "input": ["input"], "prompt": ["prompt", "instructions"], "ai_model": ["ai model", "model", "ai brain", "brain"],
    "condition": ["condition", "rule", "check"], "output": ["output", "reply block"],
    "knowledge_search": ["knowledge search", "knowledge", "document search", "documents search", "search"],
    "human_approval": ["human approval", "approval", "human review", "review"],
    "text_transform": ["text transformation", "transformation", "transform", "signature"],
}

HELP = ("Here are things I can change: add human review for complicated questions, add or remove document search, "
        "make replies friendlier / more formal / shorter, reply in another language, add a rule (“always …” / "
        "“never …”), limit replies to N words, add a signature, show document sources, change creativity, switch "
        "model (or one agent's model, e.g. “switch the reviewer to qwen2.5”), add a reviewer / summarizer / "
        "simplifier agent, rename or remove a block.")


@dataclass
class Proposal:
    understood: bool
    summary: list[str]
    spec: dict
    changes: list[dict] = field(default_factory=list)
    unsupported: list[dict] = field(default_factory=list)
    message: str = ""


class _Editor:
    def __init__(self, spec: dict):
        self.spec = copy.deepcopy(spec)
        self.spec.setdefault("nodes", [])
        self.spec.setdefault("edges", [])
        self.summary: list[str] = []
        self.structure_changed = False

    # --- helpers
    def nodes_of(self, type_: str) -> list[dict]:
        return [n for n in self.spec["nodes"] if n["type"] == type_]

    def first(self, type_: str) -> dict | None:
        found = self.nodes_of(type_)
        return found[0] if found else None

    def new_id(self, type_: str) -> str:
        return f"{type_}_{uuid.uuid4().hex[:6]}"

    def add_node(self, type_: str, label: str, config: dict) -> dict:
        block = BLOCKS[type_]
        node = {"id": self.new_id(type_), "type": type_, "label": label, "position": {"x": 0, "y": 0},
                "config": {**block.config_model().model_dump(), **config}}
        self.spec["nodes"].append(node)
        self.structure_changed = True
        return node

    def connect(self, src: str, tgt: str, handle: str | None = None) -> None:
        self.spec["edges"].append({"id": f"e_{uuid.uuid4().hex[:8]}", "source": src, "target": tgt,
                                   "source_handle": handle})

    def out_edges(self, nid: str) -> list[dict]:
        return [e for e in self.spec["edges"] if e["source"] == nid]

    def in_edges(self, nid: str) -> list[dict]:
        return [e for e in self.spec["edges"] if e["target"] == nid]

    def insert_after(self, nid: str, new: dict) -> None:
        """Re-route every edge leaving `nid` to leave `new` instead, then connect nid -> new."""
        for e in self.out_edges(nid):
            e["source"] = new["id"]
            e["source_handle"] = None if new["type"] != "condition" else "false"
        self.connect(nid, new["id"])

    def insert_before(self, nid: str, new: dict) -> None:
        for e in self.in_edges(nid):
            e["target"] = new["id"]
        self.connect(new["id"], nid)

    def remove_node(self, node: dict) -> None:
        ins, outs = self.in_edges(node["id"]), self.out_edges(node["id"])
        self.spec["edges"] = [e for e in self.spec["edges"] if node["id"] not in (e["source"], e["target"])]
        self.spec["nodes"] = [n for n in self.spec["nodes"] if n["id"] != node["id"]]
        if node["type"] == "condition":  # keep the "No" path as the main path
            outs = [e for e in outs if e.get("source_handle") == "false"] or outs[:1]
        for i in ins:
            for o in outs:
                if not any(e["source"] == i["source"] and e["target"] == o["target"] for e in self.spec["edges"]):
                    self.connect(i["source"], o["target"], i.get("source_handle"))
        self.structure_changed = True

    def prompt(self) -> dict | None:
        return self.first("prompt")

    def add_rule(self, rule: str) -> bool:
        p = self.prompt()
        if not p:
            return False
        existing = p["config"].get("instructions", "")
        if rule.lower() in existing.lower():
            return True
        p["config"]["instructions"] = (existing.rstrip() + "\n" + rule).strip()
        return True


AGENT_ROLES = {
    "reviewer": ("Reviewer agent", "You are a careful reviewer. Fix mistakes, remove anything made up, and keep "
                 "the meaning. Reply with only the improved text.", "Check and improve this reply:\n\n{{%s}}"),
    "summarizer": ("Summarizer agent", "You summarise text clearly and briefly. Reply with only the summary.",
                   "Summarise this:\n\n{{%s}}"),
    "simplifier": ("Simplifier agent", "You rewrite text so a 12-year-old can understand it. Reply with only the "
                   "rewritten text.", "Rewrite this in simple words:\n\n{{%s}}"),
}
MODEL_NAME = r"((?:llama|qwen|mistral|phi|gemma|deepseek)[a-z0-9.:\-]*)"


def _add_agent(ed: _Editor, text: str, low: str) -> bool:
    """'Add a reviewer agent (using qwen2.5)' -> a new AI brain block after the last one, with its own job."""
    if not re.search(r"\b(add|another|second|extra|new)\b.{0,40}\b(agent|ai|brain|model|step)\b", low) or \
            re.search(r"\b(human|person|staff|manager)\b", low):
        return False
    kind = ("summarizer" if re.search(r"summar", low) else
            "simplifier" if re.search(r"simpl|easier|plain", low) else
            "reviewer" if re.search(r"review|check|proofread|edit|fact|improv|polish", low) else None)
    if kind is None:
        return False
    models = ed.nodes_of("ai_model")
    outputs = ed.nodes_of("output")
    if not models or not outputs:
        ed.summary.append("I couldn't find an AI brain and Output block to add the new agent between.")
        return True
    prev = models[-1]
    src = prev["config"].get("output_variable", "ai_response")
    label, role, task = AGENT_ROLES[kind]
    used = {m["config"].get("output_variable") for m in models}
    var, i = f"{kind}_response", 2
    while var in used:
        var, i = f"{kind}_response_{i}", i + 1
    cfg = {"role": role, "task": task % src, "provider": prev["config"].get("provider", "ollama"),
           "model": prev["config"].get("model", "llama3.2"), "temperature": 0.2, "use_knowledge": False,
           "use_history": False, "output_variable": var}
    mm = re.search(MODEL_NAME, low)
    if mm:
        cfg["provider"], cfg["model"] = "ollama", mm.group(1).rstrip(".")
    node = ed.add_node("ai_model", label, cfg)
    ed.insert_after(prev["id"], node)
    for o in outputs:
        if o["config"].get("content_source") == src:
            o["config"]["content_source"] = var
    for t in ed.nodes_of("text_transform"):
        if t["config"].get("source") == src:
            t["config"]["source"] = var
    ed.summary.append(f"Add a **{label}** after **{prev.get('label') or 'AI brain'}**. It has its own job and runs on "
                      f"**{cfg['model']}**, and its answer becomes the reply. You can pick a different model for it "
                      "in its settings.")
    return True


def _intents(ed: _Editor, text: str) -> None:
    low = text.lower().strip()

    if _add_agent(ed, text, low):
        return

    # Human review / escalation
    if re.search(r"human|person|staff|manager|review|approv|escalat", low) and \
            re.search(r"\badd|send|route|escalat|forward|pass|need|require|check", low) and \
            not re.search(r"\b(remove|delete|get rid of|take out)\b", low):
        if ed.first("human_approval"):
            ed.summary.append("Your workflow already has a Ask me first step, so I left it as it is.")
        else:
            inp = ed.first("input")
            if inp:
                quoted = re.findall(r"[\"“']([^\"”']{2,40})[\"”']", text)
                about = re.search(r"\b(?:mention(?:s|ing)?|about|contain(?:s|ing)?|include(?:s|ing)?)\s+([a-z ,]+?)(?:\s+(?:to|for|go)\b|$)", low)
                if quoted:
                    op, val = "contains_any", ", ".join(q.strip() for q in quoted)
                    why = f"the message mentions {val}"
                elif about and len(about.group(1)) < 80 and "question" not in about.group(1):
                    op, val = "contains_any", ", ".join(w.strip() for w in re.split(r",| or | and ", about.group(1)) if w.strip())
                    why = f"the message mentions {val}"
                elif re.search(r"complicated|complex|long|detailed|difficult|hard", low):
                    op, val = "word_count_greater_than", "40"
                    why = "the message is longer than 40 words (a simple stand-in for “complicated”)"
                else:
                    op, val = "contains_any", COMPLEX_KEYWORDS
                    why = f"the message mentions words like {COMPLEX_KEYWORDS}"
                cond = ed.add_node("condition", "Needs a person?", {"value_source": inp["config"].get("name", "message"),
                                                                   "operator": op, "compare_value": val})
                appr = ed.add_node("human_approval", "Human review", {})
                targets = [(e["target"]) for e in ed.out_edges(inp["id"])]
                ed.spec["edges"] = [e for e in ed.spec["edges"] if e["source"] != inp["id"]]
                ed.connect(inp["id"], cond["id"])
                ed.connect(cond["id"], appr["id"], "true")
                for t in targets:
                    ed.connect(cond["id"], t, "false")
                    ed.connect(appr["id"], t)
                ed.summary.append(f"Add a **If / Otherwise** that checks whether {why}. If yes, a **Ask me first** step "
                                  "pauses the conversation until you approve it. You can edit the rule in the If / Otherwise step.")

    # Remove a block
    m = re.search(r"\b(?:remove|delete|get rid of|take out)\s+(?:the\s+|a\s+|my\s+)?(.+?)(?:\s+block)?(?:[.!]|$)", low)
    if m:
        target = m.group(1).strip()
        hits = [n for n in ed.spec["nodes"] if n.get("label", "").lower() == target]
        if not hits:
            for type_, names in BLOCK_NAMES.items():
                if any(target == nm or target.startswith(nm) or nm in target.split(" step")[0] for nm in names):
                    hits = ed.nodes_of(type_)
                    if type_ == "human_approval":
                        hits += [c for c in ed.nodes_of("condition") if any(
                            e["target"] in [h["id"] for h in ed.nodes_of("human_approval")] for e in ed.out_edges(c["id"]))]
                    break
        if hits:
            for n in hits:
                ed.remove_node(n)
                ed.summary.append(f"Remove **{n.get('label') or BLOCKS[n['type']].label}** and reconnect the blocks around it.")
            if any(n["type"] == "knowledge_search" for n in hits):
                for mdl in ed.nodes_of("ai_model"):
                    mdl["config"]["use_knowledge"] = False
        else:
            ed.summary.append(f"I couldn't find a block called “{target}” to remove.")

    # Knowledge / documents
    if re.search(r"document|docs\b|pdf|files?\b|knowledge|uploaded|manual", low) and \
            re.search(r"\b(add|use|search|read|look|answer from|check)\b", low) and not m:
        if ed.first("knowledge_search"):
            ed.summary.append("Document search is already part of this workflow.")
        else:
            p = ed.prompt()
            anchor = p or ed.first("ai_model")
            inp = ed.first("input")
            if anchor and inp:
                ks = ed.add_node("knowledge_search", "Search documents",
                                 {"query_source": inp["config"].get("name", "message"), "top_k": 4})
                ed.insert_before(anchor["id"], ks)
                for mdl in ed.nodes_of("ai_model"):
                    mdl["config"]["use_knowledge"] = True
                ed.add_rule("Answer using the business documents. If they don't contain the answer, say you don't know instead of guessing")
                for o in ed.nodes_of("output"):
                    o["config"]["include_sources"] = True
                ed.summary.append("Add **Look in documents** so the AI answers from your uploaded documents, and show sources in replies.")

    # Tone
    tones = [t for t in find_tones(low) if t not in ("short", "shorter")] if "word" in low else find_tones(low)
    p = ed.prompt()
    if tones and p:
        desc = ", ".join(dict.fromkeys(TONES[t] for t in tones))
        sp = p["config"].get("system_prompt", "")
        sp = re.sub(r"\s*Your tone is [^.]*\.", "", sp).rstrip()
        p["config"]["system_prompt"] = f"{sp} Your tone is {desc}."
        ed.summary.append(f"Change the tone in the **Instructions** to: {desc}.")
        if any(t in ("concise", "short", "shorter") for t in tones):
            for mdl in ed.nodes_of("ai_model"):
                mdl["config"]["max_tokens"] = min(mdl["config"].get("max_tokens", 400), 250)

    # Language
    lang = find_language(low)
    if lang and p:
        cfg = p["config"]
        cfg["instructions"] = re.sub(r"(?m)^Always reply in \w+\s*$", "", cfg.get("instructions", "")).strip()
        ed.add_rule(f"Always reply in {lang}")
        ed.summary.append(f"Add a rule to always reply in **{lang}**.")

    # Explicit rules
    for sentence in re.split(r"(?<=[.!])\s+|\band also\b", text):
        s = sentence.strip().rstrip(".!")
        if re.match(r"(?i)^(always|never|don't|do not|make sure|only|please always|please never)\b", s) and \
                not re.match(r"(?i)^always reply in \w+$", s):
            rule = re.sub(r"(?i)^please\s+", "", s)
            if ed.add_rule(rule[0].upper() + rule[1:]):
                ed.summary.append(f"Add the rule “{rule}” to the **Instructions**.")

    # Word / character limit
    lm = re.search(r"(?:limit|keep|max(?:imum)?|under|no more than|at most)\D{0,30}?(\d{1,5})\s*(words?|characters?|chars?)", low)
    if lm and ed.first("output"):
        n, unit = int(lm.group(1)), lm.group(2)
        op = "word_limit" if unit.startswith("word") else "truncate"
        existing = next((t for t in ed.nodes_of("text_transform") if t["config"].get("operation") == op), None)
        if existing:
            existing["config"]["limit"] = n
        else:
            _add_transform_before_output(ed, "Limit length", {"operation": op, "limit": n})
        ed.add_rule(f"Keep replies under {n} {'words' if op == 'word_limit' else 'characters'}")
        ed.summary.append(f"Limit replies to **{n} {unit}** (a Change the text cuts anything longer).")

    # Signature
    sm = re.search(r"(?:sign(?:ed)? off with|signature|sign it with|end (?:every|each) (?:reply|message) with)\s*[:\-]?\s*[\"“]?([^\"”\n]{0,60}?)(?:[\"”]|\s+and\s|[.!]?$)", low)
    if sm and ed.first("output"):
        sig = sm.group(1).strip().rstrip(".") or "The Team"
        orig = re.search(re.escape(sig), text, re.I)
        sig = orig.group(0) if orig else sig
        _add_transform_before_output(ed, "Add signature", {"operation": "add_suffix", "text": f"\n\n— {sig}"})
        ed.summary.append(f"Add the signature “— {sig}” to every reply.")

    # Sources
    if re.search(r"(show|include|add|cite|list)\s+(the\s+)?(document\s+)?(sources|references|citations)", low):
        for o in ed.nodes_of("output"):
            o["config"]["include_sources"] = True
        ed.summary.append("Show document sources under each reply.")

    # Creativity / model. If the request names one AI block ("switch the reviewer agent to qwen2.5"),
    # only that block changes; otherwise all of them do.
    ai_nodes = ed.nodes_of("ai_model")
    named = [n for n in ai_nodes if n.get("label") and (n["label"].lower() in low or
                                                         n["label"].lower().removesuffix(" agent") in low.split())]
    for mdl in named or ai_nodes:
        c = mdl["config"]
        tm = re.search(r"temperature\s*(?:to|of|=)?\s*([0-9.]+)", low)
        if tm:
            c["temperature"] = max(0.0, min(1.5, float(tm.group(1))))
            ed.summary.append(f"Set creativity (temperature) to {c['temperature']}.")
        elif re.search(r"more creative|less boring|more varied", low):
            c["temperature"] = min(1.2, round(c.get("temperature", 0.5) + 0.3, 1))
            ed.summary.append(f"Raise creativity to {c['temperature']}.")
        elif re.search(r"more (focused|precise|accurate|consistent|factual)|less creative", low):
            c["temperature"] = 0.2
            ed.summary.append("Lower creativity to 0.2 for more consistent answers.")
        if re.search(r"quote finder|without ai|no ai|no-ai", low):
            c["provider"], c["model"] = "quotes", "quote-finder"
            ed.summary.append("Switch the AI brain to **Document Quote Finder** (not AI: it quotes your documents).")
        else:
            mm = re.search(r"\b(?:use|switch to|change (?:the )?model to)\s+(?:the\s+)?(?:model\s+)?([a-z0-9][a-z0-9.:\-]{1,40})(?:\s+model)?\b", low) \
                or (named and re.search(r"\b(?:use|switch|change|set|run|move)\b.{0,40}?\b(?:to|on|with)\s+(?:the\s+)?"
                                        + MODEL_NAME, low))
            if mm and mm.group(1) not in ("a", "the", "documents", "document", "knowledge", "my", "more", "less", "it") \
                    and re.search(r"llama|qwen|mistral|phi|gemma|deepseek|ollama|local", mm.group(1)):
                name = mm.group(1)
                if name in ("ollama", "local"):
                    c["provider"] = "ollama"
                else:
                    c["provider"], c["model"] = "ollama", name
                ed.summary.append(f"Switch **{mdl.get('label') or 'AI brain'}** to **{c['model']}** running locally with Ollama.")

    # Rename a block
    rm = re.search(r"rename (?:the\s+)?(.+?)\s+(?:block\s+)?to\s+[\"“']?(.+?)[\"”']?$", text, re.I)
    if rm:
        target = rm.group(1).strip().lower()
        for n in ed.spec["nodes"]:
            if n.get("label", "").lower() == target or BLOCKS[n["type"]].label.lower() == target or n["type"] == target:
                n["label"] = rm.group(2).strip()[:80]
                ed.summary.append(f"Rename the block to “{n['label']}”.")
                break


def _add_transform_before_output(ed: _Editor, label: str, config: dict) -> None:
    for out in ed.nodes_of("output"):
        src = out["config"].get("content_source", "ai_response")
        var = f"text_{uuid.uuid4().hex[:4]}"
        t = ed.add_node("text_transform", label, {**config, "source": src, "output_variable": var})
        ed.insert_before(out["id"], t)
        out["config"]["content_source"] = var


def diff_specs(old: dict, new: dict) -> list[dict]:
    old_nodes = {n["id"]: n for n in old.get("nodes", [])}
    new_nodes = {n["id"]: n for n in new.get("nodes", [])}
    changes = []
    for nid, n in new_nodes.items():
        label = n.get("label") or BLOCKS[n["type"]].label
        if nid not in old_nodes:
            changes.append({"kind": "added", "node_id": nid, "type": n["type"], "label": label})
        else:
            o = old_nodes[nid]
            fields = [k for k in set(o.get("config", {})) | set(n.get("config", {}))
                      if o.get("config", {}).get(k) != n.get("config", {}).get(k)]
            if o.get("label") != n.get("label"):
                fields.append("label")
            if fields:
                changes.append({"kind": "modified", "node_id": nid, "type": n["type"], "label": label,
                                "fields": sorted(fields),
                                "before": {k: o.get("config", {}).get(k, o.get(k)) for k in fields},
                                "after": {k: n.get("config", {}).get(k, n.get(k)) for k in fields}})
    for nid, o in old_nodes.items():
        if nid not in new_nodes:
            changes.append({"kind": "removed", "node_id": nid, "type": o["type"],
                            "label": o.get("label") or BLOCKS[o["type"]].label})
    old_e = {(e["source"], e.get("source_handle"), e["target"]) for e in old.get("edges", [])}
    new_e = {(e["source"], e.get("source_handle"), e["target"]) for e in new.get("edges", [])}
    if old_e != new_e:
        changes.append({"kind": "connections", "added": len(new_e - old_e), "removed": len(old_e - new_e)})
    return changes


def propose_edit(spec: dict, instruction: str) -> Proposal:
    ed = _Editor(spec)
    _intents(ed, instruction)
    unsupported = find_unsupported(instruction)
    new_spec = auto_layout(ed.spec) if ed.structure_changed else ed.spec
    changes = diff_specs(spec, new_spec)
    real = [s for s in ed.summary if not s.startswith(("I couldn't", "Your workflow already", "Document search is already"))]
    understood = bool(changes)
    if understood:
        msg = "Here's what I'd change:"
    elif ed.summary:
        msg = " ".join(ed.summary)
    elif unsupported:
        msg = "I can't build that part yet."
    else:
        msg = "I didn't understand that change, so I haven't touched your workflow. " + HELP
    return Proposal(understood=understood, summary=real if understood else ed.summary, spec=new_spec,
                    changes=changes, unsupported=unsupported, message=msg)
