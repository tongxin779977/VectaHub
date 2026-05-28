export interface RegistrationConfig {
  version: string;
  registeredTools: string[];
  templates: {
    enabled: string[];
  };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
