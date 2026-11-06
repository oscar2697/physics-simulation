"use client";

import { create } from "zustand";

import {
  energyForLevelEv,
  radiusForLevelAngstrom,
  type Cue,
  type CueParams,
  type DemoId,
  type PhysicsResult,
  type ResolvedCue,
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
  metrics: { energyEv: number; radiusAngstrom: number };
  resetKey: number;
}

function applyCueParams(
  state: {
    currentDemo: DemoId;
    bohr: BohrParams;
    box: BoxParams;
    field: FieldParams;
    orbit: OrbitParams;
    osc: OscillatorParams;
    resetKey: number;
  },
  params: CueParams
): AppliedParams {
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
  const currentDemo: DemoId = cuesBox
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

  return {
    currentDemo,
    bohr,
    box,
    field,
    orbit,
    osc,
    metrics: computeMetrics(bohr.energyLevelN),
    resetKey: currentDemo !== state.currentDemo ? state.resetKey + 1 : state.resetKey,
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
  bohr: BohrParams;
  box: BoxParams;
  field: FieldParams;
  orbit: OrbitParams;
  osc: OscillatorParams;
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
      params: Record<string, unknown>;
    }[]
  ) => void;
  setInterpretError: (message: string) => void;
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
  requestTransition: (from: number, to: number) => void;
  restoreCue: () => void;
  switchDemo: (demo: DemoId) => void;
  toggleHold: () => void;
  togglePause: () => void;
  requestRestart: () => void;
  setChatOpen: (open: boolean) => void;
  requestScrollToPage: (page: number) => void;
  jumpToCue: (direction: 1 | -1) => void;
  setLastPhysics: (physics: PhysicsResult | null) => void;
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
  bohr: { ...BOHR_DEFAULTS },
  box: { ...BOX_DEFAULTS },
  field: { ...FIELD_DEFAULTS },
  orbit: { ...ORBIT_DEFAULTS },
  osc: { ...OSCILLATOR_DEFAULTS },
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
      activeCueIndex: 0,
    });
  },

  loadLlmCues: (rawCues) => {
    const cues: ResolvedCue[] = rawCues.map((cue, index) => {
      const raw = cue.params as Record<string, unknown>;
      const flattened: CueParams = {
        ...raw,
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
      activeCueIndex: 0,
    }));
  },

  setInterpretError: (message) =>
    set({
      interpretStatus: "error",
      interpretLabel: message,
    }),

  setFieldParam: (patch) =>
    set((state) => ({
      field: { ...state.field, ...patch },
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
    const fromN = Math.max(1, Math.min(6, Math.round(from)));
    const toN = Math.max(1, Math.min(6, Math.round(to)));
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
      userModified: false,
    }));
  },

  switchDemo: (demo) =>
    set((state) => ({
      currentDemo: demo,
      resetKey: state.resetKey + 1,
      userModified: true,
    })),

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
    }));
  },
}));
