import type { Cue, CueMap } from "@/types/physics";

const BOHR_QUANTUM_CUES: Cue[] = [
  {
    id: "nucleus",
    demo: "bohr",
    at: { keywords: ["nucleus", "proton", "neutron"] },
    title: "The nucleus",
    note: "At the center of the atom sits a tiny, dense nucleus of protons and neutrons — it holds nearly all of the mass.",
    params: { showNucleus: true, showElectron: false, showEnergyRings: false },
  },
  {
    id: "electrons",
    demo: "bohr",
    at: { keywords: ["electron", "orbit", "revolve"] },
    title: "Electrons orbit the nucleus",
    note: "Electrons swarm around the nucleus, held by electric attraction — like a planet, but with quantum rules.",
    params: { showNucleus: true, showElectron: true, showEnergyRings: false, energyLevelN: 1 },
  },
  {
    id: "energy-levels",
    demo: "bohr",
    at: { keywords: ["energy level", "energy state", "discrete", "stationary state", "quantized", "13.6"] },
    title: "Discrete energy levels",
    note: "The electron can only occupy certain stationary states: E_n = -13.6 eV / n², at radii r_n = n² a₀.",
    params: { showNucleus: true, showElectron: true, showEnergyRings: true, energyLevelN: 2 },
  },
  {
    id: "transitions",
    demo: "bohr",
    at: { keywords: ["transition", "photon", "emitted", "jump", "spectral", "656"] },
    title: "Transitions and photon emission",
    note: "When the electron falls to a lower level, it emits a photon carrying exactly the energy difference. Watch the 3→2 jump.",
    params: {
      showNucleus: true,
      showElectron: true,
      showEnergyRings: true,
      energyLevelN: 3,
      pendingTransition: { from: 3, to: 2 },
    },
  },
  {
    id: "quantum-cloud",
    demo: "bohr",
    at: { keywords: ["probability", "wavefunction", "wave function", "cloud", "amplitude"] },
    title: "The probability cloud",
    note: "Quantum mechanics replaces the orbit with |ψ|²: a diffuse probability cloud rather than a planetary path.",
    params: { showNucleus: true, showElectron: true, showEnergyRings: true, showElectronCloud: true },
  },
  {
    id: "field-wave",
    demo: "field",
    at: { keywords: ["field", "wave equation", "excitation", "propagation"] },
    title: "Fields and their waves",
    note: "A field assigns a value to every point of space; its ripples travel as waves — the language of modern physics.",
    params: { fieldMode: "wave", fieldAmplitude: 1.5, fieldFrequency: 1.0, fieldCoupling: 1.0 },
  },
  {
    id: "symmetry-breaking",
    demo: "field",
    at: { keywords: ["symmetry breaking", "higgs", "mexican", "vacuum expectation", "potential v(", "spontaneous"] },
    title: "The Mexican-hat potential",
    note: "V(φ) = λ(|φ|² − v²)²: the symmetric top is unstable; the field rolls into the valley and picks a direction.",
    params: { fieldMode: "mexican-hat", fieldAmplitude: 2.0, fieldFrequency: 0.8, fieldCoupling: 1.5 },
  },
  {
    id: "particle-zoo",
    demo: "bohr",
    at: { keywords: ["gluon", "boson", "force carrier", "meson", "pion"] },
    title: "Force carriers: gluons and bosons",
    note: "The nucleus is bound by gluons; forces are the exchange of quanta. The atom grows into a busy market of particles.",
    params: { showNucleus: true, showElectron: true, showEnergyRings: true, showGluons: true, showBosons: true },
  },
];

