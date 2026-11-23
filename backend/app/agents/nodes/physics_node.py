"""Node 1: physics evaluation — deterministic backend validation."""

from app.agents.state import AgentState, PhysicsResult
from app.physics_engine import atomic_models


def parse_and_compute(state: AgentState) -> AgentState:
    """Compute Bohr-model quantities for the current scene state."""
    scene = state.get("scene_state")
    result = PhysicsResult()

    if scene is not None:
        atom_params = scene.atom_params or {}
        active_demo = atom_params.get("demo", "bohr")
        n = scene.energy_level_n
        if active_demo == "bohr" and n is not None:
            result.energy_level_ev = atomic_models.energy_level_ev(n)
            result.orbital_radius_angstrom = atomic_models.orbital_radius_angstrom(n)

        transition = atom_params.get("pending_transition") or atom_params.get("pendingTransition")
        if active_demo == "bohr" and isinstance(transition, dict):
            n_i = transition.get("from")
            n_f = transition.get("to")
            if isinstance(n_i, int) and isinstance(n_f, int) and 5 >= n_i > n_f > 0:
                result.transition_wavelength_nm = atomic_models.transition_wavelength_nm(n_i, n_f)
                result.transition_energy_ev = atomic_models.transition_energy_ev(n_i, n_f)

    return {**state, "physics_result": result}
