"""Tests for parallel analysis and retry hardening (no LLM calls)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app.llm.interpret as interp
from app.llm.interpret import Concept, InterpretResult, interpret_document


def test_interpret_document_parallel_order(monkeypatch):
    seen: list[int] = []

    def fake_analyze(title, chunk, total):
        seen.append(chunk[0]["page"])
        return [Concept(page=chunk[0]["page"], name=f"c{chunk[0]['page']}", note="n", importance=3)]

    def fake_design(title, concepts, total):
        return []

    monkeypatch.setattr(interp, "_analyze_chunk", fake_analyze)
    monkeypatch.setattr(interp, "_design_cues", fake_design)
    pages = [{"page": i + 1, "text": f"text {i + 1}"} for i in range(9)]
    progress: list[tuple] = []
    result = interpret_document("t.pdf", pages, on_progress=lambda p, d, t: progress.append((p, d, t)))
    assert isinstance(result, InterpretResult)
    assert result.cues == []
    # 9 pages, CHUNK_SIZE 4 -> 3 chunks; all chunks ran exactly once
    assert sorted(seen) == [1, 5, 9]
    assert ("analyzing", 0, 3) in progress
    assert ("analyzing", 3, 3) in progress


def test_interpret_document_designer_retry(monkeypatch):
    calls: list[int] = []

    def fake_analyze(title, chunk, total):
        return [Concept(page=1, name="c", note="n", importance=5)]

    def fake_design(title, concepts, total):
        calls.append(1)
        return []

    monkeypatch.setattr(interp, "_analyze_chunk", fake_analyze)
    monkeypatch.setattr(interp, "_design_cues", fake_design)
    result = interpret_document("t.pdf", [{"page": 1, "text": "hello"}])
    assert result.cues == []
    assert calls == [1]


def test_call_llm_retries_connection_error(monkeypatch):
    import time as time_mod

    attempts: list[int] = []

    class FakeConnErr(Exception):
        pass

    FakeConnErr.__name__ = "APIConnectionError"

    class FakeLLM:
        def invoke(self, prompt):
            attempts.append(1)
            if len(attempts) == 1:
                raise FakeConnErr("boom")

            class R:
                content = '{"ok": true}'

            return R()

    monkeypatch.setattr(interp.time, "sleep", lambda s: None)
    text = interp._call_llm(FakeLLM(), "hi")
    assert text == '{"ok": true}'
    assert len(attempts) == 2
