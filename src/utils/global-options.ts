export interface GlobalOptions {
  verbose: boolean;
  debug: boolean;
}

let globalOptions: GlobalOptions = {
  verbose: false,
  debug: false,
};

export function setGlobalOptions(options: Partial<GlobalOptions>): void {
  globalOptions = { ...globalOptions, ...options };
}

export function getGlobalOptions(): GlobalOptions {
  return { ...globalOptions };
}

export function isVerbose(): boolean {
  return globalOptions.verbose || globalOptions.debug;
}

export function isDebug(): boolean {
  return globalOptions.debug;
}
