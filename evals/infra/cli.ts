export function argValue(args: string[], name: string) {
  const index = args.indexOf(name);
  const equalsValue = args.find((arg) => arg.startsWith(`${name}=`));
  if (equalsValue) return equalsValue.slice(name.length + 1);

  const bareName = name.replace(/^--/, "");
  const bareEqualsValue = args.find((arg) => arg.startsWith(`${bareName}=`));
  if (bareEqualsValue) return bareEqualsValue.slice(bareName.length + 1);

  return index >= 0 ? args[index + 1] : undefined;
}

export function hasToken(args: string[], name: string) {
  const bareName = name.replace(/^--/, "");
  return args.includes(name) || args.includes(bareName);
}

export function firstPositionalArg(args: string[], options: PositionalArgOptions = {}) {
  return positionalArgs(args, options)[0];
}

export function positionalArgs(args: string[], options: PositionalArgOptions = {}) {
  const positionals: string[] = [];
  const flagsWithValues = new Set(options.flagsWithValues ?? []);
  const ignoredBareTokens = new Set(options.ignoredBareTokens ?? []);
  const ignoredAssignments = options.ignoredAssignments ?? [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) continue;
    if (arg.startsWith("--")) {
      if (flagsWithValues.has(arg)) index += 1;
      continue;
    }

    if (ignoredBareTokens.has(arg)) continue;
    if (ignoredAssignments.some((prefix) => arg.startsWith(`${prefix}=`))) continue;
    if (!arg.startsWith("-")) positionals.push(arg);
  }

  return positionals;
}

interface PositionalArgOptions {
  flagsWithValues?: string[];
  ignoredBareTokens?: string[];
  ignoredAssignments?: string[];
}
