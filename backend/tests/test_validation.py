from app.workflow.validator import validate_workflow


def basic(provider="mock"):
    return {"nodes": [
        {"id": "in", "type": "input", "config": {"name": "message"}},
        {"id": "p", "type": "prompt", "config": {"user_prompt": "{{message}}"}},
        {"id": "m", "type": "ai_model", "config": {"provider": provider, "model": "x"}},
        {"id": "o", "type": "output", "config": {"content_source": "ai_response"}},
    ], "edges": [
        {"id": "e1", "source": "in", "target": "p"},
        {"id": "e2", "source": "p", "target": "m"},
        {"id": "e3", "source": "m", "target": "o"},
    ]}


def codes(rep, severity="error"):
    return {i.code for i in rep.issues if i.severity == severity}


def test_valid_workflow_has_deterministic_order():
    rep = validate_workflow(basic(), provider_ids={"mock"})
    assert rep.ok, rep.issues
    assert rep.order == ["in", "p", "m", "o"]


def test_cycle_is_rejected():
    spec = basic()
    spec["edges"].append({"id": "e4", "source": "m", "target": "p"})
    rep = validate_workflow(spec)
    assert "cycle" in codes(rep)


def test_unknown_block_type_rejected():
    spec = basic()
    spec["nodes"].append({"id": "x", "type": "send_email", "config": {}})
    rep = validate_workflow(spec)
    assert "unknown_block" in codes(rep)


def test_invalid_node_configuration():
    spec = basic()
    spec["nodes"][2]["config"]["temperature"] = 9  # above max
    rep = validate_workflow(spec)
    assert "invalid_config" in codes(rep)
    spec = basic()
    spec["nodes"][0]["config"]["name"] = "bad name; drop table"
    assert "invalid_config" in codes(validate_workflow(spec))


def test_condition_edges_need_yes_no_handles():
    spec = basic()
    spec["nodes"].insert(1, {"id": "c", "type": "condition",
                             "config": {"value_source": "message", "operator": "contains", "compare_value": "x"}})
    spec["edges"][0] = {"id": "e1", "source": "in", "target": "c"}
    spec["edges"].append({"id": "e5", "source": "c", "target": "p"})  # no handle
    assert "condition_handle" in codes(validate_workflow(spec))


def test_missing_variable_detected():
    spec = basic()
    spec["nodes"][3]["config"]["content_source"] = "nonexistent"
    rep = validate_workflow(spec)
    assert "missing_variable" in codes(rep)


def test_output_must_be_reachable_and_inputs_have_no_incoming():
    spec = basic()
    spec["edges"] = spec["edges"][:2]
    assert "output_unreachable" in codes(validate_workflow(spec))
    spec = basic()
    spec["edges"].append({"id": "e9", "source": "o", "target": "in"})
    c = codes(validate_workflow(spec))
    assert "output_has_outgoing" in c


def test_node_limit_and_dangling_edges():
    spec = basic()
    spec["nodes"] += [{"id": f"t{i}", "type": "text_transform", "config": {}} for i in range(60)]
    assert "too_many_nodes" in codes(validate_workflow(spec, max_nodes=50))
    spec = basic()
    spec["edges"].append({"id": "e8", "source": "o", "target": "ghost"})
    assert "dangling_edge" in codes(validate_workflow(spec))


def test_disabled_hosted_provider_rejected():
    rep = validate_workflow(basic("openai"), provider_ids={"openai", "ollama"}, implemented_providers={"ollama"})
    assert "provider_not_enabled" in codes(rep)


def test_malformed_spec():
    rep = validate_workflow({"nodes": [{"id": "has spaces!", "type": "input"}]})
    assert "invalid_spec" in codes(rep)
