"use client";

import { create } from "zustand";

import {
  energyForLevelEv,
  radiusForLevelAngstrom,
  type Cue,
  type CueParams,
  type DemoId,
  type EngineSceneSpec,
  type PhysicsResult,
  type ResolvedCue,
  type SceneAdjustment,
} from "@/types/physics";
import { resolveCueMap } from "@/lib/cues";

export const electronLive: { position: [number, number, number] } = { position: [0, 0, 0] };
export const boxLive: { pressure: number; avgSpeed: number } = { pressure: 0, avgSpeed: 0 };

export interface BohrParams {
  showNucleus: boolean;
  showElectron: boolean;
  showEnergyRings: boolean;
  showElectronCloud: boolean;
  showGluons: boolean;
  showBosons: boolean;
  energyLevelN: number;
  pendingTransition: { from: number; to: number } | null;
}

export interface BoxParams {
  phase: "gas" | "liquid";
  atomCount: number;
  temperature: number;
  escaping: boolean;
}

export interface FieldParams {
  mode: "wave" | "mexican-hat";
  amplitude: number;
  frequency: number;
  coupling: number;
}

export interface OrbitParams {
  massRatio: number;
  eccentricity: number;
  speed: number;
}

export interface OscillatorParams {
  gravity: number;
  length: number;
  damping: number;
  driven: boolean;
}

export type InterpretStatus = "off" | "pending" | "ready" | "error";

const BOHR_DEFAULTS: BohrParams = {
  showNucleus: true,
  showElectron: true,
  showEnergyRings: false,
  showElectronCloud: false,
  showGluons: false,
  showBosons: false,
  energyLevelN: 1,
  pendingTransition: null,
};

const BOX_DEFAULTS: BoxParams = {
  phase: "gas",
  atomCount: 60,
  temperature: 1.0,
  escaping: false,
};

const FIELD_DEFAULTS: FieldParams = {
  mode: "wave",
  amplitude: 1.5,
  frequency: 1.0,
  coupling: 1.0,
};

const ORBIT_DEFAULTS: OrbitParams = {
  massRatio: 1.0,
  eccentricity: 0.4,
  speed: 1.0,
};

const OSCILLATOR_DEFAULTS: OscillatorParams = {
  gravity: 9.8,
  length: 2.0,
  damping: 0.05,
  driven: false,
};

const DEFAULT_SCENE_ASSUMPTION =
  "No scene-level assumptions were provided; treat this as a qualitative illustration.";

function computeMetrics(n: number) {
  return { energyEv: energyForLevelEv(n), radiusAngstrom: radiusForLevelAngstrom(n) };
}

interface AppliedParams {
  currentDemo: DemoId;
  bohr: BohrParams;
  box: BoxParams;
  field: FieldParams;
  orbit: OrbitParams;
  osc: OscillatorParams;
  engineSpec: EngineSceneSpec | null;
  engineSpeed: number;
  engineDamping: number;
  metrics: { energyEv: number; radiusAngstrom: number };
  resetKey: number;
}

function isEngineScene(value: unknown): value is EngineSceneSpec {
  if (typeof value !== "object" || value === null) return false;
  const spec = value as Record<string, unknown>;
  const surface = spec.surface as Record<string, unknown> | undefined;
  return (
    typeof surface?.expr === "string" &&
    surface.expr.length > 0 &&
    Array.isArray(spec.particles) &&
    spec.particles.length > 0
  );
}

