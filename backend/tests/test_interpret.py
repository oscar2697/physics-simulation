"""Unit tests for the interpret pipeline helpers (no LLM calls)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.llm import cache as interpret_cache
from app.llm.interpret import _coerce_cue, _extract_json


def test_extract_json_raw_object():
    assert _extract_json('{"cues": []}') == {"cues": []}


def test_extract_json_fenced_with_nested_objects():
    text = 'Here you go:\n```json\n{"concepts": [{"a": 1}, {"b": 2}]}\n```\nDone.'
    assert _extract_json(text) == {"concepts": [{"a": 1}, {"b": 2}]}


def test_extract_json_garbage_returns_none():
    assert _extract_json("no json here") is None
    assert _extract_json("") is None


def test_extract_json_truncated_returns_none():
    assert _extract_json('{"concepts": [{"a": 1}') is None


def test_coerce_cue_valid():
    cue = _coerce_cue(
        {"page": 3, "demo": "atoms-box", "title": "T", "note": "N",
         "params": {"temperature": 2.0}},
        max_page=13,
    )
    assert cue is not None
    assert cue.page == 3
    assert cue.params == {"temperature": 2.0}


def test_coerce_cue_clamps_page():
    cue = _coerce_cue(
        {"page": 999, "demo": "field", "title": "T", "note": "N", "params": {}},
        max_page=13,
    )
    assert cue is not None and cue.page == 13


def test_coerce_cue_rejects_bad_demo():
    assert _coerce_cue({"page": 1, "demo": "nope", "title": "T", "note": "N"}, 5) is None


def test_coerce_cue_rejects_missing_note():
    assert _coerce_cue({"page": 1, "demo": "bohr", "title": "T"}, 5) is None


def test_cache_key_stable_and_sensitive(tmp_path, monkeypatch):
    monkeypatch.setattr(interpret_cache, "CACHE_DIR", tmp_path)
    pages = [{"page": 1, "text": "hello"}]
    k1 = interpret_cache.cache_key("a.pdf", pages, "model-x")
    k2 = interpret_cache.cache_key("a.pdf", pages, "model-x")
    assert k1 == k2
    assert interpret_cache.cache_key("b.pdf", pages, "model-x") != k1
    assert interpret_cache.cache_key("a.pdf", [{"page": 1, "text": "bye"}], "model-x") != k1
    assert interpret_cache.cache_key("a.pdf", pages, "model-y") != k1


def test_cache_roundtrip(tmp_path, monkeypatch):
    monkeypatch.setattr(interpret_cache, "CACHE_DIR", tmp_path)
    payload = {"cues": [{"page": 1, "demo": "bohr", "title": "T", "note": "N", "params": {}}]}
    assert interpret_cache.load("abc") is None
    interpret_cache.save("abc", payload)
    assert interpret_cache.load("abc") == payload
