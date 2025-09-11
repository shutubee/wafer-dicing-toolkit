import React, { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Calculator, Settings, Sparkles, AlertTriangle, Upload } from "lucide-react";

// ------------------------
// Math utilities and models
// ------------------------
const clamp = (v:number, min:number, max:number) => Math.max(min, Math.min(max, v));
const mmToUm = (mm:number) => mm * 1000;
const umToMm = (um:number) => um / 1000;
const bladeTipSpeed = (diameter_mm:number, rpm:number) => Math.PI * (diameter_mm/1000) * rpm / 60; // m/s
const estimateKerf = (blade_thk_um:number, wearFactor:number, k:number=0.12) => blade_thk_um * (1 + k * wearFactor);

const suggestFeed = (material:string, t_um:number) => {
  const t_mm = umToMm(t_um);
  const base = { Si: 2.0, GaAs: 1.2, SiC: 0.7, Sapphire: 0.5, Glass: 0.8 }[material] ?? 1.0;
  return clamp(base * (1.0 / Math.sqrt(Math.max(t_mm, 0.05))), 0.2, 6.0);
};
const suggestRPM = (material:string, diameter_mm:number, blade_bond:string) => {
  const matFactor = { Si: 1.0, GaAs: 0.9, SiC: 1.15, Sapphire: 1.2, Glass: 1.05 }[material] ?? 1.0;
  const bondFactor = { Resin: 1.0, Metal: 0.9, Hybrid: 1.1 }[blade_bond] ?? 1.0;
  const targetTip = 38 * matFactor * bondFactor; // m/s target
  const rpm = targetTip * 60 / (Math.PI * (diameter_mm/1000));
  return clamp(rpm, 8000, 60000);
};
const estimatePowerKW = (material:string, feed_mms:number, kerf_um:number, t_um:number) => {
  const cMat = { Si: 0.015, GaAs: 0.02, SiC: 0.06, Sapphire: 0.07, Glass: 0.018 }[material] ?? 0.02;
  return cMat * feed_mms * umToMm(kerf_um) * umToMm(t_um);
}
const suggestCoolantLpm = (powerKW:number) => clamp(3 + 6 * powerKW, 1.0, 12.0);

const dieCount = (wafer_diam_mm:number, die_w_mm:number, die_h_mm:number, street_um:number) => {
  const R = wafer_diam_mm / 2;
  const pitchX = die_w_mm + umToMm(street_um);
  const pitchY = die_h_mm + umToMm(street_um);
  const cols = Math.max(0, Math.floor(wafer_diam_mm / pitchX));
  const rows = Math.max(0, Math.floor(wafer_diam_mm / pitchY));
  const areaCircle = Math.PI * R * R;
  const gridArea = Math.max(1, cols * rows * pitchX * pitchY);
  const fill = clamp(areaCircle / gridArea, 0, 1);
  const usable = Math.floor(cols * rows * fill);
  return { cols, rows, usable };
}

const chippingRisk = (material:string, feed_mms:number, tip_mps:number, t_um:number, blade_thk_um:number, coolantLpm:number) => {
  const matBase = { Si: 25, GaAs: 40, SiC: 55, Sapphire: 60, Glass: 45 }[material] ?? 35;
  let score = matBase;
  score += 8 * Math.max(0, feed_mms - 1.5);
  score += tip_mps < 30 ? (30 - tip_mps) * 0.8 : 0;
  score += tip_mps > 45 ? (tip_mps - 45) * 0.9 : 0;
  score += blade_thk_um/100;
  score += umToMm(t_um) * 6;
  score -= coolantLpm * 1.1;
  return clamp(Math.round(score), 0, 100);
}

const number = (v:any, d:number=2) => (isFinite(v) ? Number(v).toFixed(d) : "-");

// CSV parser
function parseCSV(text:string){
  const lines = text.trim().split(/\r?\n/);
  if(!lines.length) return [] as any[];
  const header = lines.shift()!.split(/\s*,\s*/).map(s=>s.toLowerCase());
  const idx = (n:string)=> header.indexOf(n);
  const xi = idx("x")>-1 ? idx("x") : idx("die_x");
  const yi = idx("y")>-1 ? idx("y") : idx("die_y");
  const si = idx("status");
  return lines.map(ln=>{
    const r = ln.split(/\s*,\s*/);
    return { x: Number(r[xi]||0), y: Number(r[yi]||0), status: String(r[si]||"good").toLowerCase() };
  });
}

