"""Tests for generative scene specs (no LLM calls)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.llm.interpret import _coerce_cue
from app.llm.scene import SceneSpec, coerce_scene


def test_coerce_scene_valid_mexican_hat():
    scene = coerce_scene(
        {
            "surface": {"expr": "2*(x^2+y^2-1)^2", "range": 2.2, "z": 0.16},
            "particles": [{"p": [0.2, 0.1], "v": [0, 0]}],
            "sim": {"damping": 0.02, "speed": 1.0},
        }
    )
    assert scene is not None
    assert scene["surface"]["expr"] == "2*(x^2+y^2-1)^2"
    assert scene["particles"][0]["p"] == [0.2, 0.1]


def test_coerce_scene_rejects_missing_surface():
    assert coerce_scene({"particles": [{"p": [0, 0]}]}) is None


def test_coerce_scene_rejects_empty_particles():
    assert coerce_scene({"surface": {"expr": "x^2+y^2"}, "particles": []}) is None


def test_coerce_scene_rejects_non_dict():
    assert coerce_scene("x^2+y^2") is None
    assert coerce_scene(None) is None


def test_coerce_scene_clamps_out_of_range():
    scene = coerce_scene(
        {"surface": {"expr": "x+y", "range": 99, "z": 99}, "particles": [{"p": [0, 0]}]}
    )
    assert scene is not None
    assert scene["surface"]["range"] == 10.0
    assert scene["surface"]["z"] == 2.0


def test_normalize_repairs_shape_slips():
    scene = coerce_scene(
        {
            "surface": {"expr": "(x²+y²)² − 2*(x²+y²)", "range": "2.2"},
            "particles": [
                {"p": ["0.2", "0.1", 999], "v": [0]},
                {"p": "oops"},
                {"p": [1, 1], "v": ["0.1", 0]},
            ],
            "sim": {"damping": "0.05", "speed": 99},
        }
    )
    assert scene is not None
    assert scene["surface"]["expr"] == "(x^2+y^2)^2 - 2*(x^2+y^2)"
    assert scene["particles"][0]["p"] == [0.2, 0.1]
    assert scene["particles"][0]["v"] == [0.0, 0.0]
    assert scene["particles"][1]["p"] == [1.0, 1.0]
    assert scene["particles"][1]["v"] == [0.1, 0.0]
    assert scene["sim"] == {"damping": 0.05, "speed": 3.0}


def test_coerce_cue_engine_requires_valid_scene():
    good = _coerce_cue(
        {
            "page": 5,
            "demo": "engine",
            "title": "Higgs potential",
            "note": "Ball rolls into the valley",
            "params": {
                "scene": {
                    "surface": {"expr": "2*(x^2+y^2-1)^2"},
                    "particles": [{"p": [0.2, 0.1]}],
                }
            },
        },
        max_page=13,
    )
    assert good is not None and good.demo == "engine"
    assert good.params["scene"]["surface"]["expr"] == "2*(x^2+y^2-1)^2"


def test_coerce_cue_engine_rejects_invalid_scene():
    bad = _coerce_cue(
        {
            "page": 5,
            "demo": "engine",
            "title": "Higgs potential",
            "note": "Ball rolls",
            "params": {"scene": {"surface": {"expr": ""}, "particles": []}},
        },
        max_page=13,
    )
    assert bad is None


def test_scene_spec_model_defaults():
    spec = SceneSpec.model_validate(
        {"surface": {"expr": "x^2-y^2"}, "particles": [{"p": [1, 0]}]}
    )
    assert spec.sim.damping == 0.02
    assert spec.sim.speed == 1.0
    assert spec.particles[0].v == [0.0, 0.0]