function applyCueParams(
  state: {
    currentDemo: DemoId;
    bohr: BohrParams;
    box: BoxParams;
    field: FieldParams;
    orbit: OrbitParams;
    osc: OscillatorParams;
    engineSpec: EngineSceneSpec | null;
    engineSpeed: number;
    engineDamping: number;
    resetKey: number;
  },
  params: CueParams
): AppliedParams {
  const cuesEngine = params.scene !== undefined && isEngineScene(params.scene);
  const cuesBohr =
    params.energyLevelN !== undefined ||
    params.pendingTransition !== undefined ||
    params.showNucleus !== undefined ||
    params.showElectron !== undefined ||
    params.showEnergyRings !== undefined ||
    params.showElectronCloud !== undefined ||
    params.showGluons !== undefined ||
    params.showBosons !== undefined;
  const cuesBox =
    params.phase !== undefined ||
    params.temperature !== undefined ||
    params.atomCount !== undefined ||
    params.escaping !== undefined;
  const cuesField =
    params.fieldMode !== undefined ||
    params.fieldAmplitude !== undefined ||
    params.fieldFrequency !== undefined ||
    params.fieldCoupling !== undefined;
  const cuesOrbit =
    params.orbitMassRatio !== undefined ||
    params.orbitEccentricity !== undefined ||
    params.orbitSpeed !== undefined;
  const cuesOsc =
    params.oscGravity !== undefined ||
    params.oscLength !== undefined ||
    params.oscDamping !== undefined ||
    params.oscDriven !== undefined;
  const currentDemo: DemoId = cuesEngine
    ? "engine"
    : cuesBox
      ? "atoms-box"
      : cuesField
        ? "field"
        : cuesOrbit
          ? "orbit"
          : cuesOsc
            ? "oscillator"
            : cuesBohr
              ? "bohr"
              : state.currentDemo;

  const bohr: BohrParams =
    currentDemo === "bohr" && state.currentDemo !== "bohr" ? { ...BOHR_DEFAULTS } : { ...state.bohr };
  const box: BoxParams =
    currentDemo === "atoms-box" && state.currentDemo !== "atoms-box"
      ? { ...BOX_DEFAULTS }
      : { ...state.box };
  const field: FieldParams =
    currentDemo === "field" && state.currentDemo !== "field"
      ? { ...FIELD_DEFAULTS }
      : { ...state.field };
  const orbit: OrbitParams =
    currentDemo === "orbit" && state.currentDemo !== "orbit"
      ? { ...ORBIT_DEFAULTS }
      : { ...state.orbit };
  const osc: OscillatorParams =
    currentDemo === "oscillator" && state.currentDemo !== "oscillator"
      ? { ...OSCILLATOR_DEFAULTS }
      : { ...state.osc };

  bohr.showNucleus = params.showNucleus ?? bohr.showNucleus;
  bohr.showElectron = params.showElectron ?? bohr.showElectron;
  bohr.showEnergyRings = params.showEnergyRings ?? bohr.showEnergyRings;
  bohr.showElectronCloud = params.showElectronCloud ?? bohr.showElectronCloud;
  bohr.showGluons = params.showGluons ?? bohr.showGluons;
  bohr.showBosons = params.showBosons ?? bohr.showBosons;
  bohr.energyLevelN = params.energyLevelN ?? bohr.energyLevelN;
  bohr.pendingTransition = params.pendingTransition !== undefined ? params.pendingTransition : bohr.pendingTransition;

  box.phase = params.phase ?? box.phase;
  box.atomCount = params.atomCount ?? box.atomCount;
  box.temperature = params.temperature ?? box.temperature;
  box.escaping = params.escaping ?? box.escaping;

  field.mode = params.fieldMode ?? field.mode;
  field.amplitude = params.fieldAmplitude ?? field.amplitude;
  field.frequency = params.fieldFrequency ?? field.frequency;
  field.coupling = params.fieldCoupling ?? field.coupling;

  orbit.massRatio = params.orbitMassRatio ?? orbit.massRatio;
  orbit.eccentricity = params.orbitEccentricity ?? orbit.eccentricity;
  orbit.speed = params.orbitSpeed ?? orbit.speed;

  osc.gravity = params.oscGravity ?? osc.gravity;
  osc.length = params.oscLength ?? osc.length;
  osc.damping = params.oscDamping ?? osc.damping;
  osc.driven = params.oscDriven ?? osc.driven;

  const engineSpec: EngineSceneSpec | null =
    cuesEngine && params.scene ? (params.scene as EngineSceneSpec) : state.engineSpec;
  const specChanged =
    JSON.stringify(engineSpec ?? null) !== JSON.stringify(state.engineSpec ?? null);
  const engineSpeed = params.scene?.sim?.speed ?? (specChanged ? 1 : state.engineSpeed);
  const engineDamping = params.scene?.sim?.damping ?? (specChanged ? 0.02 : state.engineDamping);

  return {
    currentDemo,
    bohr,
    box,
    field,
    orbit,
    osc,
    engineSpec,
    engineSpeed,
    engineDamping,
    metrics: computeMetrics(bohr.energyLevelN),
    resetKey:
      currentDemo !== state.currentDemo || (currentDemo === "engine" && specChanged)
        ? state.resetKey + 1
        : state.resetKey,
  };
}

