export type DemoId = "bohr" | "atoms-box" | "field" | "orbit" | "oscillator" | "engine";

export interface EngineParticleSpec {
  p: [number, number];
  v?: [number, number];
  label?: string;
  kind?: "scalar" | "fermion" | "boson";
}

export interface EngineSceneSpec {
  mode?: "replace" | "extend";
  surface: { expr: string; range?: number; z?: number };
  particles: EngineParticleSpec[];
  interactions?: { from: string; to: string; label?: string }[];
  sim?: { damping?: number; speed?: number };
}

export interface CueParams {
  showNucleus?: boolean;
  showElectron?: boolean;
  showEnergyRings?: boolean;
  showElectronCloud?: boolean;
  showGluons?: boolean;
  showBosons?: boolean;
  energyLevelN?: number;
  pendingTransition?: { from: number; to: number } | null;
  phase?: "gas" | "liquid";
  atomCount?: number;
  temperature?: number;
  escaping?: boolean;
  fieldMode?: "wave" | "mexican-hat";
  fieldAmplitude?: number;
  fieldFrequency?: number;
  fieldCoupling?: number;
  orbitMassRatio?: number;
  orbitEccentricity?: number;
  orbitSpeed?: number;
  oscGravity?: number;
  oscLength?: number;
  oscDamping?: number;
  oscDriven?: boolean;
  scene?: EngineSceneSpec;
}

export interface Cue {
  id: string;
  demo: DemoId;
  at: { page?: number; keywords?: string[] };
  title: string;
  note: string;
  assumptions?: string;
  params: CueParams;
}

export interface ResolvedCue extends Cue {
  pinnedPage: number | null;
}

export type CueMapKind = "authored" | "llm";

export interface CueMap {
  id: string;
  label: string;
  kind: CueMapKind;
  cues: Cue[];
}

export interface InterpretedCuePayload {
  page: number;
  demo: DemoId;
  title: string;
  note: string;
  assumptions: string;
  params: Record<string, unknown>;
}

export interface SceneStatePayload {
  active_section: string | null;
  active_cue: { title: string; note: string; assumptions: string; demo: DemoId } | null;
  visible_page: number | null;
  total_pages: number | null;
  scroll_progress: number | null;
  energy_level_n: number | null;
  electron_position: [number, number, number] | null;
  atom_params: Record<string, unknown>;
}

export interface PhysicsResult {
  energy_level_ev?: number | null;
  orbital_radius_angstrom?: number | null;
  transition_wavelength_nm?: number | null;
  transition_energy_ev?: number | null;
  extra?: Record<string, unknown> | null;
}

export interface SceneAdjustment {
  target: string;
  value: unknown;
  reason?: string | null;
}

export interface TutorRequestPayload {
  query: string;
  scene_state: SceneStatePayload;
  document_context?: string | null;
  session_id?: string | null;
}

export interface TutorFinalPayload {
  answer: string;
  physics: PhysicsResult | null;
  adjustments: SceneAdjustment[];
  model_id?: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  physics?: PhysicsResult | null;
  adjustments?: SceneAdjustment[] | null;
  streaming?: boolean;
}

export interface DocumentInfo {
  filename: string;
  size_bytes: number;
}

export const BOHR_CONSTANTS = {
  RYDBERG_EV: 13.605693,
  BOHR_RADIUS_ANGSTROM: 0.529177,
} as const;

export function energyForLevelEv(n: number): number {
  return -BOHR_CONSTANTS.RYDBERG_EV / (n * n);
}

export function radiusForLevelAngstrom(n: number): number {
  return n * n * BOHR_CONSTANTS.BOHR_RADIUS_ANGSTROM;
}
