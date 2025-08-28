import { useMemo, useState } from "react";
import './App.css'

// Follow the Cash – New Flow (react)
// Allocation happens post‑C: split distributable cash into
// B) Invest in Assets, F) Pay Financial Markets, and Retain in Firm Cash.
// Percentages sum to 100%. Step E is removed.

// --------------------------- Types ---------------------------
type Party = "Firm" | "Investors" | "GovStake" | "Assets";

interface FlowStep {
  code: "A" | "B" | "C" | "D" | "F"; // E removed per spec
  from: Party;
  to: Party;
  amount: number; // dollars
  note: string;
}

// --------------------------- Pure calculator ---------------------------
function computeRound(
  balances: { F: number; I: number; GS: number; A: number },
  params: {
    issueAmount: number; // A – dollars from Financial markets to Firm
    opMargin: number; // C – FCF yield % of Assets this cycle
    taxStakePct: number; // D – % of positive C routed to Gov & Stakeholders
    alloc: {
      // Post‑C allocation of distributable cash (must sum to 100)
      bCapexPct: number; // -> Assets (B)
      fPayoutPct: number; // -> Financial markets (F)
      retainPct: number; // stays in Firm cash (auto remainder)
    };
  }
) {
  let { F, I, GS, A } = balances;
  const { issueAmount, opMargin, taxStakePct, alloc } = params;

  // --- A: Market → Firm cash ---
  const payA = Math.max(0, Math.min(I, issueAmount));
  I -= payA;
  F += payA;

  // --- C: Free cash flow from assets (this cycle) ---
  const opCash = A * (opMargin / 100); // can be negative
  F += opCash;

  // --- D: Taxes & Stakeholders combined, only on positive C ---
  const taxStake = Math.round((taxStakePct / 100) * Math.max(0, opCash));
  F -= taxStake;
  GS += taxStake;

  // --- Post‑C Allocation of distributable cash (B, F, Retain) ---
  const distributable = Math.max(0, F);
  const bCapex = Math.round((alloc.bCapexPct / 100) * distributable);
  const fPayout = Math.round((alloc.fPayoutPct / 100) * distributable);
  const retain = Math.max(0, distributable - bCapex - fPayout); // stays in F

  // Apply B & F flows; retained stays in F automatically
  F -= bCapex + fPayout;
  A += bCapex;
  I += fPayout;

  // Build script in the narrative order: A → C → D → (allocate) → B/F
  const script: FlowStep[] = [
    { code: "A" as const, from: "Investors" as const, to: "Firm" as const, amount: payA, note: "Issue securities" },
    { code: "C" as const, from: "Assets" as const, to: "Firm" as const, amount: opCash, note: "Free cash flow from assets (this cycle)" },
    { code: "D" as const, from: "Firm" as const, to: "GovStake" as const, amount: taxStake, note: "Taxes & other stakeholders" },
    { code: "B" as const, from: "Firm" as const, to: "Assets" as const, amount: bCapex, note: `Invest in assets (allocation ${alloc.bCapexPct}%)` },
    { code: "F" as const, from: "Firm" as const, to: "Investors" as const, amount: fPayout, note: `Pay financial markets (allocation ${alloc.fPayoutPct}%)` },
  ].filter((s) => s.amount > 0);

  return {
    script,
    end: { F, I, GS, A },
    derived: { payA, opCash, taxStake, distributable, bCapex, fPayout, retain },
  };
}

// Derive deterministic frames (balances after each step) to avoid transient display glitches
function computeFrames(
  start: { F: number; I: number; GS: number; A: number },
  script: FlowStep[]
) {
  let { F, I, GS, A } = start;
  const frames: { F: number; I: number; GS: number; A: number }[] = [];
  for (const st of script) {
    switch (st.code) {
      case "A":
        I -= st.amount;
        F += st.amount;
        break;
      case "C":
        F += st.amount; // op cash can be +/-
        break;
      case "D":
        F -= st.amount;
        GS += st.amount;
        break;
      case "B":
        F -= st.amount;
        A += st.amount;
        break;
      case "F":
        F -= st.amount;
        I += st.amount;
        break;
    }
    frames.push({ F, I, GS, A });
  }
  return frames;
}

