"""API tests: ownership, public access, document isolation, versions, limits and the beginner flow."""
from app.models import Workspace
from tests.conftest import signup, use_mock_model

RECEPTIONIST = ("Create an AI receptionist for my plumbing business that answers customer questions, "
                "reads my business documents, and collects booking requests.")


def make_pdf(text: str) -> bytes:
    """Build a minimal valid one-page PDF containing `text`."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
            b"/Resources << /Font << /F1 5 0 R >> >> >>",
            b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    out, offsets = b"%PDF-1.4\n", []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{o:010d} 00000 n \n".encode() for o in offsets)
    out += f"trailer << /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    return out


def create_mock_agent(client, auth, prompt=RECEPTIONIST):
    r = client.post("/api/architect/create", json={"prompt": prompt}, headers=auth)
    assert r.status_code == 200, r.text
    agent = r.json()["agent"]
    spec = use_mock_model(agent["spec"])
    r = client.put(f"/api/agents/{agent['id']}/workflow", json={"spec": spec}, headers=auth)
    assert r.json()["validation"]["ok"], r.json()
    return agent["id"]


def test_beginner_flow_end_to_end(client):
    """Sign up -> describe -> generate -> edit via Architect -> upload doc -> test -> save -> publish -> public chat."""
    auth = signup(client)
    r = client.post("/api/architect/create", json={"prompt": RECEPTIONIST}, headers=auth)
    body = r.json()
    assert "Plumbing Receptionist" == body["agent"]["name"]
    types = [n["type"] for n in body["agent"]["spec"]["nodes"]]
    assert types[:1] == ["input"] and "knowledge_search" in types and types[-1] == "output"
    assert "Collects booking / contact details in the chat" in body["recognised"]
    agent_id = create_mock_agent(client, auth)

    # Architect edit: propose -> review diff -> apply (creates undoable versions)
    spec = client.get(f"/api/agents/{agent_id}", headers=auth).json()["spec"]
    prop = client.post(f"/api/agents/{agent_id}/architect/propose",
                       json={"instruction": "Add a condition that sends complicated questions for human review."},
                       headers=auth).json()
    assert prop["understood"] and prop["validation"]["ok"]
    assert {c["type"] for c in prop["changes"] if c["kind"] == "added"} == {"condition", "human_approval"}
    applied = client.post(f"/api/agents/{agent_id}/architect/apply",
                          json={"spec": prop["spec"], "summary": prop["summary"]}, headers=auth).json()
    assert len(applied["agent"]["spec"]["nodes"]) == len(spec["nodes"]) + 2

    # Knowledge
    r = client.post(f"/api/agents/{agent_id}/documents", headers=auth,
                    files={"file": ("hours.txt", b"Opening hours: Monday to Friday 7am to 6pm.\n\nWe service all of Brisbane.", "text/plain")})
    assert r.status_code == 200 and r.json()["status"] == "ready", r.text
    r = client.post(f"/api/agents/{agent_id}/documents", headers=auth,
                    files={"file": ("prices.pdf", make_pdf("Call-out fee is 90 dollars."), "application/pdf")})
    assert r.json()["status"] == "ready" and r.json()["chunk_count"] >= 1, r.text

    # Test in playground
    run = client.post(f"/api/agents/{agent_id}/run", json={"message": "What are your opening hours?"},
                      headers=auth).json()
    assert run["status"] == "succeeded", run
    assert run["reply"].startswith("[TEST MOCK") and "(used documents)" in run["reply"]
    assert any(s["filename"] == "hours.txt" for s in run["sources"])
    assert run["logs"] and run["duration_ms"] >= 0

    # Complicated message pauses for approval, then resumes
    long_msg = "My pipe burst and " + "water is everywhere " * 15
    run = client.post(f"/api/agents/{agent_id}/run", json={"message": long_msg}, headers=auth).json()
    assert run["status"] == "waiting_approval"
    approvals = client.get("/api/approvals", headers=auth).json()
    assert len(approvals) == 1
    done = client.post(f"/api/approvals/{approvals[0]['id']}/decide", json={"decision": "approved"}, headers=auth).json()
    assert done["status"] == "succeeded" and done["reply"].startswith("[TEST MOCK")

    # Save version + publish + public chat
    assert client.post(f"/api/agents/{agent_id}/versions", json={"note": "ready"}, headers=auth).status_code == 200
    pub = client.post(f"/api/agents/{agent_id}/publish", headers=auth).json()
    slug = pub["publication"]["slug"]
    assert pub["status"] == "published"
    info = client.get(f"/api/public/{slug}").json()
    assert info["name"] == "Plumbing Receptionist" and "spec" not in info
    chat = client.post(f"/api/public/{slug}/chat", json={"message": "Do you service Brisbane?"}).json()
    assert chat["status"] == "succeeded" and chat["reply"] and "logs" not in chat
    assert chat["sources"]


def test_workflow_ownership(client):
    a = signup(client, "a@example.com")
    b = signup(client, "b@example.com")
    agent_id = create_mock_agent(client, a)
    for method, path in [("get", f"/api/agents/{agent_id}"), ("delete", f"/api/agents/{agent_id}"),
                         ("get", f"/api/agents/{agent_id}/runs"), ("get", f"/api/agents/{agent_id}/documents"),
                         ("post", f"/api/agents/{agent_id}/publish")]:
        assert getattr(client, method)(path, headers=b).status_code == 404, path
    r = client.put(f"/api/agents/{agent_id}/workflow", json={"spec": {"nodes": [], "edges": []}}, headers=b)
    assert r.status_code == 404
    r = client.post(f"/api/agents/{agent_id}/run", json={"message": "hi"}, headers=b)
    assert r.status_code == 404
    run = client.post(f"/api/agents/{agent_id}/run", json={"message": "hi"}, headers=a).json()
    assert client.get(f"/api/runs/{run['id']}", headers=b).status_code == 404
    assert client.get("/api/agents", headers=b).json() == []
    assert client.get("/api/agents").status_code == 401


def test_document_isolation(client):
    a = signup(client, "a@example.com")
    b = signup(client, "b@example.com")
    agent_a = create_mock_agent(client, a)
    agent_a2 = create_mock_agent(client, a)
    agent_b = create_mock_agent(client, b)
    doc = client.post(f"/api/agents/{agent_a}/documents", headers=a,
                      files={"file": ("secret.txt", b"The secret discount code is PURPLE42.", "text/plain")}).json()
    # Other user's agent and even another agent of the same user can't find it
    assert client.post(f"/api/agents/{agent_b}/knowledge/search", json={"query": "secret discount code"},
                       headers=b).json() == []
    assert client.post(f"/api/agents/{agent_a2}/knowledge/search", json={"query": "secret discount code"},
                       headers=a).json() == []
    assert client.post(f"/api/agents/{agent_a}/knowledge/search", json={"query": "secret discount code"},
                       headers=a).json()[0]["filename"] == "secret.txt"
    assert client.delete(f"/api/documents/{doc['id']}", headers=b).status_code == 404
    assert client.post(f"/api/documents/{doc['id']}/reindex", headers=b).status_code == 404
    run = client.post(f"/api/agents/{agent_b}/run", json={"message": "secret discount code"}, headers=b).json()
    assert run["sources"] == []


def test_upload_validation(client, auth):
    agent_id = create_mock_agent(client, auth)
    r = client.post(f"/api/agents/{agent_id}/documents", headers=auth, files={"file": ("x.exe", b"MZ...", "application/octet-stream")})
    assert r.status_code == 400
    r = client.post(f"/api/agents/{agent_id}/documents", headers=auth, files={"file": ("fake.pdf", b"not a pdf", "application/pdf")})
    assert r.json()["status"] == "failed" and "PDF" in r.json()["error"]
    r = client.post(f"/api/agents/{agent_id}/documents", headers=auth, files={"file": ("../../evil.txt", b"hello world text", "text/plain")})
    assert r.status_code == 200 and ".." not in r.json()["filename"]


def test_public_access_restrictions(client, auth):
    agent_id = create_mock_agent(client, auth)
    agent = client.get(f"/api/agents/{agent_id}", headers=auth).json()
    # Not published yet -> nothing public
    pub = client.put(f"/api/agents/{agent_id}/publication", headers=auth,
                     json={"display_name": "Plumber Bot", "slug": "plumber-bot"}).json()
    assert pub["publication"]["is_live"] is False
    assert client.get("/api/public/plumber-bot").status_code == 404
    assert client.post("/api/public/plumber-bot/chat", json={"message": "hi"}).status_code == 404
    client.post(f"/api/agents/{agent_id}/publish", headers=auth)
    assert client.get("/api/public/plumber-bot").status_code == 200
    # Public visitors can't edit: there is no public write endpoint and owner endpoints need auth
    assert client.put(f"/api/agents/{agent_id}/workflow", json={"spec": agent["spec"]}).status_code == 401
    # Draft edits don't leak into the published snapshot until re-publish
    spec = agent["spec"]
    spec["nodes"] = [n for n in spec["nodes"] if n["type"] != "output"]
    client.put(f"/api/agents/{agent_id}/workflow", json={"spec": spec}, headers=auth)
    assert client.post("/api/public/plumber-bot/chat", json={"message": "hi"}).json()["status"] == "succeeded"
    # Publishing a broken workflow is refused
    r = client.post(f"/api/agents/{agent_id}/publish", headers=auth)
    assert r.status_code == 422
    # Run status polling needs the signed token
    chat = client.post("/api/public/plumber-bot/chat", json={"message": "hi"}).json()
    assert client.get(f"/api/public/plumber-bot/runs/{chat['run_id']}?token=wrong").status_code == 404
    assert client.get(f"/api/public/plumber-bot/runs/{chat['run_id']}?token={chat['view_token']}").status_code == 200
    # Unpublish hides it again
    client.post(f"/api/agents/{agent_id}/unpublish", headers=auth)
    assert client.get("/api/public/plumber-bot").status_code == 404


def test_public_rate_limit(client, auth):
    agent_id = create_mock_agent(client, auth)
    slug = client.post(f"/api/agents/{agent_id}/publish", headers=auth).json()["publication"]["slug"]
    codes = [client.post(f"/api/public/{slug}/chat", json={"message": "hi"}).status_code for _ in range(25)]
    assert 429 in codes and codes[0] == 200


def test_version_restoration(client, auth):
    agent_id = create_mock_agent(client, auth)
    original = client.get(f"/api/agents/{agent_id}", headers=auth).json()["spec"]
    v = client.post(f"/api/agents/{agent_id}/versions", json={"note": "good"}, headers=auth).json()["version"]
    broken = {"nodes": original["nodes"][:1], "edges": []}
    client.put(f"/api/agents/{agent_id}/workflow", json={"spec": broken}, headers=auth)
    assert not client.get(f"/api/agents/{agent_id}", headers=auth).json()["validation"]["ok"]
    restored = client.post(f"/api/agents/{agent_id}/versions/{v}/restore", headers=auth).json()
    assert restored["spec"] == original and restored["validation"]["ok"]
    notes = [x["note"] for x in client.get(f"/api/agents/{agent_id}/versions", headers=auth).json()]
    assert notes[0] == f"Restored version {v}"


def test_usage_limits(client, auth):
    from app.database import SessionLocal

    agent_id = create_mock_agent(client, auth)
    with SessionLocal() as db:
        ws = db.query(Workspace).one()
        ws.plan = "free"
        db.commit()
    from app.services import plans

    original = plans.PLANS["free"]
    plans.PLANS["free"] = plans.Plan("free", "Free", "$0", 2, 3, 10, 1, 0.0)
    try:
        assert client.post(f"/api/agents/{agent_id}/run", json={"message": "1"}, headers=auth).status_code == 200
        assert client.post(f"/api/agents/{agent_id}/run", json={"message": "2"}, headers=auth).status_code == 200
        r = client.post(f"/api/agents/{agent_id}/run", json={"message": "3"}, headers=auth)
        assert r.status_code == 402 and "runs included" in r.json()["detail"]
    finally:
        plans.PLANS["free"] = original
    # Agent quota
    for _ in range(2):
        client.post("/api/agents", json={"name": "x"}, headers=auth)
    assert client.post("/api/agents", json={"name": "x"}, headers=auth).status_code == 402


def test_model_provider_failure_surfaces_friendly_error(client, auth):
    r = client.post("/api/architect/create", json={"prompt": "a support bot"}, headers=auth).json()
    run = client.post(f"/api/agents/{r['agent']['id']}/run", json={"message": "hi"}, headers=auth).json()
    assert run["status"] == "failed"
    assert run["error"]["code"] == "provider_unreachable" and "Ollama" in run["error"]["message"]
    assert run["reply"] is None  # never a fake answer


def test_automatic_tests(client, auth):
    agent_id = create_mock_agent(client, auth)
    client.post(f"/api/agents/{agent_id}/tests", headers=auth,
                json={"input_text": "What are your hours?", "assertion": "contains", "expected": "hours"})
    client.post(f"/api/agents/{agent_id}/tests", headers=auth,
                json={"input_text": "hi", "assertion": "max_length", "expected": "5"})
    res = client.post(f"/api/agents/{agent_id}/tests/run", headers=auth).json()
    assert res["total"] == 2 and res["passed"] == 1


def test_password_reset_flow(client):
    signup(client, "c@example.com", "oldpassword")
    tok = client.post("/api/auth/forgot", json={"email": "c@example.com"}).json()["dev_reset_token"]
    assert client.post("/api/auth/reset", json={"token": tok, "password": "newpassword"}).status_code == 200
    assert client.post("/api/auth/reset", json={"token": tok, "password": "again12345"}).status_code == 400
    assert client.post("/api/auth/login", json={"email": "c@example.com", "password": "newpassword"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "c@example.com", "password": "oldpassword"}).status_code == 401


def test_dashboard_uses_real_records(client, auth):
    d = client.get("/api/dashboard", headers=auth).json()
    assert d["totals"]["agents"] == 0 and d["recent_activity"] == []
    agent_id = create_mock_agent(client, auth)
    client.post(f"/api/agents/{agent_id}/run", json={"message": "hi"}, headers=auth)
    d = client.get("/api/dashboard", headers=auth).json()
    assert d["totals"]["agents"] == 1 and d["totals"]["executions"] == 1
    a = client.get(f"/api/analytics?agent_id={agent_id}", headers=auth).json()
    assert a["totals"]["succeeded"] == 1


def test_providers_report_honest_status(client):
    provs = {p["id"]: p for p in client.get("/api/providers").json()}
    assert provs["ollama"]["available"] is False
    assert provs["openai"]["implemented"] is False
    assert provs["quotes"]["is_generative_ai"] is False