const CH1_ATOMS_IN_MOTION_CUES: Cue[] = [
  {
    id: "ch1-hypothesis",
    demo: "atoms-box",
    at: { keywords: ["made of atoms", "atomic hypothesis", "perpetual motion", "little particles"] },
    title: "Atoms in a box",
    note: "All things are made of atoms — little particles moving in perpetual motion, attracting when a little apart, repelling when squeezed together.",
    params: { phase: "gas", atomCount: 50, temperature: 1.0, escaping: false },
  },
  {
    id: "ch1-water",
    demo: "atoms-box",
    at: { keywords: ["water", "ice", "steam"] },
    title: "Water, ice and steam",
    note: "Ice is atoms locked on a lattice, vibrating in place. Water is a jostling crowd still sticking together; steam is atoms flying apart.",
    params: { phase: "liquid", atomCount: 120, temperature: 0.35, escaping: false },
  },
  {
    id: "ch1-evaporation",
    demo: "atoms-box",
    at: { keywords: ["evaporation", "evaporates", "evaporate", "escape"] },
    title: "Evaporation",
    note: "At the surface, an atom occasionally gets knocked hard enough to break loose — that is why water evaporates.",
    params: { phase: "liquid", atomCount: 120, temperature: 0.55, escaping: true },
  },
  {
    id: "ch1-temperature",
    demo: "atoms-box",
    at: { keywords: ["temperature", "hotter", "jiggling", "thermal"] },
    title: "Temperature is jiggling",
    note: "Heat is nothing but the jiggling of atoms. Raise the temperature and the motion becomes more and more violent.",
    params: { phase: "gas", atomCount: 80, temperature: 1.8, escaping: false },
  },
  {
    id: "ch1-pressure",
    demo: "atoms-box",
    at: { keywords: ["pressure", "compress", "piston", "collisions"] },
    title: "Pressure from collisions",
    note: "The pressure of a gas is the ceaseless drumming of atoms against the walls. More atoms, or faster atoms, means more pressure.",
    params: { phase: "gas", atomCount: 160, temperature: 1.2, escaping: false },
  },
  {
    id: "ch1-salt",
    demo: "atoms-box",
    at: { keywords: ["salt", "dissolve", "sodium", "chlorine"] },
    title: "Dissolving",
    note: "Salt dissolves in water: the water atoms knock the sodium and chlorine apart and carry them off into the crowd.",
    params: { phase: "liquid", atomCount: 140, temperature: 0.5, escaping: false },
  },
  {
    id: "ch1-reactions",
    demo: "atoms-box",
    at: { keywords: ["oxygen", "carbon", "chemical reaction", "carbon dioxide"] },
    title: "Chemical reactions",
    note: "In a chemical reaction atoms rearrange: carbon grabs oxygen and releases heat — an arrangement-changing dance of atoms.",
    params: { phase: "gas", atomCount: 90, temperature: 2.2, escaping: false },
  },
  {
    id: "ch1-inside-atom",
    demo: "bohr",
    at: { keywords: ["nucleus", "protons", "neutrons", "electron"] },
    title: "Inside the atom",
    note: "Zoom in on one atom: a tiny nucleus of protons and neutrons, with electrons swarming far around it.",
    params: { showNucleus: true, showElectron: true, showEnergyRings: false, energyLevelN: 1 },
  },
];

const BOHR_QUANTUM_MAP: CueMap = {
  id: "bohr-quantum",
  label: "Atomic / quantum physics",
  kind: "authored",
  cues: BOHR_QUANTUM_CUES,
};

const CH1_MAP: CueMap = {
  id: "ch1-atoms-in-motion",
  label: "Feynman Vol. I — Atoms in Motion",
  kind: "authored",
  cues: CH1_ATOMS_IN_MOTION_CUES,
};

const LLM_MAP: CueMap = {
  id: "llm-interpret",
  label: "AI-interpreted paper",
  kind: "llm",
  cues: [],
};

export function resolveCueMap(filename: string | null): CueMap {
  const name = (filename ?? "").toLowerCase();
  if (/(ch|chapter)[\s._-]*1\b|atoms?\s+in\s+motion|vol(ume)?[\s._-]*(1|i)\b/.test(name)) {
    return CH1_MAP;
  }
  if (/bohr|quantum|hydrogen|spectr/.test(name)) {
    return BOHR_QUANTUM_MAP;
  }
  return LLM_MAP;
}

export function fallbackCueMap(): CueMap {
  return BOHR_QUANTUM_MAP;
}