// --------------------------- App ---------------------------
export default function App() {
  // --- Starting balances ---
  const [startFirm, setStartFirm] = useState(50);
  const [startAssets, setStartAssets] = useState(150);

  // --- Levers ---
  const [issueAmount, setIssueAmount] = useState(80); // A ($)
  const [opMargin, setOpMargin] = useState(15); // C (%) of assets
  const [taxStakePct, setTaxStakePct] = useState(25); // D (%) of positive C

  // Allocation (B, F, retain) – enforce sum=100
  const [bCapexPct, setBCapexPct] = useState(40);
  const [fPayoutPct, setFPayoutPct] = useState(40);
  const retainPct = Math.max(0, 100 - bCapexPct - fPayoutPct);

  // --- Runtime state ---
  const [round, setRound] = useState(1);
  const [mode, setMode] = useState<"simple" | "animated">("animated");

  // Balances
  const [firmCash, setFirmCash] = useState(startFirm);
  const [investorCash, setInvestorCash] = useState(500);
  const [govStakeCash, setGovStakeCash] = useState(0);
  const [assets, setAssets] = useState(startAssets);

  // Totals
  const [cumCashGen, setCumCashGen] = useState(0); // Σ max(C, 0) across rounds

  // Animation
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  const [playing, setPlaying] = useState(false);
  const [log, setLog] = useState<string[]>([
    "Adjust sliders and click Run. Watch A→C→D→(allocate)→B+F.",
  ]);

  const fmt = (n: number) => `$${Math.round(n)}`;

  function applyStarts() {
    setFirmCash(startFirm);
    setAssets(startAssets);
  }

  // ensure allocation sums to 100 in UI interactions
  function onChangeBCapex(v: number) {
    const x = clamp(v, 0, 100);
    const maxB = 100 - fPayoutPct; // leave >=0 for retain
    setBCapexPct(Math.min(x, maxB));
  }
  function onChangeFPayout(v: number) {
    const x = clamp(v, 0, 100);
    const maxF = 100 - bCapexPct;
    setFPayoutPct(Math.min(x, maxF));
  }

  // ------------------------ Run (animated) ------------------------
  function runAnimatedRound() {
    if (playing) return;

    const start = { F: firmCash, I: investorCash, GS: govStakeCash, A: assets };
    const calc = computeRound(start, {
      issueAmount,
      opMargin,
      taxStakePct,
      alloc: { bCapexPct, fPayoutPct, retainPct },
    });
    const frames = computeFrames(start, calc.script);

    setSteps(calc.script);
    setActiveIdx(-1);
    setPlaying(true);
    setLog((prev) => [`—— Round ${round} ——`, ...prev]);

    let i = -1;
    const stepMs = 1400; // smooth pacing

    const tick = () => {
      i += 1;
      if (i >= calc.script.length) {
        setPlaying(false);
        setRound((r) => r + 1);
        // snap to authoritative end state to avoid drift
        setFirmCash(calc.end.F);
        setInvestorCash(calc.end.I);
        setGovStakeCash(calc.end.GS);
        setAssets(calc.end.A);
        setCumCashGen((g) => g + Math.max(0, calc.derived.opCash));
        return;
      }
      setActiveIdx(i);
      const st = calc.script[i];
      const f = frames[i];
      setTimeout(() => {
        setFirmCash(f.F);
        setInvestorCash(f.I);
        setGovStakeCash(f.GS);
        setAssets(f.A);
        setLog((prev) => [`${st.code}: ${st.note} ${fmt(st.amount)}`, ...prev]);
      }, 300);
      setTimeout(tick, stepMs);
    };

    tick();
  }

  // ------------------------ Run (simple) ------------------------
  function runSimpleRound() {
    const calc = computeRound(
      { F: firmCash, I: investorCash, GS: govStakeCash, A: assets },
      { issueAmount, opMargin, taxStakePct, alloc: { bCapexPct, fPayoutPct, retainPct } }
    );
    setFirmCash(calc.end.F);
    setInvestorCash(calc.end.I);
    setGovStakeCash(calc.end.GS);
    setAssets(calc.end.A);
    setCumCashGen((g) => g + Math.max(0, calc.derived.opCash));
    setRound((r) => r + 1);
    setSteps(calc.script);
  }

  function resetGame() {
    setFirmCash(startFirm);
    setInvestorCash(500);
    setGovStakeCash(0);
    setAssets(startAssets);
    setRound(1);
    setSteps([]);
    setActiveIdx(-1);
    setPlaying(false);
    setCumCashGen(0);
    setLog(["Reset complete. Adjust sliders and run a new round."]); 
  }

  const testResults = useMemo(() => runSelfTests(), []);

  const systemCash = firmCash + investorCash + govStakeCash;

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-800 p-6">
      <div className="max-w-6xl mx-auto grid lg:grid-cols-3 gap-6">
        {/* Controls */}
        <div className="lg:col-span-1 bg-white rounded-2xl shadow p-5 space-y-4">
          <h1 className="text-2xl font-semibold">Follow the Cash (A→C→D→B/F)</h1>
          <p className="text-sm text-slate-600">
            C is <strong>free cash flow from assets</strong> this cycle. After D (taxes &
            stakeholders), allocate distributable cash across <strong>Invest in Assets (B)</strong>,
            <strong> Pay Financial Markets (F)</strong>, and <strong>Retain in Firm cash</strong>.
          </p>

          {/* Mode toggle */}
          <div className="inline-flex rounded-xl overflow-hidden border">
            <button
              className={`px-3 py-1 text-sm ${
                mode === "simple" ? "bg-slate-900 text-white" : "bg-white"
              }`}
              onClick={() => setMode("simple")}
            >
              Simple Output
            </button>
            <button
              className={`px-3 py-1 text-sm ${
                mode === "animated" ? "bg-slate-900 text-white" : "bg-white"
              }`}
              onClick={() => setMode("animated")}
            >
              Animated Flow
            </button>
          </div>

          {/* Start balances */}
          <div className="rounded-xl border p-3">
            <div className="text-sm font-semibold mb-1">Starting balances</div>
            <Slider
              label={`Starting Firm Cash (${fmt(startFirm)})`}
              value={startFirm}
              setValue={setStartFirm}
              min={0}
              max={300}
            />
            <Slider
              label={`Starting Assets (${fmt(startAssets)})`}
              value={startAssets}
              setValue={setStartAssets}
              min={0}
              max={500}
            />
            <button
              onClick={applyStarts}
              className="mt-2 px-3 py-1 rounded-lg bg-slate-100 border"
            >
              Apply to current
            </button>
          </div>

          {/* Policy sliders */}
          <Slider
            label={`A. New Issue (${fmt(issueAmount)})`}
            value={issueAmount}
            setValue={setIssueAmount}
            min={0}
            max={300}
          />
          <Slider
            label={`C. Asset FCF Yield ${opMargin}%`}
            value={opMargin}
            setValue={setOpMargin}
            min={-40}
            max={60}
          />
          <Slider
            label={`D. Tax & Stakeholder ${taxStakePct}%`}
            value={taxStakePct}
            setValue={setTaxStakePct}
            min={0}
            max={80}
          />

          {/* Allocation Section (post‑C) */}
          <div className="rounded-xl border p-3 space-y-2">
            <div className="text-sm font-semibold">Post‑C Allocation (must equal 100%)</div>
            <Slider
              label={`Invest in Assets (B): ${bCapexPct}%`}
              value={bCapexPct}
              setValue={onChangeBCapex}
              min={0}
              max={100}
            />
            <Slider
              label={`Pay Financial Markets (F): ${fPayoutPct}%`}
              value={fPayoutPct}
              setValue={onChangeFPayout}
              min={0}
              max={100}
            />
            <div className="text-xs text-slate-600">
              Keep in Firm Cash (auto): <span className="font-semibold">{retainPct}%</span>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            {mode === "simple" ? (
              <button
                onClick={runSimpleRound}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:opacity-90"
              >
                Run Simple Round #{round}
              </button>
            ) : (
              <button
                onClick={runAnimatedRound}
                disabled={playing}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white hover:opacity-90 disabled:opacity-50"
              >
                Run Animated Round #{round}
              </button>
            )}
            <button
              onClick={resetGame}
              className="px-4 py-2 rounded-xl bg-slate-100 border"
            >
              Reset
            </button>
          </div>

          {/* Tests */}
          <div className="mt-3 rounded-xl border p-3 bg-slate-50">
            <div className="text-sm font-semibold">Self‑tests</div>
            {testResults.map((t, i) => (
              <div
                key={i}
                className={`text-xs mt-1 ${
                  t.pass ? "text-green-700" : "text-red-700"
                }`}
              >
                • {t.pass ? "PASS" : "FAIL"} — {t.name} {t.detail ? `(${t.detail})` : ""}
              </div>
            ))}
          </div>
        </div>

        {/* Output area */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow p-5">
          {mode === "simple" ? (
            <>
              <h2 className="text-xl font-semibold">Simple Output</h2>
              <OutputTable script={steps} />
              <h3 className="mt-6 font-semibold">Balances (after round)</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <Stat title="Firm Cash" value={firmCash} />
                <Stat title="Assets (book)" value={assets} />
                <Stat title="Financial Markets (Investors) Cash" value={investorCash} />
                <Stat title="Gov & Stakeholders" value={govStakeCash} />
                <Stat title="System Cash (F+Markets+Gov)" value={systemCash} />
              </div>
              <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-2 gap-3">
                <Stat title="Cumulative cash generated (Σ max(C,0))" value={cumCashGen} />
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold">Animated Flow</h2>
              <FlowMap
                steps={steps}
                activeIdx={activeIdx}
                firm={firmCash}
                investors={investorCash}
                govstake={govStakeCash}
                assets={assets}
              />

              <h3 className="mt-6 font-semibold">Balances</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <Stat title="Firm Cash" value={firmCash} />
                <Stat title="Assets (book)" value={assets} />
                <Stat title="Financial Markets" value={investorCash} />
                <Stat title="Gov & Stakeholders" value={govStakeCash} />
                <Stat title="System Cash (F+Markets+Gov)" value={systemCash} />
              </div>

              <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-2 gap-3">
                <Stat title="Cumulative cash generated (Σ max(C,0))" value={cumCashGen} />
              </div>

              <h3 className="mt-6 font-semibold">Round Log</h3>
              <div className="h-56 overflow-auto text-sm bg-slate-50 border rounded-xl p-3 space-y-1">
                {log.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="max-w-6xl mx-auto mt-6 text-xs text-slate-500">
        Sequence: A Issue → C FCF → D Tax/Stake → allocate → B Invest in Assets → F Pay Financial Markets; remainder stays as Firm cash.
      </footer>
    </div>
  );
}

// ---------------------- Simple Output Table ----------------------
function OutputTable({ script }: { script: FlowStep[] }) {
  if (!script.length) {
    return <div className="text-sm text-slate-500">Run a round to see results.</div>;
  }
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b">
            <th className="py-2 pr-2">Step</th>
            <th className="py-2 pr-2">From → To</th>
            <th className="py-2 pr-2">Amount</th>
            <th className="py-2">Note</th>
          </tr>
        </thead>
        <tbody>
          {script.map((s, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-1 pr-2 font-medium">{s.code}</td>
              <td className="py-1 pr-2">{s.from} → {s.to}</td>
              <td className="py-1 pr-2">${Math.round(s.amount)}</td>
              <td className="py-1">{s.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------- Flow Map (SVG) ----------------------
function FlowMap({
  steps,
  activeIdx,
  firm,
  investors,
  govstake,
  assets,
}: {
  steps: FlowStep[];
  activeIdx: number;
  firm: number;
  investors: number;
  govstake: number;
  assets: number;
}) {
  const w = 1000,
    h = 580;

  // Node centers – aligned with textbook layout
  const pts = {
    Assets: { x: 240, y: 170, label: "Assets", value: assets },
    Firm: { x: 240, y: 300, label: "Firm cash", value: firm },
    Investors: { x: 840, y: 230, label: "Financial markets", value: investors },
    GovStake: { x: 560, y: 450, label: "Gov & Stakeholders", value: govstake },
  } as const;

  // Wider pills for left stack
  const pillW = { Assets: 250, Firm: 250, Investors: 190, GovStake: 190 } as const;
  const pillH = 60;

  type Port = "left" | "right" | "top" | "bottom";
  function portPoint(node: keyof typeof pts, side: Port, dy = 0) {
    const c = pts[node];
    const wmap = pillW as any;
    const halfW = (wmap[node] ?? 160) / 2;
    const halfH = pillH / 2;
    switch (side) {
      case "left":
        return { x: c.x - halfW, y: c.y + dy };
      case "right":
        return { x: c.x + halfW, y: c.y + dy };
      case "top":
        return { x: c.x, y: c.y - halfH + dy };
      case "bottom":
        return { x: c.x, y: c.y + halfH + dy };
    }
  }

  // Helper to build an orthogonal path through via points
  function orthPath(
    start: { x: number; y: number },
    vias: { x: number; y: number }[],
    end: { x: number; y: number }
  ) {
    const ptsArr = [start, ...vias, end];
    let d = `M ${ptsArr[0].x} ${ptsArr[0].y}`;
    for (let i = 1; i < ptsArr.length; i++) d += ` L ${ptsArr[i].x} ${ptsArr[i].y}`;
    return d;
  }

  // Edges simplified per sketch
  const edges: Record<
    FlowStep["code"],
    {
      from: keyof typeof pts;
      to: keyof typeof pts;
      fromPort: Port;
      toPort: Port;
      color: string;
      label: string;
      path: () => string;
    }
  > = {
    // A: Investors → Firm (top across, then down)
    A: {
      from: "Investors",
      to: "Firm",
      fromPort: "left",
      toPort: "top",
      color: "#2563eb",
      label: "A. Market → Firm cash",
      path: () => {
        const s = portPoint("Investors", "left");
        const e = portPoint("Firm", "top");
        return orthPath(s, [{ x: e.x, y: s.y }], e);
      },
    },
    // C: Assets ↓ Firm (FCF) — vertical
    C: {
      from: "Assets",
      to: "Firm",
      fromPort: "bottom",
      toPort: "top",
      color: "#10b981",
      label: "C. Assets → Cash (FCF)",
      path: () => {
        const s = portPoint("Assets", "bottom");
        const e = portPoint("Firm", "top");
        return orthPath(s, [], e);
      },
    },
    // D: Firm ↓ then → Gov/Stake
    D: {
      from: "Firm",
      to: "GovStake",
      fromPort: "bottom",
      toPort: "top",
      color: "#f59e0b",
      label: "D. Taxes & other stakeholders",
      path: () => {
        const s = portPoint("Firm", "bottom");
        const e = portPoint("GovStake", "top");
        return orthPath(s, [{ x: s.x, y: e.y }], e);
      },
    },
    // B: Firm ↑ Assets — vertical
    B: {
      from: "Firm",
      to: "Assets",
      fromPort: "top",
      toPort: "bottom",
      color: "#22c55e",
      label: "B. Invest in Assets (allocation)",
      path: () => {
        const s = portPoint("Firm", "top");
        const e = portPoint("Assets", "bottom");
        return orthPath(s, [], e);
      },
    },
    // F: Firm → Investors — straight horizontal
    F: {
      from: "Firm",
      to: "Investors",
      fromPort: "right",
      toPort: "left",
      color: "#06b6d4",
      label: "F. Pay Financial Markets",
      path: () => {
        const s = portPoint("Firm", "right");
        const e = portPoint("Investors", "left");
        return orthPath(s, [{ x: e.x, y: s.y }], e);
      },
    },
  };
  const order = ["A", "C", "D", "B", "F"] as const;

  const active = steps[activeIdx];

  const systemCash = Math.round(firm + investors + govstake);

  return (
    <div className="mt-3 rounded-xl border bg-white">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[580px]">
        <defs>
          {/* smaller arrowhead */}
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>

        {/* Top summary: system cash */}
        <text x={w / 2} y={36} textAnchor="middle" fontSize={20} fontWeight={700} fill="#0f172a">
          System cash (Firm + Markets + Gov): ${systemCash}
        </text>

        {/* Backdrop boxes */}
        <g>
          <rect x={70} y={100} width={400} height={420} rx={12} fill="#fef3c7" stroke="#f59e0b" />
          <text x={270} y={92} textAnchor="middle" fontSize={16} fontWeight={700} fill="#78350f">
            Total value of firm's assets
          </text>

          {/* Assets pill */}
          <rect x={pts.Assets.x - pillW.Assets / 2} y={pts.Assets.y - pillH / 2} width={pillW.Assets} height={pillH} rx={16} fill="#fff7ed" stroke="#fdba74" />
          <text x={pts.Assets.x} y={pts.Assets.y - 8} textAnchor="middle" fontSize={14} fill="#9a3412">Assets</text>
          <text x={pts.Assets.x} y={pts.Assets.y + 16} textAnchor="middle" fontSize={20} fontWeight={700} fill="#7c2d12">${Math.round(assets)}</text>

          {/* Firm cash pill */}
          <rect x={pts.Firm.x - pillW.Firm / 2} y={pts.Firm.y - pillH / 2} width={pillW.Firm} height={pillH} rx={16} fill="#fff7ed" stroke="#fdba74" />
          <text x={pts.Firm.x} y={pts.Firm.y - 8} textAnchor="middle" fontSize={14} fill="#9a3412">Firm cash</text>
          <text x={pts.Firm.x} y={pts.Firm.y + 16} textAnchor="middle" fontSize={20} fontWeight={700} fill="#7c2d12">${Math.round(firm)}</text>
        </g>

        {/* Right box: Financial markets */}
        <g>
          <rect x={720} y={100} width={240} height={340} rx={12} fill="#c7f0ed" stroke="#0e7490" />
          <text x={840} y={92} textAnchor="middle" fontSize={16} fontWeight={700} fill="#134e4a">Financial markets</text>
          <rect x={pts.Investors.x - pillW.Investors / 2} y={pts.Investors.y - pillH / 2} width={pillW.Investors} height={pillH} rx={16} fill="#ecfeff" stroke="#06b6d4" />
          <text x={pts.Investors.x} y={pts.Investors.y - 8} textAnchor="middle" fontSize={14} fill="#0e7490">Investors</text>
          <text x={pts.Investors.x} y={pts.Investors.y + 16} textAnchor="middle" fontSize={20} fontWeight={700} fill="#0f172a">${Math.round(investors)}</text>
        </g>

        {/* Bottom box: Government & Other stakeholders */}
        <g>
          <rect x={460} y={420} width={280} height={120} rx={12} fill="#fed7aa" stroke="#ea580c" />
          <text x={600} y={445} textAnchor="middle" fontSize={14} fontWeight={700} fill="#7c2d12">Government & Other stakeholders</text>
          <text x={600} y={469} textAnchor="middle" fontSize={20} fontWeight={700} fill="#7c2d12">${Math.round(govstake)}</text>
        </g>

        {/* Base orthogonal connectors for all channels */}
        {order.map((c) => {
          const path = (edges as any)[c].path();
          return <path key={`base-${c}`} d={path} stroke="#cbd5e1" strokeWidth={2} markerEnd="url(#arrow)" fill="none" />;
        })}

        {/* Active highlighted channel with moving dot that follows the path */}
        {active && (() => {
          const def = (edges as any)[active.code];
          const path = def.path();
          // approximate mid for the label
          const from = portPoint(def.from, def.fromPort as Port, 0);
          const to = portPoint(def.to, def.toPort as Port, 0);
          const midX = (from.x + to.x) / 2 - 140;
          const midY = (from.y + to.y) / 2 - 20;
          return (
            <g>
              <path d={path} stroke={def.color} strokeWidth={6} markerEnd="url(#arrow)" fill="none" strokeLinecap="round" />
              <circle r={7} fill={def.color} key={`dot-${activeIdx}-${active.code}`}>
                <animateMotion dur="1.0s" begin="0s" fill="freeze" key={`am-${activeIdx}-${active.code}`} path={path} />
              </circle>
              <foreignObject x={midX} y={midY} width="300" height="40">
                <div className="text-center text-sm md:text-base bg-slate-900 text-white px-3 py-2 rounded-full shadow">
                  {active.code}: {active.note} • ${Math.round(active.amount)}
                </div>
              </foreignObject>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

// ---------------------- UI helpers & Tests ----------------------
function Stat({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="text-2xl font-semibold">${Math.round(value)}</div>
    </div>
  );
}

function Slider({
  label,
  value,
  setValue,
  min,
  max,
}: {
  label: string;
  value: number;
  setValue: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-medium">{typeof value === "number" ? value : ""}</span>
      </div>
      <input type="range" className="w-full" value={value} onChange={(e) => setValue(Number(e.target.value))} min={min} max={max} />
    </div>
  );
}

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

function runSelfTests(): { name: string; pass: boolean; detail?: string }[] {
  const results: { name: string; pass: boolean; detail?: string }[] = [];

  // 1) Order presence A, C, D and post‑C B/F on a positive‑margin case
  {
    const { script } = computeRound(
      { F: 50, I: 500, GS: 0, A: 150 },
      { issueAmount: 80, opMargin: 15, taxStakePct: 25, alloc: { bCapexPct: 40, fPayoutPct: 40, retainPct: 20 } }
    );
    const codes = script.map((s) => s.code);
    const orderOk = codes.indexOf("C") >= 0 && codes.indexOf("D") > codes.indexOf("C");
    results.push({ name: "Has A,C,D and D after C", pass: (["A", "C", "D"] as const).every((c) => codes.includes(c)) && orderOk });
  }

  // 2) A capped by investor cash
  {
    const { script } = computeRound(
      { F: 10, I: 30, GS: 0, A: 0 },
      { issueAmount: 100, opMargin: 0, taxStakePct: 0, alloc: { bCapexPct: 0, fPayoutPct: 0, retainPct: 100 } }
    );
    const Astep = script.find((s) => s.code === "A");
    results.push({ name: "A capped by investor cash", pass: !!Astep && Math.round(Astep.amount) === 30 });
  }

  // 3) Negative margin → no D
  {
    const { script } = computeRound(
      { F: 50, I: 0, GS: 0, A: 100 },
      { issueAmount: 0, opMargin: -10, taxStakePct: 25, alloc: { bCapexPct: 50, fPayoutPct: 0, retainPct: 50 } }
    );
    const Dstep = script.find((s) => s.code === "D");
    results.push({ name: "Loss year → no D", pass: !Dstep });
  }

  // 4) Allocation edge cases
  {
    const r1 = computeRound(
      { F: 80, I: 0, GS: 0, A: 100 },
      { issueAmount: 0, opMargin: 10, taxStakePct: 0, alloc: { bCapexPct: 100, fPayoutPct: 0, retainPct: 0 } }
    );
    const r2 = computeRound(
      { F: 80, I: 0, GS: 0, A: 100 },
      { issueAmount: 0, opMargin: 10, taxStakePct: 0, alloc: { bCapexPct: 0, fPayoutPct: 100, retainPct: 0 } }
    );
    const r3 = computeRound(
      { F: 80, I: 0, GS: 0, A: 100 },
      { issueAmount: 0, opMargin: 10, taxStakePct: 0, alloc: { bCapexPct: 0, fPayoutPct: 0, retainPct: 100 } }
    );
    results.push({ name: "100% B → no F", pass: !r1.script.some((s) => s.code === "F") });
    results.push({ name: "100% F → no B", pass: !r2.script.some((s) => s.code === "B") });
    results.push({ name: "100% retain → no B/F", pass: !r3.script.some((s) => s.code === "B" || s.code === "F") });
  }

  // 5) Endpoint sanity
  {
    const { script } = computeRound(
      { F: 120, I: 0, GS: 0, A: 200 },
      { issueAmount: 0, opMargin: 10, taxStakePct: 0, alloc: { bCapexPct: 60, fPayoutPct: 40, retainPct: 0 } }
    );
    const Bsteps = script.filter((s) => s.code === "B");
    const Fsteps = script.filter((s) => s.code === "F");
    const Bok = !Bsteps.length || Bsteps.every((s) => s.from === "Firm" && s.to === "Assets");
    const Fok = !Fsteps.length || Fsteps.every((s) => s.from === "Firm" && s.to === "Investors");
    results.push({ name: "B endpoints Firm→Assets", pass: Bok });
    results.push({ name: "F endpoints Firm→Investors", pass: Fok });
  }

  // 6) Animated frames never negative for a standard case
  {
    const start = { F: 50, I: 500, GS: 0, A: 150 };
    const calc = computeRound(start, {
      issueAmount: 80,
      opMargin: 15,
      taxStakePct: 25,
      alloc: { bCapexPct: 40, fPayoutPct: 40, retainPct: 20 },
    });
    const frames = computeFrames(start, calc.script);
    const anyNeg = frames.some((fr) => fr.F < -1e-6);
    results.push({ name: "Animated frames never negative", pass: !anyNeg });
  }

  // 7) Taxes apply only to positive opCash (sanity)
  {
    const { script } = computeRound(
      { F: 20, I: 0, GS: 0, A: 100 },
      { issueAmount: 0, opMargin: -5, taxStakePct: 50, alloc: { bCapexPct: 0, fPayoutPct: 0, retainPct: 100 } }
    );
    const Dstep = script.find((s) => s.code === "D");
    results.push({ name: "No D when opCash negative", pass: !Dstep });
  }

  // 8) If distributable ≤ 0, no B/F allocations occur
  {
    const { script } = computeRound(
      { F: 10, I: 0, GS: 0, A: 100 },
      { issueAmount: 0, opMargin: -50, taxStakePct: 0, alloc: { bCapexPct: 60, fPayoutPct: 40, retainPct: 0 } }
    );
    results.push({ name: "No B/F when distributable is 0", pass: !script.some((s) => s.code === "B" || s.code === "F") });
  }

  return results;
}
