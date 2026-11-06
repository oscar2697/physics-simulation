"""Node 2 & 3: LLM tutor synthesis + payload emission."""

import json
import re

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents.state import AgentState, SceneAdjustment, TutorResponse
from app.llm.provider import get_llm

SYSTEM_PROMPT = """You are an AI Physics Tutor embedded in an interactive platform that pairs
The Feynman Lectures on Physics with a live 3D Bohr atom simulation.

You receive:
- The section of the lecture the user is currently reading (document context).
- The live 3D scene state (energy level, orbital radius, atom parameters).
- Optional deterministic physics calculations computed by the backend.

Your rules:
1. Explain concepts concisely and pedagogically, in the spirit of Feynman: intuitive first, math second.
2. Ground your answer in the document context when it is provided. Quote or reference it when helpful.
3. Use the physics calculation results when present (do not contradict them).
4. Keep answers under 250 words unless the user asks for depth.
5. If the current 3D scene state does not match the concept being discussed, you may suggest a scene
   adjustment in a final JSON block.

Response format:
- Plain prose answer (the explanation).
- Optionally, ONE final fenced block with a JSON object:
```json
{"adjustments": [{"target": "energy_level_n", "value": 3, "reason": "..."}]}
```
Valid adjustment targets: energy_level_n (int >= 1), show_gluons (bool), show_bosons (bool),
show_electron_cloud (bool).
"""


def _extract_adjustments(text: str) -> tuple[str, list[SceneAdjustment]]:
    """Split the LLM output into (answer, adjustments)."""
    match = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    if not match:
        return text.strip(), []

    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError:
        return text.strip(), []

    adjustments: list[SceneAdjustment] = []
    for item in payload.get("adjustments", []):
        if isinstance(item, dict) and "target" in item:
            adjustments.append(
                SceneAdjustment(
                    target=str(item["target"]),
                    value=item.get("value"),
                    reason=item.get("reason"),
                )
            )
    answer = (text[: match.start()] + text[match.end() :]).strip()
    return answer, adjustments


def generate_explanation(state: AgentState) -> AgentState:
    """Node 2: synthesize a context-aware explanation with the LLM."""
    request = state["request"]
    physics = state.get("physics_result")
    scene = state.get("scene_state")

    context_parts: list[str] = []
    if request.document_context:
        context_parts.append(f"Document section the user is reading:\n\"\"\"\n{request.document_context[:4000]}\n\"\"\"")
    if scene is not None:
        scene_summary = scene.model_dump(exclude_none=True)
        context_parts.append(f"Live 3D scene state: {json.dumps(scene_summary)}")
    if physics is not None:
        physics_summary = physics.model_dump(exclude_none=True)
        context_parts.append(f"Backend physics calculations: {json.dumps(physics_summary)}")

    content = "\n\n".join(context_parts) if context_parts else ""
    user_message = request.query
    if content:
        user_message = f"{content}\n\nUser question: {request.query}"

    llm = get_llm()
    response = llm.invoke(
        [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=user_message)]
    )

    answer, adjustments = _extract_adjustments(response.text)
    from app.core.config import get_settings

    tutor_response = TutorResponse(
        answer=answer,
        physics=physics,
        adjustments=adjustments,
        model_id=get_settings().nim_model_id,
    )
    return {**state, "tutor_response": tutor_response}


def emit_payload(state: AgentState) -> AgentState:
    """Node 3: final node — payload passthrough (streaming handled by the route)."""
    return state
