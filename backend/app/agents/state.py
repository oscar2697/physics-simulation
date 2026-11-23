"""Shared state schemas for the agent graph and the API."""

from typing import Any, TypedDict

from pydantic import BaseModel, Field


class SceneState(BaseModel):
    """Live 3D scene state sent by the frontend."""

    active_section: str | None = Field(
        default=None,
        description="ID of the document section currently being read",
    )
    active_cue: dict[str, str] | None = Field(
        default=None,
        description="Current scene cue: title, note, assumptions and demo ID",
    )
    visible_page: int | None = Field(default=None, ge=1)
    total_pages: int | None = Field(default=None, ge=1)
    scroll_progress: float | None = Field(default=None, ge=0.0, le=1.0)
    energy_level_n: int | None = Field(default=None, ge=1, le=5, description="Bohr n of the orbiting electron")
    electron_position: list[float] | None = Field(default=None, description="[x, y, z]")
    atom_params: dict[str, Any] | None = Field(
        default=None,
        description="Free-form atom parameters (electron count, show_gluons, ...)",
    )


class TutorRequest(BaseModel):
    """Request payload for the AI tutor."""

    query: str = Field(min_length=1)
    scene_state: SceneState = Field(default_factory=SceneState)
    document_context: str | None = Field(
        default=None,
        description="Text extracted from the section the user is reading",
    )
    session_id: str | None = None


class PhysicsResult(BaseModel):
    """Deterministic physics computations attached to a tutor response."""

    energy_level_ev: float | None = None
    orbital_radius_angstrom: float | None = None
    transition_wavelength_nm: float | None = None
    transition_energy_ev: float | None = None
    extra: dict[str, Any] | None = None


class SceneAdjustment(BaseModel):
    """A suggested scene adjustment emitted back to the R3F canvas."""

    target: str = Field(description="Scene parameter to adjust, e.g. 'energy_level_n'")
    value: Any = Field(description="New value for the parameter")
    reason: str | None = None


class TutorResponse(BaseModel):
    """Non-streamed tutor response (also the final SSE payload)."""

    answer: str
    physics: PhysicsResult | None = None
    adjustments: list[SceneAdjustment] = []
    model_id: str | None = None


class AgentState(TypedDict, total=False):
    """LangGraph state flowing through the nodes."""

    request: TutorRequest
    scene_state: SceneState
    document_context: str
    physics_result: PhysicsResult
    tutor_response: TutorResponse
    messages: list[Any]
