/**
 * A script the repository refuses to save. Its message is the client-facing
 * reason (scripts_controller's saveScript answers 400 with it).
 */
export class ScriptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScriptValidationError';
  }
}
