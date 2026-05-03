interface SafeInterpolationOptions {
  allowShellMetachars?: boolean;
  allowedChars?: RegExp;
  maxLength?: number;
}

const DEFAULT_OPTIONS: Required<SafeInterpolationOptions> = {
  allowShellMetachars: false,
  allowedChars: /^[\w\s\-_./@']*$/,
  maxLength: 1000,
};

export function safeInterpolate(
  template: string,
  variables: Record<string, string>,
  options?: SafeInterpolationOptions,
): string {
  const opts: Required<SafeInterpolationOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  return template.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    const value = variables[varName];
    if (value === undefined) {
      return match;
    }

    if (value.length > opts.maxLength) {
      throw new Error('Variable "' + varName + '" exceeds maximum length');
    }

    if (!opts.allowedChars.test(value)) {
      throw new Error('Variable "' + varName + '" contains invalid characters');
    }

    let processedValue = value;

    if (!opts.allowShellMetachars) {
      processedValue = processedValue.replace(/[&|;$`"\\<>()]/g, '\\$&');
    }

    // 在 shell 中，单引号字符串内的单引号需要通过 '\'' 来转义
    // 即关闭单引号，加一个转义的单引号，再打开单引号
    const escaped = processedValue.replace(/'/g, "'\\''");
    return `'${escaped}'`;
  });
}
