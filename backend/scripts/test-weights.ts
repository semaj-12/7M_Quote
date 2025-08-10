import path from "path";
import { computeWeightFromDatasets } from "../services/estimation/weightEngine";

(async () => {
  const sample1 = { item: '2" Sch 40 pipe', lengthFt: 12, qty: 3 } as any;
  const sample2 = { item: 'C8x18 Channel', lengthFt: 20, qty: 2 } as any;
  const sample3 = { item: 'Sheet plate', size: "197.07 sf", thicknessIn: 0.25, qty: 1 } as any;

  console.log("pipe 2\" Sch40, 12ft x3 =", computeWeightFromDatasets(sample1));
  console.log("C8x18, 20ft x2      =", computeWeightFromDatasets(sample2));
  console.log("Plate 197.07sf x 1/4=", computeWeightFromDatasets(sample3));
})();
