import { runHillClimbCli } from "../infra/hill-climb.js";
import { getNonMealSuiteDefinition, hillClimbAdapterFor } from "./adapters.js";

const [suiteId, ...suiteArgs] = process.argv.slice(2);
const definition = getNonMealSuiteDefinition(suiteId);

await runHillClimbCli(hillClimbAdapterFor(definition), suiteArgs);
