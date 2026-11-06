"use client";

import { useEffect, useState } from "react";

import { boxLive, usePhysicsStore } from "@/hooks/usePhysicsState";

export default function StageControls() {
  const currentDemo = usePhysicsStore((s) => s.currentDemo);
  const paused = usePhysicsStore((s) => s.paused);
  const userModified = usePhysicsStore((s) => s.userModified);
  const hold = usePhysicsStore((s) => s.hold);
  const bohr = usePhysicsStore((s) => s.bohr);
  const box = usePhysicsStore((s) => s.box);
  const field = usePhysicsStore((s) => s.field);
  const orbit = usePhysicsStore((s) => s.orbit);
  const osc = usePhysicsStore((s) => s.osc);
  const togglePause = usePhysicsStore((s) => s.togglePause);
  const requestRestart = usePhysicsStore((s) => s.requestRestart);
  const restoreCue = usePhysicsStore((s) => s.restoreCue);
  const setBohrParam = usePhysicsStore((s) => s.setBohrParam);
  const setBoxParam = usePhysicsStore((s) => s.setBoxParam);
  const setFieldParam = usePhysicsStore((s) => s.setFieldParam);
  const setOrbitParam = usePhysicsStore((s) => s.setOrbitParam);
  const setOscParam = usePhysicsStore((s) => s.setOscParam);
  const toggleHold = usePhysicsStore((s) => s.toggleHold);
  const jumpToCue = usePhysicsStore((s) => s.jumpToCue);

  const metrics = usePhysicsStore((s) => s.metrics);

  const [boxReadout, setBoxReadout] = useState({ pressure: 0, avgSpeed: 0 });

  useEffect(() => {
    if (currentDemo !== "atoms-box") return;
    const timer = setInterval(() => {
      setBoxReadout({ pressure: boxLive.pressure, avgSpeed: boxLive.avgSpeed });
    }, 250);
    return () => clearInterval(timer);
  }, [currentDemo]);

  return (
    <div className="stage-foot">
      <div className="transport">
        <button onClick={togglePause} title="Play / pause (Space)">
          {paused ? "Play" : "Pause"}
        </button>
        <button onClick={requestRestart} title="Restart the demo (R)">
          Restart
        </button>
        {userModified && (
          <button onClick={restoreCue} title="Undo your slider changes and return to the values for this part of the text">
            Back to text values
          </button>
        )}
        <span className="spacer" />
        <button onClick={toggleHold} aria-pressed={hold} title="Keep the current demo while you scroll (H)">
          Hold demo
        </button>
        <button onClick={() => jumpToCue(-1)} title="Previous demo point (K)">
          ↑
        </button>
        <button onClick={() => jumpToCue(1)} title="Next demo point (J)">
          ↓
        </button>
      </div>

      <div className="ctl-row">
        {currentDemo === "bohr" ? (
          <>
            <label className="ctl">
              <span className="ctl-name">Energy level n</span>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={bohr.energyLevelN}
                onChange={(e) => setBohrParam({ energyLevelN: Number(e.target.value) })}
              />
              <span className="ctl-val">{bohr.energyLevelN}</span>
            </label>
            <label className="ctl">
              <input
                type="checkbox"
                checked={bohr.showEnergyRings}
                onChange={(e) => setBohrParam({ showEnergyRings: e.target.checked })}
              />
              <span className="ctl-name">Orbits</span>
            </label>
            <label className="ctl">
              <input
                type="checkbox"
                checked={bohr.showElectronCloud}
                onChange={(e) => setBohrParam({ showElectronCloud: e.target.checked })}
              />
              <span className="ctl-name">Probability cloud</span>
            </label>
            <label className="ctl">
              <input
                type="checkbox"
                checked={bohr.showGluons}
                onChange={(e) => setBohrParam({ showGluons: e.target.checked })}
              />
              <span className="ctl-name">Gluons</span>
            </label>
            <label className="ctl">
              <input
                type="checkbox"
                checked={bohr.showBosons}
                onChange={(e) => setBohrParam({ showBosons: e.target.checked })}
              />
              <span className="ctl-name">Bosons</span>
            </label>
          </>
        ) : currentDemo === "atoms-box" ? (
          <>
            <label className="ctl">
              <span className="ctl-name">Temperature</span>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.05}
                value={box.temperature}
                onChange={(e) => setBoxParam({ temperature: Number(e.target.value) })}
              />
              <span className="ctl-val">{box.temperature.toFixed(2)}</span>
            </label>
            <label className="ctl">
              <span className="ctl-name">Atoms</span>
              <input
                type="range"
                min={20}
                max={240}
                step={5}
                value={box.atomCount}
                onChange={(e) => setBoxParam({ atomCount: Number(e.target.value) })}
              />
              <span className="ctl-val">{box.atomCount}</span>
            </label>
            <label className="ctl">
              <span className="ctl-name">Phase</span>
              <select
                value={box.phase}
                onChange={(e) => setBoxParam({ phase: e.target.value as "gas" | "liquid" })}
              >
                <option value="gas">gas</option>
                <option value="liquid">liquid</option>
              </select>
            </label>
            <label className="ctl">
              <input
                type="checkbox"
                checked={box.escaping}
                onChange={(e) => setBoxParam({ escaping: e.target.checked })}
              />
              <span className="ctl-name">Evaporation</span>
            </label>
          </>
        ) : currentDemo === "field" ? (
          <>
            <label className="ctl">
              <span className="ctl-name">Mode</span>
              <select
                value={field.mode}
                onChange={(e) => setFieldParam({ mode: e.target.value as "wave" | "mexican-hat" })}
              >
                <option value="wave">traveling wave</option>
                <option value="mexican-hat">V(φ) = λ(|φ|² − v²)²</option>
              </select>
            </label>
            <label className="ctl">
              <span className="ctl-name">{field.mode === "wave" ? "Amplitude" : "Jitter"}</span>
              <input
                type="range"
                min={0.5}
                max={4}
                step={0.1}
                value={field.amplitude}
                onChange={(e) => setFieldParam({ amplitude: Number(e.target.value) })}
              />
              <span className="ctl-val">{field.amplitude.toFixed(1)}</span>
            </label>
            <label className="ctl">
              <span className="ctl-name">Frequency</span>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.1}
                value={field.frequency}
                onChange={(e) => setFieldParam({ frequency: Number(e.target.value) })}
              />
              <span className="ctl-val">{field.frequency.toFixed(1)}</span>
            </label>
            <label className="ctl">
              <span className="ctl-name">Coupling λ</span>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.1}
                value={field.coupling}
                onChange={(e) => setFieldParam({ coupling: Number(e.target.value) })}
              />
              <span className="ctl-val">{field.coupling.toFixed(1)}</span>
            </label>
          </>
        ) : currentDemo === "orbit" ? (
          <>
            <label className="ctl">
              <span className="ctl-name">Mass ratio</span>
              <input
                type="range"
                min={0.1}
                max={10}
                step={0.1}
                value={orbit.massRatio}
                onChange={(e) => setOrbitParam({ massRatio: Number(e.target.value) })}
              />
              <span className="ctl-val">{orbit.massRatio.toFixed(1)}</span>
            </label>
            <label className="ctl">
              <span className="ctl-name">Eccentricity e</span>
              <input
                type="range"
                min={0}
                max={0.9}
                step={0.05}
                value={orbit.eccentricity}
                onChange={(e) => setOrbitParam({ eccentricity: Number(e.target.value) })}
              />
              <span className="ctl-val">{orbit.eccentricity.toFixed(2)}</span>
            </label>
            <label className="ctl">
              <span className="ctl-name">Speed</span>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.1}
                value={orbit.speed}
                onChange={(e) => setOrbitParam({ speed: Number(e.target.value) })}
              />
              <span className="ctl-val">{orbit.speed.toFixed(1)}</span>
            </label>
          </>
        ) : currentDemo === "oscillator" ? (
          <>
            <label className="ctl">
              <span className="ctl-name">Gravity g</span>
              <input
                type="range"
                min={0.5}
                max={20}
                step={0.1}
                value={osc.gravity}
                onChange={(e) => setOscParam({ gravity: Number(e.target.value) })}
              />
              <span className="ctl-val">{osc.gravity.toFixed(1)}</span>
            </label>
            <label className="ctl">
              <span className="ctl-name">Length L</span>
              <input
                type="range"
                min={0.5}
                max={4}
                step={0.1}
                value={osc.length}
                onChange={(e) => setOscParam({ length: Number(e.target.value) })}
              />
              <span className="ctl-val">{osc.length.toFixed(1)}</span>
            </label>
            <label className="ctl">
              <span className="ctl-name">Damping</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={osc.damping}
                onChange={(e) => setOscParam({ damping: Number(e.target.value) })}
              />
              <span className="ctl-val">{osc.damping.toFixed(2)}</span>
            </label>
            <label className="ctl">
              <input
                type="checkbox"
                checked={osc.driven}
                onChange={(e) => setOscParam({ driven: e.target.checked })}
              />
              <span className="ctl-name">Driven</span>
            </label>
          </>
        ) : null}
      </div>

      <div className="readout">
        {currentDemo === "bohr" ? (
          <>
            <span>
              E<sub>n</sub> = {metrics.energyEv.toFixed(2)} eV
            </span>
            <span>
              r<sub>n</sub> = {metrics.radiusAngstrom.toFixed(3)} Å
            </span>
            <span className="muted">drag the electron between orbits</span>
          </>
        ) : currentDemo === "atoms-box" ? (
          <>
            <span>wall hits ≈ {boxReadout.pressure.toFixed(0)} /s</span>
            <span>
              ⟨|v|⟩ = {boxReadout.avgSpeed.toFixed(2)}
            </span>
          </>
        ) : currentDemo === "orbit" ? (
          <span className="muted">r(θ) = a(1 − e²) / (1 + e·cos θ) — Kepler orbit</span>
        ) : currentDemo === "oscillator" ? (
          <span className="muted">
            θ̈ = −(g/L)·sin θ − b·θ̇ {osc.driven ? "+ driving" : ""} — watch the period
          </span>
        ) : (
          <span className="muted">
            {field.mode === "wave"
              ? "φ(x, t) = A · sin(kx − ωt) — a ripple of the field"
              : "balls roll from the symmetric top into the valley — symmetry breaking"}
          </span>
        )}
      </div>
    </div>
  );
}
