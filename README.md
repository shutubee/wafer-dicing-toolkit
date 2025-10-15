# wafer-dicing-toolkit
This application provides wafer dicing engineers with a unified interface for process setup, blade
and coolant optimization, die yield estimation, verification planning, and SOP generation. It includes
mathematical models for feed rate, kerf estimation, chipping risk, spindle power, and coolant flow
rate.
Framework: React + TypeScript

UI Components: Uses ShadCN UI (Card, Button, Tabs, Select, Input, etc.) and lucide-react icons.

Main Component: DicingEngineerToolkit()

Exports: Default export of the main functional component.


Key Functional Modules :


A. Math & Physics Utilities
| Function                                                              | Description                                                   | Key Parameters                                             | Output             | Notes                                                      |
| --------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- | ------------------ | ---------------------------------------------------------- |
| **mmToUm(mm)**                                                        | Converts millimeters to micrometers.                          | `mm` – length in millimeters                               | Micrometers (µm)   | 1 mm = 1000 µm                                             |
| **umToMm(um)**                                                        | Converts micrometers to millimeters.                          | `um` – length in micrometers                               | Millimeters (mm)   | 1000 µm = 1 mm                                             |
| **bladeTipSpeed(diameter\_mm, rpm)**                                  | Calculates blade tip linear velocity.                         | `diameter_mm` – blade diameter (mm), `rpm` – spindle speed | m/s                | Ideal range: 30–45 m/s                                     |
| **estimateKerf(blade\_thk\_um, wearFactor)**                          | Estimates cut width widening due to blade wear.               | `blade_thk_um`, `wearFactor` (0–1)                         | µm                 | Default scaling coefficient: *k = 0.12*                    |
| **suggestFeed(material, wafer\_thickness\_um)**                       | Suggests optimized feed rate by material and wafer thickness. | `material`, `t_um` – wafer thickness (µm)                  | mm/s               | Clamp 0.2–6.0 mm/s                                         |
| **suggestRPM(material, diameter\_mm, blade\_bond)**                   | Suggests optimal spindle speed for target tip velocity.       | `material`, `diameter_mm`, `blade_bond`                    | rpm                | Range: 8,000–60,000 rpm                                    |
| **estimatePowerKW(material, feed, kerf, t\_um)**                      | Estimates spindle power usage during cut.                     | `material`, `feed`, `kerf`, `t_um`                         | kW                 | Material constant *cMat* varies (Si=0.015, SiC=0.06, etc.) |
| **suggestCoolantLpm(powerKW)**                                        | Recommends coolant flow rate.                                 | `powerKW`                                                  | L/min              | 3 + 6 × powerKW, bounded 1–12                              |
| **chippingRisk(material, feed, tip, t\_um, blade\_thk\_um, coolant)** | Calculates probability of edge chipping.                      | All process inputs                                         | Risk score (0–100) | Lower is safer; <35 = low risk                             |
