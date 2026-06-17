import { runImproveLoopCli } from "../infra/improve.js";
import { getNonMealSuiteDefinition, improveAdapterFor } from "./adapters.js";

const [suiteId, ...suiteArgs] = process.argv.slice(2);
const definition = getNonMealSuiteDefinition(suiteId);

await runImproveLoopCli(improveAdapterFor(definition), suiteArgs);
