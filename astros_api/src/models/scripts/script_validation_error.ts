/**
 * A script the repository refuses to save. `PUT /api/scripts/` answers 400
 * with its message; every other failure there stays a 500. (`POST
 * /api/scripts/copy` keeps answering 500 for any failure.)
 */
export class ScriptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScriptValidationError';
  }
}