// Presets
const MATERIAL_PRESETS = [
  { key: "Si", name: "Silicon (100)" },
  { key: "GaAs", name: "GaAs" },
  { key: "SiC", name: "SiC" },
  { key: "Sapphire", name: "Sapphire" },
  { key: "Glass", name: "Borosilicate Glass" },
];
const BLADE_OPTIONS = [
  { key: "Resin", name: "Resin-bonded diamond" },
  { key: "Metal", name: "Metal-bonded diamond" },
  { key: "Hybrid", name: "Hybrid bond" },
];

export default function DicingEngineerToolkit(){
  // Core recipe
  const [material, setMaterial] = useState("Si");
  const [waferDiam, setWaferDiam] = useState(300);
  const [waferThk, setWaferThk] = useState(725);
  const [dieW, setDieW] = useState(5.0);
  const [dieH, setDieH] = useState(5.0);
  const [street, setStreet] = useState(60);
  const [bladeDia, setBladeDia] = useState(58);
  const [bladeThk, setBladeThk] = useState(30);
  const [bladeBond, setBladeBond] = useState("Resin");
  const [rpm, setRpm] = useState(30000);
  const [feed, setFeed] = useState(1.5);
  const [coolant, setCoolant] = useState(4.0);
  const [wear, setWear] = useState(0.2);

  // Map
  const [mapGood, setMapGood] = useState<number>();
  const [mapBad, setMapBad] = useState<number>();
  const [mapFileName, setMapFileName] = useState<string|undefined>(undefined);

  // Blade life
  const [expectedLife_m, setExpectedLife_m] = useState(1200);
  const [cumLength_mm, setCumLength_mm] = useState(0);

  // Alignment
  const [offX, setOffX] = useState(0);
  const [offY, setOffY] = useState(0);
  const [theta, setTheta] = useState(0);

  // Verification measurements
  const [meas, setMeas] = useState<Record<string,string>>({});

  // Derived
  const rpmSug = useMemo(()=>suggestRPM(material, bladeDia, bladeBond), [material, bladeDia, bladeBond]);
  const feedSug = useMemo(()=>suggestFeed(material, waferThk), [material, waferThk]);
  const tip = useMemo(()=>bladeTipSpeed(bladeDia, rpm), [bladeDia, rpm]);
  const kerf = useMemo(()=>estimateKerf(bladeThk, wear), [bladeThk, wear]);
  const powerKW = useMemo(()=>estimatePowerKW(material, feed, kerf, waferThk), [material, feed, kerf, waferThk]);
  const coolantSug = useMemo(()=>suggestCoolantLpm(powerKW), [powerKW]);
  const die = useMemo(()=>dieCount(waferDiam, dieW, dieH, street), [waferDiam, dieW, dieH, street]);
  const risk = useMemo(()=>chippingRisk(material, feed, tip, waferThk, bladeThk, coolant), [material, feed, tip, waferThk, bladeThk, coolant]);

  const expectedLife_mm = expectedLife_m * 1000;
  const lifeUsedPct = clamp((cumLength_mm/expectedLife_mm)*100, 0, 200);

  const applySuggestions = () => {
    setRpm(Math.round(rpmSug));
    setFeed(Number(number(feedSug,2)));
    setCoolant(Number(number(coolantSug,1)));
  };

  const handleMapUpload = (e:React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if(!f) return;
    setMapFileName(f.name);
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const data:any[] = parseCSV(String(reader.result||""));
        const good = data.filter(d=>d.status!=="bad").length;
        const bad = data.filter(d=>d.status==="bad").length;
        setMapGood(good); setMapBad(bad);
      }catch{
        alert("Failed to parse map. Ensure CSV header has x,y,status.");
      }
    };
    reader.readAsText(f);
  };

  const exportCSV = () => {
    const verificationSpecs = getVerificationSpecs({street, kerf, dieW, dieH, waferThk, tip});
    const rows:string[][] = [
      ["Parameter","Value","Units"],
      ["Material", material, "-"],
      ["Wafer Diameter", waferDiam.toString(), "mm"],
      ["Wafer Thickness", waferThk.toString(), "µm"],
      ["Die W x H", `${dieW} x ${dieH}`, "mm"],
      ["Street", street.toString(), "µm"],
      ["Blade Diameter", bladeDia.toString(), "mm"],
      ["Blade Thickness", bladeThk.toString(), "µm"],
      ["Blade Bond", bladeBond, "-"],
      ["RPM", rpm.toString(), "rpm"],
      ["Feed Rate", feed.toString(), "mm/s"],
      ["Coolant Flow", coolant.toString(), "L/min"],
      ["Wear Factor", wear.toString(), "0-1"],
      ["Tip Speed", number(tip), "m/s"],
      ["Kerf (est)", number(kerf), "µm"],
      ["Spindle Power (est)", number(powerKW,3), "kW"],
      ["Chipping Risk", risk.toString(), "0-100"],
      ["Die Count (usable)", (mapGood ?? die.usable).toString(), "pcs"],
      ["Grid (cols x rows)", `${die.cols} x ${die.rows}`, "-"],
      ["Map Good", (mapGood ?? "").toString(), "pcs"],
      ["Map Bad", (mapBad ?? "").toString(), "pcs"],
      ["Offset X/Y (µm)", `${offX}/${offY}`, "µm"],
      ["Theta", theta.toString(), "deg"],
      ["Blade Life Used", number(lifeUsedPct,1), "%"],
      ["Blade Cut Length Acc", number(cumLength_mm,0), "mm"],
      ["--- Verification ---","",""],
    ];
    verificationSpecs.forEach(s=>{
      const m = Number(meas[s.key]);
      const ok = isFinite(m) && m>=s.lo && m<=s.hi;
      const status = isFinite(m) ? (ok? 'PASS' : 'FAIL') : '-';
      rows.push([s.name, (meas[s.key]??''), `${s.lo}–${s.hi}`, status]);
    });
    const csv = rows.map(r=>r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "dicing_toolkit_export.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const verificationSpecs = getVerificationSpecs({street, kerf, dieW, dieH, waferThk, tip});

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Wafer Dicing Engineer Toolkit</h1>
        <div className="flex gap-2">
          <Button onClick={applySuggestions}><Sparkles className="mr-2 h-4 w-4"/>Apply Suggestions</Button>
          <Button variant="outline" onClick={exportCSV}><Download className="mr-2 h-4 w-4"/>Export CSV</Button>
        </div>
      </header>

      <Tabs defaultValue="process">
        <TabsList className="grid grid-cols-8 w-full md:w-auto">
          <TabsTrigger value="process"><Settings className="mr-2 h-4 w-4"/>Process</TabsTrigger>
          <TabsTrigger value="planning"><Calculator className="mr-2 h-4 w-4"/>Planning</TabsTrigger>
          <TabsTrigger value="risk"><AlertTriangle className="mr-2 h-4 w-4"/>Risk</TabsTrigger>
          <TabsTrigger value="map"><Upload className="mr-2 h-4 w-4"/>Map</TabsTrigger>
          <TabsTrigger value="life">Blade Life & Align</TabsTrigger>
          <TabsTrigger value="verify">Verification</TabsTrigger>
          <TabsTrigger value="sop">SOP</TabsTrigger>
          <TabsTrigger value="tests">Tests</TabsTrigger>
        </TabsList>

        {/* PROCESS */}
        <TabsContent value="process">
          <Card><CardContent className="p-4 space-y-4">
            <h2 className="text-lg font-medium">Process Setup</h2>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <Row label="Material">
                  <Select value={material} onValueChange={setMaterial}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      {MATERIAL_PRESETS.map(m=>(<SelectItem key={m.key} value={m.key}>{m.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </Row>
                <Row label="Internal Structure (notes)"><Input placeholder="e.g. Backgrind + Ta barrier + Cu layer"/></Row>
                <Row label="Scrub Line Width (µm)"><Input type="number" value={street} onChange={e=>setStreet(Number(e.target.value))}/></Row>
                <Row label="Orientation"><Input placeholder="Notch @ 6 o'clock"/></Row>
                <Row label="Fiducial Marks"><Input placeholder="Box-in-box, cross, etc."/></Row>
                <Row label="Vacuum Level (kPa)"><Input type="number" placeholder="e.g. 80"/></Row>
              </div>

              <div className="space-y-3">
                <Row label="Wafer Diameter (mm)"><Input type="number" value={waferDiam} onChange={e=>setWaferDiam(Number(e.target.value))}/></Row>
                <Row label="Wafer Thickness (µm)"><Input type="number" value={waferThk} onChange={e=>setWaferThk(Number(e.target.value))}/></Row>
                <Row label="Die Width (mm)"><Input type="number" value={dieW} onChange={e=>setDieW(Number(e.target.value))}/></Row>
                <Row label="Die Height (mm)"><Input type="number" value={dieH} onChange={e=>setDieH(Number(e.target.value))}/></Row>
                <Row label="Blade Diameter (mm)"><Input type="number" value={bladeDia} onChange={e=>setBladeDia(Number(e.target.value))}/></Row>
                <Row label="Blade Thickness (µm)"><Input type="number" value={bladeThk} onChange={e=>setBladeThk(Number(e.target.value))}/></Row>
                <Row label="Blade Bond">
                  <Select value={bladeBond} onValueChange={setBladeBond}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      {BLADE_OPTIONS.map(b=>(<SelectItem key={b.key} value={b.key}>{b.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </Row>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <Card className="rounded-xl border"><CardContent className="p-4 space-y-3">
                <h3 className="font-medium">Machine Setpoints</h3>
                <Row label={`RPM (suggest ${number(rpmSug,0)})`}><Input type="number" value={rpm} onChange={e=>setRpm(Number(e.target.value))}/></Row>
                <Row label={`Feed (mm/s) (suggest ${number(feedSug)})`}><Input type="number" value={feed} onChange={e=>setFeed(Number(e.target.value))}/></Row>
                <Row label={`Coolant (L/min) (suggest ${number(coolantSug,1)})`}><Input type="number" value={coolant} onChange={e=>setCoolant(Number(e.target.value))}/></Row>
                <Row label="Wear Factor (0–1)"><Input type="number" step={0.01} value={wear} onChange={e=>setWear(Number(e.target.value))}/></Row>
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Tip Speed" value={`${number(tip)} m/s`} note="Target 30–45"/>
                  <Metric label="Kerf (est)" value={`${number(kerf)} µm`} note="Grows with wear"/>
                </div>
              </CardContent></Card>

              <Card className="rounded-xl border"><CardContent className="p-4 space-y-3">
                <h3 className="font-medium">Blade Evaluation</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Spindle Power" value={`${number(powerKW,3)} kW`} note="Approx."/>
                  <Metric label="Chipping Risk" value={`${risk}/100`} note={risk<35?"Low":"Watch"}/>
                </div>
                <p className="text-xs text-muted-foreground">Resin bond favors low damage; Hybrid extends life; Metal for harder materials (SiC/Sapphire).</p>
                <Button onClick={applySuggestions} className="rounded-2xl">Apply Suggested Setpoints</Button>
              </CardContent></Card>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* PLANNING */}
        <TabsContent value="planning">
          <Card><CardContent className="p-4 space-y-3">
            <h2 className="text-lg font-medium">Die Planning</h2>
            <div className="grid grid-cols-3 gap-3">
              <Metric label="Columns" value={`${die.cols}`}/>
              <Metric label="Rows" value={`${die.rows}`}/>
              <Metric label="Usable Dies" value={`${mapGood ?? die.usable}`}/>
            </div>
            <ThroughputPanel waferDiam={waferDiam} dieW={dieW} dieH={dieH} street={street} feed={feed} />
            <p className="text-xs text-muted-foreground">Usable dies falls back to geometric estimate unless a wafer map is loaded.</p>
          </CardContent></Card>
        </TabsContent>

        {/* RISK */}
        <TabsContent value="risk">
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="rounded-2xl border"><CardContent className="p-4 space-y-3">
              <h2 className="text-lg font-medium">Risk Breakdown</h2>
              <ul className="text-sm list-disc pl-5 space-y-1">
                <li>Material sensitivity baseline: Si (low) → Sapphire/SiC (high).</li>
                <li>Tip speed outside 30–45 m/s increases micro-chipping risk.</li>
                <li>Higher feed and thicker blades amplify edge stress.</li>
                <li>Coolant reduces thermal/mechanical damage risk.</li>
              </ul>
            </CardContent></Card>
            <Card className="rounded-2xl border md:col-span-2"><CardContent className="p-4 space-y-3">
              <h2 className="text-lg font-medium">What to Adjust</h2>
              <div className="grid md:grid-cols-2 gap-3 text-sm">
                <ActionHint title="If chipping is high">
                  • Raise coolant toward suggestion.
                  <br/>• Bring tip speed into 30–45 m/s (tune RPM / blade Ø).
                  <br/>• Reduce feed toward suggestion.
                  <br/>• Consider thinner blade or resin bond.
                </ActionHint>
                <ActionHint title="If throughput is low">
                  • Increase feed in small steps while inspecting edges.
                  <br/>• Move to hybrid bond for wear resistance.
                  <br/>• Optimize street width if design allows.
                </ActionHint>
              </div>
            </CardContent></Card>
          </div>
        </TabsContent>

        {/* MAP */}
        <TabsContent value="map">
          <Card><CardContent className="p-4 space-y-3">
            <h2 className="text-lg font-medium">Import Wafer Map (CSV)</h2>
            <input type="file" accept=".csv,.txt" onChange={handleMapUpload} />
            {mapFileName && <p className="text-sm">Uploaded: {mapFileName}</p>}
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Good Dies" value={`${mapGood ?? "-"}`}/>
              <Metric label="Bad Dies" value={`${mapBad ?? "-"}`}/>
            </div>
            <p className="text-xs text-muted-foreground">CSV columns: <code>x,y,status</code> or <code>die_x,die_y,status</code>. Status values: <code>good</code> / <code>bad</code>.</p>
          </CardContent></Card>
        </TabsContent>

        {/* LIFE & ALIGN */}
        <TabsContent value="life">
          <div className="grid md:grid-cols-2 gap-4">
            <Card><CardContent className="p-4 space-y-3">
              <h2 className="text-lg font-medium">Blade Life Tracking</h2>
              <Row label="Expected Life (m)"><Input type="number" value={expectedLife_m} onChange={e=>setExpectedLife_m(Number(e.target.value))}/></Row>
              <Row label="Accumulated Cut (mm)"><Input type="number" value={cumLength_mm} onChange={e=>setCumLength_mm(Number(e.target.value))}/></Row>
              <div className="grid grid-cols-2 gap-3">
                <Metric label="Life Used" value={`${number(lifeUsedPct,1)} %`} note={lifeUsedPct>90?"Swap soon":"OK"}/>
                <Metric label="Remaining" value={`${number((expectedLife_mm-cumLength_mm)/1000,1)} m`}/>
              </div>
              <Button onClick={()=>{
                const pitchX = dieW + umToMm(street);
                const pitchY = dieH + umToMm(street);
                const lanesX = Math.max(0, Math.floor(waferDiam/pitchX)-1);
                const lanesY = Math.max(0, Math.floor(waferDiam/pitchY)-1);
                const added = waferDiam*(lanesX+lanesY);
                setCumLength_mm(v=>v+added);
              }}>Add One Wafer Cycle</Button>
            </CardContent></Card>

            <Card><CardContent className="p-4 space-y-3">
              <h2 className="text-lg font-medium">Alignment Offsets</h2>
              <Row label="Offset X (µm)"><Input type="number" value={offX} onChange={e=>setOffX(Number(e.target.value))}/></Row>
              <Row label="Offset Y (µm)"><Input type="number" value={offY} onChange={e=>setOffY(Number(e.target.value))}/></Row>
              <Row label="Theta (deg)"><Input type="number" value={theta} onChange={e=>setTheta(Number(e.target.value))}/></Row>
              {(()=>{
                const shift_mm = Math.hypot(umToMm(offX), umToMm(offY));
                const edgeClear_mm = (waferDiam/2) - (Math.max(dieW,dieH)/2) - shift_mm;
                const warn = edgeClear_mm < 1.0 || Math.abs(theta) > 0.1;
                return <div className="grid grid-cols-2 gap-3">
                  <Metric label="Stage Shift" value={`${number(shift_mm,3)} mm`}/>
                  <Metric label="Edge Clearance" value={`${number(edgeClear_mm,2)} mm`} note={warn?"Check lanes":"OK"}/>
                </div>
              })()}
            </CardContent></Card>
          </div>
        </TabsContent>

        {/* VERIFY */}
        <TabsContent value="verify">
          <Card><CardContent className="p-4 space-y-4">
            <h2 className="text-lg font-medium">Verification & Dummy Run</h2>
            <SpecTable specs={verificationSpecs} meas={meas} setMeas={setMeas}/>
            <div className="flex gap-2">
              <Button onClick={()=>alert('Dummy sample queued with current setpoints.')}>Run Dummy Sample</Button>
              <Button variant="outline" onClick={()=>alert('Repeat planned: adjust toward suggestions and re-measure.')}>Plan Repeat If OOS</Button>
            </div>
          </CardContent></Card>
        </TabsContent>

        {/* SOP */}
        <TabsContent value="sop">
          <Card><CardContent className="p-4 space-y-3">
            <h2 className="text-lg font-medium">Generated SOP (Preview)</h2>
            <SOPBlock
              material={material}
              waferDiam={waferDiam}
              waferThk={waferThk}
              dieW={dieW}
              dieH={dieH}
              street={street}
              bladeDia={bladeDia}
              bladeThk={bladeThk}
              bladeBond={bladeBond}
              rpm={rpm}
              feed={feed}
              coolant={coolant}
              wear={wear}
              tip={tip}
              kerf={kerf}
            />
            <p className="text-xs text-muted-foreground">Review and export to PDF/CSV externally. This is a generated draft suitable for release after sign-off.</p>
          </CardContent></Card>
        </TabsContent>

        {/* TESTS */}
        <TabsContent value="tests">
          <TestsTab />
        </TabsContent>
      </Tabs>

      <footer className="text-xs text-muted-foreground pt-2">
        Heuristics only. Validate on your saw and process-of-record. © {new Date().getFullYear()}
      </footer>
    </div>
  );
}

function Row({label, children}:{label:string, children:React.ReactNode}){
  return (
    <div className="grid grid-cols-12 items-center gap-3">
      <Label className="col-span-5 md:col-span-4 text-sm">{label}</Label>
      <div className="col-span-7 md:col-span-8">{children}</div>
    </div>
  );
}

function Metric({label, value, note}:{label:string, value:string, note?:string}){
  return (
    <div className="p-3 rounded-xl border bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
    </div>
  );
}

function ActionHint({title, children}:{title:string, children:React.ReactNode}){
  return (
    <div className="p-3 rounded-xl border">
      <div className="font-medium mb-1">{title}</div>
      <div>{children}</div>
    </div>
  );
}

function SpecTable({specs, meas, setMeas}:{specs:{name:string,nom:number,lo:number,hi:number,key:string}[], meas:Record<string,string>, setMeas:React.Dispatch<React.SetStateAction<Record<string,string>>>}){
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th className="py-2 pr-3">Parameter</th>
            <th className="py-2 pr-3">Nominal</th>
            <th className="py-2 pr-3">Spec (lo–hi)</th>
            <th className="py-2 pr-3">Measured</th>
            <th className="py-2 pr-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {specs.map(s=>{
            const m = Number(meas[s.key]);
            const ok = isFinite(m) && m>=s.lo && m<=s.hi;
            const status = isFinite(m) ? (ok? 'PASS' : 'FAIL') : '-';
            return (
              <tr key={s.key} className="border-t">
                <td className="py-2 pr-3">{s.name}</td>
                <td className="py-2 pr-3">{number(s.nom)}</td>
                <td className="py-2 pr-3">{number(s.lo)} – {number(s.hi)}</td>
                <td className="py-2 pr-3">
                  <Input type="number" placeholder="enter" value={meas[s.key]??''} onChange={e=>setMeas(v=>({...v,[s.key]: e.target.value}))}/>
                </td>
                <td className={`py-2 pr-3 font-medium ${status==='FAIL'?'text-red-600': status==='PASS'?'text-green-600':'text-muted-foreground'}`}>{status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SOPBlock(props:{material:string, waferDiam:number, waferThk:number, dieW:number, dieH:number, street:number, bladeDia:number, bladeThk:number, bladeBond:string, rpm:number, feed:number, coolant:number, wear:number, tip:number, kerf:number}){
  const {
    material, waferDiam, waferThk, dieW, dieH, street, bladeDia, bladeThk, bladeBond, rpm, feed, coolant, wear, tip, kerf
  } = props;
  const text = `SOP: Wafer Dicing\n\n1) Wafer Structure & Identification\n- Material: ${material}\n- Diameter: ${waferDiam} mm; Thickness: ${waferThk} µm\n- Die size: ${dieW} × ${dieH} mm; Streets: ${street} µm\n- Orientation: notch/flat per traveler; Fiducials per mask (verify visibility).\n\n2) Blade Selection\n- Blade Ø: ${bladeDia} mm; Thickness: ${bladeThk} µm; Bond: ${bladeBond}\n- Expected kerf (initial): ${number(kerf)} µm; Tip speed target 30–45 m/s (current ${number(tip)}).\n\n3) Machine Setpoints\n- Spindle speed: ${Math.round(rpm)} rpm\n- Feed: ${number(feed)} mm/s\n- Coolant: ${number(coolant,1)} L/min\n- Wear factor: ${number(wear,2)} (update after every wafer)\n\n4) Alignment & Vacuum\n- Align to wafer fiducials; set theta ≤ 0.1°.\n- Vacuum level: 70–90 kPa (set per chuck spec).\n\n5) Dummy Sample Run\n- Run 1 wafer with current setpoints. Inspect kerf, edge chipping, die size.\n\n6) Measurement & Acceptance\n- Streets: ${street} µm ±10%\n- Die size: ±10 µm\n- Wafer thickness: ±2%\n- Kerf ≤ 1.5× blade thickness (monitor wear).\n\n7) Actions If OOS\n- Bring tip speed into 30–45 m/s via rpm.\n- Reduce feed or raise coolant.\n- Consider thinner/resin bond if chipping high.\n\n8) Documentation\n- Record all parameters and measurements in traveler. Release to production after PASS.\n`;
  return (
    <pre className="text-sm whitespace-pre-wrap p-3 rounded-xl border bg-muted/30">{text}</pre>
  );
}

function ThroughputPanel({waferDiam, dieW, dieH, street, feed}:{waferDiam:number, dieW:number, dieH:number, street:number, feed:number}){
  const pitchX = dieW + umToMm(street);
  const pitchY = dieH + umToMm(street);
  const lanesX = Math.max(0, Math.floor(waferDiam / pitchX) - 1);
  const lanesY = Math.max(0, Math.floor(waferDiam / pitchY) - 1);
  const perLaneLength = waferDiam; // mm
  const totalLength_mm = perLaneLength * (lanesX + lanesY);
  const time_s = totalLength_mm / Math.max(feed, 0.001);
  const cyclesPerHour = 3600 / Math.max(time_s + 20, 1); // 20s indexing overhead
  return (
    <div className="grid grid-cols-3 gap-3">
      <Metric label="Lanes X" value={`${lanesX}`}/>
      <Metric label="Lanes Y" value={`${lanesY}`}/>
      <Metric label="Total Cut Length" value={`${number(totalLength_mm)} mm`}/>
      <Metric label="Cycle Time" value={`${number(time_s)} s`}/>
      <Metric label="Throughput" value={`${number(cyclesPerHour,1)} wafers/hr`}/>
      <div className="text-xs text-muted-foreground col-span-3">Throughput estimate excludes blade swaps and alignment time. Use for comparative tuning.</div>
    </div>
  );
}

function TestsTab(){
  type Test = { name:string, pass:boolean, info?:string };
  const tests: Test[] = [];
  
  // Test 1: Tip speed sanity (D=58mm, rpm=30k) ≈ 90.99 m/s
  const ts = bladeTipSpeed(58, 30000);
  tests.push({ name: 'Tip speed calc', pass: Math.abs(ts - 90.99) < 0.5, info: ts.toFixed(2) });
  
  // Test 2: Die count scales with wafer diameter
  const d200 = dieCount(200, 5, 5, 60).usable;
  const d300 = dieCount(300, 5, 5, 60).usable;
  tests.push({ name: 'Die count scales with wafer', pass: d300 >= d200, info: `${d200}→${d300}`});
  
  // Test 3: Suggest feed bounds
  const sf = suggestFeed('Si', 725);
  tests.push({ name: 'Suggest feed in [0.2,6.0]', pass: sf>=0.2 && sf<=6.0, info: sf.toFixed(2)});
  
  // Test 4: Chipping risk stays within 0–100
  const riskVal = chippingRisk('Si', 1.5, 38, 725, 30, 4);
  tests.push({ name: 'Chipping risk bounded 0–100', pass: riskVal>=0 && riskVal<=100, info: String(riskVal)});
  
  // Test 5: Coolant suggestion monotonic with power
  const c1 = suggestCoolantLpm(0.1);
  const c2 = suggestCoolantLpm(0.2);
  tests.push({ name: 'Coolant suggestion monotonic', pass: c2 >= c1, info: `${c1.toFixed(1)}→${c2.toFixed(1)}` });

  // Test 6: RPM suggestion yields realistic numeric range
  const rpmTest = suggestRPM('Si', 58, 'Resin');
  tests.push({ name: 'RPM suggestion in [8k,60k]', pass: rpmTest>=8000 && rpmTest<=60000, info: rpmTest.toFixed(0)});

  // Test 7: CSV parser tolerates simple header
  const parsed = parseCSV('x,y,status\n0,0,good\n0,1,bad');
  const pGood = parsed.filter((d:any)=>d.status!=="bad").length;
  const pBad  = parsed.filter((d:any)=>d.status==="bad").length;
  tests.push({ name: 'CSV parser counts', pass: pGood===1 && pBad===1, info: `${pGood} good / ${pBad} bad`});

  // Test 8: Bigger street should not increase usable dies
  const uNarrow = dieCount(300, 5, 5, 40).usable;
  const uWide   = dieCount(300, 5, 5, 120).usable;
  tests.push({ name: 'Street width effect', pass: uWide <= uNarrow, info: `${uNarrow} vs ${uWide}`});

  return (
    <Card><CardContent className="p-4 space-y-3">
      <h2 className="text-lg font-medium">Internal Tests</h2>
      <div className="text-xs text-muted-foreground">These basic checks help catch math/logic regressions at runtime.</div>
      <div className="space-y-2">
        {tests.map((t,i)=> (
          <div key={i} className={`text-sm ${t.pass? 'text-green-700':'text-red-700'}`}>• {t.name}: {t.pass? 'PASS':'FAIL'} {t.info? `(${t.info})`: ''}</div>
        ))}
      </div>
    </CardContent></Card>
  );
}

function getVerificationSpecs({street, kerf, dieW, dieH, waferThk, tip}:{street:number, kerf:number, dieW:number, dieH:number, waferThk:number, tip:number}){
  return [
    { name: 'Street Width (µm)', nom: street, lo: street*0.9, hi: street*1.1, key: 'street' },
    { name: 'Kerf (µm)', nom: kerf, lo: Math.max(0, kerf*0.8), hi: Math.max(kerf, kerf*1.5), key: 'kerf' },
    { name: 'Die Width (mm)', nom: dieW, lo: Math.max(0, dieW-0.01), hi: dieW+0.01, key: 'dieW' },
    { name: 'Die Height (mm)', nom: dieH, lo: Math.max(0, dieH-0.01), hi: dieH+0.01, key: 'dieH' },
    { name: 'Wafer Thickness (µm)', nom: waferThk, lo: waferThk*0.98, hi: waferThk*1.02, key: 'thk' },
    { name: 'Tip Speed (m/s)', nom: tip, lo: 30, hi: 45, key: 'tip' },
    { name: 'Vacuum Level (kPa)', nom: 80, lo: 70, hi: 90, key: 'vac' },
  ];
}
