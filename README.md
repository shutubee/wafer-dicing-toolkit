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
| **chippingRisk(material, feed, tip, t\_um, blade\_thk\_um, coolant)** | Calculates probability of edge chipping.                      | 
All process inputs                                         | Risk score (0–100) | Lower is safer; <35 = low risk                             |



B.Geometry and Yield


| Function                                                          | Description                           | Parameters             | Output                 | Example                                                      |
| ----------------------------------------------------------------- | ------------------------------------- | ---------------------- | ---------------------- | ------------------------------------------------------------ |
| **dieCount(wafer\_diam\_mm, die\_w\_mm, die\_h\_mm, street\_um)** | Estimates die layout and usable dies. | Wafer and die geometry | `{cols, rows, usable}` | 300 mm wafer, 5×5 mm dies, 60 µm street → \~2700 usable dies |


C. Vacuum Range


| Function                           | Description                                    | Input                                 | Output            | Notes                                 |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------- | ----------------- | ------------------------------------- |
| **vacuumRangeForChuck(chuckType)** | Provides expected vacuum range for chuck type. | `"Standard"`, `"HighVac"`, `"LowVac"` | `{lo, hi}` in kPa | Ensures wafer stability during dicing |


D. CSV Parsing

| Function           | Description                                  | Input Format                         | Output                    | Notes                                |
| ------------------ | -------------------------------------------- | ------------------------------------ | ------------------------- | ------------------------------------ |
| **parseCSV(text)** | Parses wafer map CSV to count good/bad dies. | `x,y,status` or `die_x,die_y,status` | Array of `{x, y, status}` | Used in *Map* tab to calculate yield |


Key Parameters :

| Parameter           | Unit                   | Meaning / Description                           |
| ------------------- | ---------------------- | ----------------------------------------------- |
| **rpm**             | revolutions per minute | Blade spindle rotation speed                    |
| **feed**            | mm/s                   | Feed rate (table advance per second)            |
| **kerf**            | µm                     | Cut width (increases with wear)                 |
| **tip speed**       | m/s                    | Linear edge velocity of blade                   |
| **coolant flow**    | L/min                  | Flow rate of coolant to dissipate heat          |
| **die pitch (X/Y)** | mm                     | Die width/height + street width                 |
| **street**          | µm                     | Separation channel between dies                 |
| **wear factor**     | 0–1                    | Fractional measure of blade wear                |
| **vacuum level**    | kPa                    | Chuck vacuum pressure for wafer fixation        |
| **wafer thickness** | µm                     | Total wafer thickness, affects feed and RPM     |
| **cMat**            | —                      | Material-dependent power coefficient            |
| **risk score**      | 0–100                  | Estimated chipping/defect probability           |
| **usable dies**     | count                  | Estimated good dies after excluding edge losses |




