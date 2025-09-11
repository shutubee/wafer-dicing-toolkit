import React , {useMemo,useState} from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Calculator, Settings, Sparkles, AlertTriangle, Upload } from "lucide-react";
/ ------------------------
// Helper math utilities and models
// ------------------------
const clamp = (v:number, min:number, max:number) => Math.max(min, Math.min(max, v));
const mmToUm = (mm:number) => mm * 1000;
const umToMm = (um:number) => um / 1000;
const inToMm = (inch:number) => inch * 25.4;
const bladeTipSpeed = (diameter_mm:number, rpm:number) => Math.PI * (diameter_mm/1000) * rpm / 60;
const estimateKerf = (blade_thk_um:number, wearFactor:number, k:number=0.12) => blade_thk_um * (1 + k * wearFactor);
const suggestFeed = (material:string, t_um:number) => {
  const t_mm = umToMm(t_um);
  const base = { "Si": 2.0, "GaAs": 1.2, "SiC": 0.7, "Sapphire": 0.5, "Glass": 0.8 }[material] ?? 1.0;
  return clamp(base * (1.0 / Math.sqrt(Math.max(t_mm, 0.05))), 0.2, 6.0);
};
const suggestRPM = (material:string, diameter_mm:number, blade_bond:string) => {
  const matFactor = { Si: 1.0, GaAs: 0.9, SiC: 1.15, Sapphire: 1.2, Glass: 1.05 }[material] ?? 1.0;
  const bondFactor = { Resin: 1.0, Metal: 0.9, Hybrid: 1.1 }[blade_bond] ?? 1.0;
  const targetTip = 38 * matFactor * bondFactor;
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
  let cols = Math.floor(wafer_diam_mm / pitchX);
  let rows = Math.floor(wafer_diam_mm / pitchY);
  const areaCircle = Math.PI * R * R;
  const fill = clamp(areaCircle / (cols * rows * pitchX * pitchY), 0, 1);
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
const number = (v:any, d:number=2) => isFinite(v) ? Number(v).toFixed(d) : "-";

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
  const [mapFile, setMapFile] = useState<File|null>(null);

  const rpmSug = useMemo(()=>suggestRPM(material, bladeDia, bladeBond), [material, bladeDia, bladeBond]);
  const feedSug = useMemo(()=>suggestFeed(material, waferThk), [material, waferThk]);
  const tip = useMemo(()=>bladeTipSpeed(bladeDia, rpm), [bladeDia, rpm]);
  const kerf = useMemo(()=>estimateKerf(bladeThk, wear), [bladeThk, wear]);
  const powerKW = useMemo(()=>estimatePowerKW(material, feed, kerf, waferThk), [material, feed, kerf, waferThk]);
  const coolantSug = useMemo(()=>suggestCoolantLpm(powerKW), [powerKW]);
  const die = useMemo(()=>dieCount(waferDiam, dieW, dieH, street), [waferDiam, dieW, dieH, street]);
  const risk = useMemo(()=>chippingRisk(material, feed, tip, waferThk, bladeThk, coolant), [material, feed, tip, waferThk, bladeThk, coolant]);

  const applySuggestions = () => {
    setRpm(Math.round(rpmSug));
    setFeed(Number(number(feedSug, 2)));
    setCoolant(Number(number(coolantSug, 1)));
  }
  const exportCSV = () => {
    const rows = [
      ["Parameter","Value","Units"],
      ["Material", material, "-"],
      ["Wafer Diameter", waferDiam, "mm"],
      ["Wafer Thickness", waferThk, "µm"],
      ["Die W x H", `${dieW} x ${dieH}`, "mm"],
      ["Street", street, "µm"],
      ["Blade Diameter", bladeDia, "mm"],
      ["Blade Thickness", bladeThk, "µm"],
      ["Blade Bond", bladeBond, "-"],
      ["RPM", rpm, "rpm"],
      ["Feed Rate", feed, "mm/s"],
      ["Coolant Flow", coolant, "L/min"],
      ["Wear Factor", wear, "0-1"],
      ["Tip Speed", number(tip), "m/s"],
      ["Kerf (est)", number(kerf), "µm"],
      ["Spindle Power (est)", number(powerKW,3), "kW"],
      ["Chipping Risk", risk, "0-100"],
      ["Die Count (usable)", die.usable, "pcs"],
      ["Grid (cols x rows)", `${die.cols} x ${die.rows}`, "-"],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dicing_toolkit_export.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  const handleFileUpload = (e:React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(file) setMapFile(file);
  }

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
        <TabsList className="grid grid-cols-4 w-full md:w-auto">
          <TabsTrigger value="process"><Settings className="mr-2 h-4 w-4"/>Process Setup</TabsTrigger>
          <TabsTrigger value="planning"><Calculator className="mr-2 h-4 w-4"/>Die Planning</TabsTrigger>
          <TabsTrigger value="risk"><AlertTriangle className="mr-2 h-4 w-4"/>Risk & Power</TabsTrigger>
          <TabsTrigger value="import"><Upload className="mr-2 h-4 w-4"/>Map Import</TabsTrigger>
        </TabsList>

        {/* Existing tabs remain unchanged */}

        <TabsContent value="import">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4 space-y-3">
              <h2 className="text-lg font-medium">Import Wafer Map</h2>
              <input type="file" accept=".csv,.txt,.gds,.gerber" onChange={handleFileUpload}/>
              {mapFile && <p className="text-sm">Uploaded: {mapFile.name}</p>}
              <p className="text-xs text-muted-foreground">Future extension: parse defect map, blade life usage, alignment offsets.</p>
            </CardContent>
          </Card>
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
  )
}
function Metric({label, value, note}:{label:string, value:string, note?:string}){
  return (
    <div className="p-3 rounded-xl border bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {note && <div className="text-xs text-muted-foreground">{note}</div>}
    </div>
  )
}
function ActionHint({title, children}:{title:string, children:React.ReactNode}){
  return (
    <div className="p-3 rounded-xl border">
      <div className="font-medium mb-1">{title}</div>
      <div>{children}</div>
    </div>
  )
}
function ThroughputPanel({waferDiam, dieW, dieH, street, feed, kerf_um}:{waferDiam:number, dieW:number, dieH:number, street:number, feed:number, kerf_um:number}){
  const pitchX = dieW + umToMm(street);
  const pitchY = dieH + umToMm(street);
  const lanesX = Math.floor(waferDiam / pitchX) - 1;
  const lanesY = Math.floor(waferDiam / pitchY) - 1;
  const totalLength_mm = waferDiam * (lanesX + lanesY);
  const time_s = totalLength_mm / feed;
  const cyclesPerHour = 3600 / Math.max(time_s + 20, 1);
  const text = [
    { k: "Lanes X", v: lanesX },
    { k: "Lanes Y", v: lanesY },
    { k: "Total Cut Length", v: `${number(totalLength_mm)} mm` },
    { k: "Cycle Time", v: `${number(time_s)} s` },
    { k: "Throughput", v: `${number(cyclesPerHour,1)} wafers/hr` },
    { k: "Kerf Used", v: `${number(kerf_um)} µm` },
  ];
  return (
    <div className="grid grid-cols-2 gap-3">
      {text.map((t)=> (
        <div key={t.k} className="p-3 rounded-xl border bg-card">
          <div className="text-xs text-muted-foreground">{t.k}</div>
          <div className="text-lg font-semibold">{t.v}</div>
        </div>
      ))}
      <p className="col-span-2 text-xs text-muted-foreground">Throughput estimate excludes blade swaps and alignment time. Use for comparative tuning.</p>
    </div>
  )
}
