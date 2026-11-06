"""Bohr atom model — NumPy implementations.

Grounded in The Feynman Lectures on Physics (Vol. III, Ch. 2 / Vol. I, Ch. 38).
Real-time equivalents run in the browser; these routines are the backend
"heavy calculation" validation path.
"""

import numpy as np

# Physical constants (SI)
A0 = 5.29177210903e-11  # Bohr radius [m]
RYDBERG_H = 1.09677580e7  # Rydberg constant for hydrogen [m^-1]
RYDBERG_EV = 13.605693122994  # Rydberg energy [eV]
SPEED_OF_LIGHT = 2.99792458e8  # [m/s]
PLANCK_EV_S = 4.135667696e-15  # Planck constant [eV*s]


def energy_level_ev(n: int) -> float:
    """Bohr energy level E_n = -13.606 eV / n^2 (hydrogen)."""
    if n < 1:
        raise ValueError("Principal quantum number n must be >= 1")
    return -RYDBERG_EV / float(n**2)


def orbital_radius_m(n: int) -> float:
    """Bohr orbital radius r_n = n^2 * a0."""
    if n < 1:
        raise ValueError("Principal quantum number n must be >= 1")
    return float(n**2) * A0


def orbital_radius_angstrom(n: int) -> float:
    """Bohr orbital radius in angstroms."""
    return orbital_radius_m(n) * 1e10


def transition_wavelength_nm(n_initial: int, n_final: int) -> float:
    """Wavelength of a photon emitted in a transition n_i -> n_f.

    1/lambda = R_H * (1/n_f^2 - 1/n_i^2)
    """
    if n_initial < 1 or n_final < 1:
        raise ValueError("Quantum numbers must be >= 1")
    if n_initial <= n_final:
        raise ValueError("n_initial must be greater than n_final (emission)")
    inv_lambda = RYDBERG_H * (1.0 / n_final**2 - 1.0 / n_initial**2)
    return (1.0 / inv_lambda) * 1e9


def transition_energy_ev(n_initial: int, n_final: int) -> float:
    """Photon energy for a transition n_i -> n_f (positive for emission)."""
    return energy_level_ev(n_final) - energy_level_ev(n_initial)


def electron_speed_m_per_s(n: int, z: int = 1) -> float:
    """Bohr electron speed v_n = z * alpha * c / n."""
    alpha = 1.0 / 137.035999084
    if n < 1:
        raise ValueError("Principal quantum number n must be >= 1")
    return z * alpha * SPEED_OF_LIGHT / float(n)


def energy_spectrum(n_max: int = 6) -> dict[str, list[float]]:
    """Energy levels and radii for n = 1..n_max."""
    n_values = np.arange(1, n_max + 1)
    return {
        "n": [int(n) for n in n_values],
        "energy_ev": [energy_level_ev(int(n)) for n in n_values],
        "radius_angstrom": [orbital_radius_angstrom(int(n)) for n in n_values],
    }