interface PhysicsStore {
  documentTitle: string | null;
  documentContext: string;
  visiblePage: number | null;
  totalPages: number | null;
  scrollProgress: number | null;
  cues: ResolvedCue[];
  activeCueIndex: number | null;
  hold: boolean;
  paused: boolean;
  resetKey: number;
  userModified: boolean;
  currentDemo: DemoId;
  demoTitle: string;
  demoNote: string;
  demoAssumptions: string;
  bohr: BohrParams;
  box: BoxParams;
  field: FieldParams;
  orbit: OrbitParams;
  osc: OscillatorParams;
  engineSpec: EngineSceneSpec | null;
  engineSpeed: number;
  engineDamping: number;
  metrics: { energyEv: number; radiusAngstrom: number };
  chatOpen: boolean;
  lastPhysics: PhysicsResult | null;
  scrollToPage: { page: number; nonce: number } | null;
  interpretStatus: InterpretStatus;
  interpretLabel: string;

  setDocument: (title: string) => void;
  loadCuesFor: (filename: string) => void;
  loadAuthoredCues: (authoredCues: Cue[]) => void;
  loadLlmCues: (
    cues: {
      page: number;
      demo: DemoId;
      title: string;
      note: string;
      assumptions: string;
      params: Record<string, unknown>;
    }[]
  ) => void;
  setInterpretError: (message: string) => void;
  setInterpretProgress: (message: string) => void;
  pinCue: (id: string, page: number) => void;
  setReading: (info: {
    visiblePage?: number | null;
    totalPages?: number | null;
    scrollProgress?: number | null;
  }) => void;
  setDocumentContext: (text: string) => void;
  setBohrParam: (patch: Partial<BohrParams>) => void;
  setBoxParam: (patch: Partial<BoxParams>) => void;
  setOrbitParam: (patch: Partial<OrbitParams>) => void;
  setOscParam: (patch: Partial<OscillatorParams>) => void;
  setFieldParam: (patch: Partial<FieldParams>) => void;
  setEngineRuntime: (patch: { speed?: number; damping?: number }) => void;
  requestTransition: (from: number, to: number) => void;
  restoreCue: () => void;
  toggleHold: () => void;
  togglePause: () => void;
  requestRestart: () => void;
  setChatOpen: (open: boolean) => void;
  requestScrollToPage: (page: number) => void;
  jumpToCue: (direction: 1 | -1) => void;
  setLastPhysics: (physics: PhysicsResult | null) => void;
  applyTutorAdjustment: (adjustment: SceneAdjustment) => void;
  _syncActiveCue: (force?: boolean) => void;
}

