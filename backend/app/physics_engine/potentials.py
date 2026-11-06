"""Electrostatic potential solvers — NumPy implementations."""

import numpy as np

COULOMB_K = 8.9875517923e9  # 1/(4 pi eps0) [N m^2 / C^2]
ELEMENTARY_CHARGE = 1.602176634e-19  # [C]


def coulomb_potential_joule(r: np.ndarray, q1: float, q2: float) -> np.ndarray:
    """Pairwise Coulomb potential V(r) = k q1 q2 / r."""
    with np.errstate(divide="ignore", invalid="ignore"):
        return COULOMB_K * q1 * q2 / r


def coulomb_potential_ev(r: np.ndarray, q1_e: float = 1.0, q2_e: float = -1.0) -> np.ndarray:
    """Coulomb potential in eV for charges given in units of e.

    `r` is expected in meters.
    """
    return (
        coulomb_potential_joule(r, q1_e * ELEMENTARY_CHARGE, q2_e * ELEMENTARY_CHARGE)
        / ELEMENTARY_CHARGE
    )


def electron_proton_potential_ev(r_angstrom: np.ndarray) -> np.ndarray:
    """Electron-proton Coulomb potential in eV, `r` in angstroms."""
    return coulomb_potential_ev(r_angstrom * 1e-10, 1.0, -1.0)