export const usePhysicsStore = create<PhysicsStore>((set, get) => ({
  documentTitle: null,
  documentContext: "",
  visiblePage: null,
  totalPages: null,
  scrollProgress: null,
  cues: [],
  activeCueIndex: null,
  hold: false,
  paused: false,
  resetKey: 0,
  userModified: false,
  currentDemo: "bohr",
  demoTitle: "Interactive demo",
  demoNote: "Load a PDF to drive the demo from the text you are reading.",
  demoAssumptions: DEFAULT_SCENE_ASSUMPTION,
  bohr: { ...BOHR_DEFAULTS },
  box: { ...BOX_DEFAULTS },
  field: { ...FIELD_DEFAULTS },
  orbit: { ...ORBIT_DEFAULTS },
  osc: { ...OSCILLATOR_DEFAULTS },
  engineSpec: null,
  engineSpeed: 1,
  engineDamping: 0.02,
  metrics: computeMetrics(1),
  chatOpen: true,
  lastPhysics: null,
  scrollToPage: null,
  interpretStatus: "off",
  interpretLabel: "",

  setDocument: (title) =>
    set({
      documentTitle: title,
      documentContext: "",
      cues: [],
      activeCueIndex: null,
      demoAssumptions: DEFAULT_SCENE_ASSUMPTION,
      currentDemo: "bohr",
      demoTitle: "Loading document…",
      demoNote: "Preparing the scene points for this paper.",
      engineSpec: null,
      engineSpeed: 1,
      engineDamping: 0.02,
      bohr: { ...BOHR_DEFAULTS },
      box: { ...BOX_DEFAULTS },
      field: { ...FIELD_DEFAULTS },
      orbit: { ...ORBIT_DEFAULTS },
      osc: { ...OSCILLATOR_DEFAULTS },
      metrics: computeMetrics(1),
      lastPhysics: null,
      resetKey: get().resetKey + 1,
      visiblePage: null,
      totalPages: null,
      scrollProgress: null,
      userModified: false,
      interpretStatus: "off",
      interpretLabel: "",
    }),

  loadCuesFor: (filename) => {
    const map = resolveCueMap(filename);
    if (map.kind === "llm") {
      set({
        cues: [],
        activeCueIndex: null,
        interpretStatus: "pending",
        interpretLabel: "AI is reading the paper…",
        demoTitle: "Reading the paper…",
        demoNote: "The AI tutor is scanning the text to decide what to simulate as you read.",
        demoAssumptions: "The simulation will include the model limits and assumptions reported by the interpreter.",
      });
      return;
    }
    get().loadAuthoredCues(map.cues);
  },

  loadAuthoredCues: (authoredCues) => {
    const cues: ResolvedCue[] = authoredCues.map((cue) => ({
      ...cue,
      pinnedPage: cue.at.page ?? null,
    }));
    const state = get();
    const first = cues[0];
    const base = {
      cues,
      activeCueIndex: null as number | null,
      interpretStatus: "off" as InterpretStatus,
      interpretLabel: "",
    };
    if (!first) {
      set(base);
      return;
    }
    set({
      ...base,
      ...applyCueParams(state, first.params),
      demoTitle: first.title,
      demoNote: first.note,
      demoAssumptions: first.assumptions || DEFAULT_SCENE_ASSUMPTION,
      activeCueIndex: 0,
    });
  },

  loadLlmCues: (rawCues) => {
    let previousEngineSpec: EngineSceneSpec | null = null;
    const orderedCues = [...rawCues].sort((a, b) => a.page - b.page);
    const cues: ResolvedCue[] = orderedCues.map((cue, index) => {
      const raw = cue.params as Record<string, unknown>;
      let scene = isEngineScene(raw.scene) ? (raw.scene as EngineSceneSpec) : undefined;
      if (scene?.mode === "extend" && previousEngineSpec) {
        const existingLabels = new Set(previousEngineSpec.particles.map((particle) => particle.label).filter(Boolean));
        const additions = scene.particles.filter((particle) => !particle.label || !existingLabels.has(particle.label));
        const interactions = [
          ...(previousEngineSpec.interactions ?? []),
          ...(scene.interactions ?? []),
        ];
        const uniqueInteractions = interactions.filter((link, index) => {
          const key = `${link.from}:${link.to}:${link.label ?? ""}`;
          return interactions.findIndex((item) => `${item.from}:${item.to}:${item.label ?? ""}` === key) === index;
        });
        scene = {
          ...scene,
          mode: "replace",
          particles: [...previousEngineSpec.particles, ...additions].slice(0, 8),
          interactions: uniqueInteractions.slice(0, 16),
        };
      } else if (scene) {
        scene = { ...scene, mode: "replace" };
      }
      if (scene) {
        const labels = new Set(scene.particles.map((particle) => particle.label).filter(Boolean));
        scene.interactions = (scene.interactions ?? []).filter(
          (interaction) => labels.has(interaction.from) && labels.has(interaction.to)
        );
      }
      previousEngineSpec = scene ?? null;
      const flattened: CueParams = {
        ...raw,
        ...(scene ? { scene } : {}),
        fieldMode: raw.mode as CueParams["fieldMode"],
        fieldAmplitude: raw.amplitude as CueParams["fieldAmplitude"],
        fieldFrequency: raw.frequency as CueParams["fieldFrequency"],
        fieldCoupling: raw.coupling as CueParams["fieldCoupling"],
        orbitMassRatio: raw.massRatio as CueParams["orbitMassRatio"],
        orbitEccentricity: raw.eccentricity as CueParams["orbitEccentricity"],
        orbitSpeed: raw.speed as CueParams["orbitSpeed"],
        oscGravity: raw.gravity as CueParams["oscGravity"],
        oscLength: raw.length as CueParams["oscLength"],
        oscDamping: raw.damping as CueParams["oscDamping"],
        oscDriven: raw.driven as CueParams["oscDriven"],
      };
      return {
        id: `llm-${index}-${cue.page}`,
        demo: cue.demo,
        at: {},
        title: cue.title,
        note: cue.note,
        assumptions: cue.assumptions || DEFAULT_SCENE_ASSUMPTION,
        params: flattened,
        pinnedPage: cue.page,
      };
    });
    const first = cues[0];
    const base = {
      cues,
      activeCueIndex: null as number | null,
      interpretStatus: "ready" as InterpretStatus,
      interpretLabel: `${cues.length} demo point${cues.length === 1 ? "" : "s"} from AI`,
    };
    if (!first) {
      set({ ...base, interpretStatus: "error", interpretLabel: "The AI could not map this paper" });
      return;
    }
    set((s) => ({
      ...base,
      ...applyCueParams({ ...s, ...base }, first.params),
      demoTitle: first.title,
      demoNote: first.note,
      demoAssumptions: first.assumptions || DEFAULT_SCENE_ASSUMPTION,
      activeCueIndex: 0,
    }));
    get()._syncActiveCue(true);
  },

  setInterpretError: (message) =>
    set({
      interpretStatus: "error",
      interpretLabel: message,
    }),

  setInterpretProgress: (message) =>
    set((state) =>
      state.interpretStatus === "pending"
        ? { interpretLabel: message }
        : { interpretStatus: "pending" as InterpretStatus, interpretLabel: message }
    ),

  setFieldParam: (patch) =>
    set((state) => ({
      field: { ...state.field, ...patch },
      userModified: true,
    })),

  setEngineRuntime: (patch) =>
    set((state) => ({
      engineSpeed: patch.speed ?? state.engineSpeed,
      engineDamping: patch.damping ?? state.engineDamping,
      userModified: true,
    })),

  setOrbitParam: (patch) =>
    set((state) => ({
      orbit: { ...state.orbit, ...patch },
      userModified: true,
    })),

  setOscParam: (patch) =>
    set((state) => ({
      osc: { ...state.osc, ...patch },
      userModified: true,
    })),

  pinCue: (id, page) => {
    set((state) => {
      const cue = state.cues.find((c) => c.id === id);
      if (!cue || cue.pinnedPage !== null) return state;
      const cues = state.cues.map((c) => (c.id === id ? { ...c, pinnedPage: page } : c));
      return { cues };
    });
    get()._syncActiveCue();
  },

  setReading: (info) => {
    set((state) => ({
      visiblePage: info.visiblePage !== undefined ? info.visiblePage : state.visiblePage,
      totalPages: info.totalPages !== undefined ? info.totalPages : state.totalPages,
      scrollProgress: info.scrollProgress !== undefined ? info.scrollProgress : state.scrollProgress,
    }));
    get()._syncActiveCue();
  },

  setDocumentContext: (text) => set({ documentContext: text }),

  setBohrParam: (patch) => {
    set((state) => ({
      bohr: { ...state.bohr, ...patch },
      userModified: true,
      metrics: patch.energyLevelN !== undefined ? computeMetrics(patch.energyLevelN) : state.metrics,
    }));
  },

  setBoxParam: (patch) =>
    set((state) => ({
      box: { ...state.box, ...patch },
      userModified: true,
    })),

  requestTransition: (from, to) => {
    const fromN = Math.max(1, Math.min(5, Math.round(from)));
    const toN = Math.max(1, Math.min(5, Math.round(to)));
    if (fromN === toN) return;
    set({
      userModified: true,
      bohr: { ...get().bohr, energyLevelN: toN, pendingTransition: { from: fromN, to: toN } },
      metrics: computeMetrics(toN),
    });
  },

  restoreCue: () => {
    const state = get();
    if (state.activeCueIndex === null) return;
    const cue = state.cues[state.activeCueIndex];
    if (!cue) return;
    set((s) => ({
      ...applyCueParams(s, cue.params),
      demoTitle: cue.title,
      demoNote: cue.note,
      demoAssumptions: cue.assumptions || DEFAULT_SCENE_ASSUMPTION,
      userModified: false,
    }));
  },

  toggleHold: () => {
    const hold = !get().hold;
    set({ hold });
    if (!hold) get()._syncActiveCue(true);
  },

  togglePause: () => set((state) => ({ paused: !state.paused })),

  requestRestart: () => set((state) => ({ resetKey: state.resetKey + 1, paused: false })),

  setChatOpen: (open) => set({ chatOpen: open }),

  requestScrollToPage: (page) =>
    set((state) => ({ scrollToPage: { page, nonce: (state.scrollToPage?.nonce ?? 0) + 1 } })),

  jumpToCue: (direction) => {
    const state = get();
    const pinned = state.cues
      .map((cue, index) => ({ cue, index }))
      .filter((entry) => entry.cue.pinnedPage !== null);
    if (pinned.length === 0) return;
    const current = pinned.findIndex((entry) => entry.index === state.activeCueIndex);
    const target =
      current === -1
        ? direction === 1
          ? 0
          : pinned.length - 1
        : Math.min(pinned.length - 1, Math.max(0, current + direction));
    const entry = pinned[target];
    if (entry && entry.cue.pinnedPage !== null) {
      get().requestScrollToPage(entry.cue.pinnedPage);
    }
  },

  setLastPhysics: (physics) => set({ lastPhysics: physics }),

  applyTutorAdjustment: (adjustment) => {
    const { target, value } = adjustment;
    const state = get();
    if (target === "energy_level_n") {
      if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) return;
      set({
        currentDemo: "bohr",
        bohr: { ...state.bohr, energyLevelN: value },
        metrics: computeMetrics(value),
        resetKey: state.currentDemo === "bohr" ? state.resetKey : state.resetKey + 1,
        demoTitle: "Tutor suggestion applied",
        demoNote: adjustment.reason ?? `The tutor set the electron to energy level ${value}.`,
        demoAssumptions: "Bohr hydrogen model; the displayed level and values use its idealized assumptions.",
        userModified: true,
      });
      return;
    }
    if (["show_gluons", "show_bosons", "show_electron_cloud"].includes(target)) {
      if (typeof value !== "boolean") return;
      const patch = target === "show_gluons"
        ? { showGluons: value }
        : target === "show_bosons"
          ? { showBosons: value }
          : { showElectronCloud: value };
      set({
        currentDemo: "bohr",
        bohr: { ...state.bohr, ...patch },
        resetKey: state.currentDemo === "bohr" ? state.resetKey : state.resetKey + 1,
        demoTitle: "Tutor suggestion applied",
        demoNote: adjustment.reason ?? "The tutor updated the Bohr atom display.",
        demoAssumptions: "Bohr atom illustration; added particle markers do not model their full interactions.",
        userModified: true,
      });
    }
  },

  _syncActiveCue: (force = false) => {
    const state = get();
    if (state.hold && !force) return;
    const page = state.visiblePage;
    if (page === null || state.cues.length === 0) return;
    let activeIndex: number | null = null;
    state.cues.forEach((cue, index) => {
      if (cue.pinnedPage !== null && cue.pinnedPage <= page) activeIndex = index;
    });
    if (activeIndex === state.activeCueIndex) return;
    const cue = activeIndex !== null ? state.cues[activeIndex] : null;
    if (!cue) {
      set({ activeCueIndex: activeIndex });
      return;
    }
    set((s) => ({
      ...applyCueParams(s, cue.params),
      activeCueIndex: activeIndex,
      demoTitle: cue.title,
      demoNote: cue.note,
      demoAssumptions: cue.assumptions || DEFAULT_SCENE_ASSUMPTION,
    }));
  },
}));
