export interface ValidatedGameAction {
  action: string;
  payload: Record<string, unknown>;
  userId: string;
  sessionId: string;
}

export interface GameActionResult {
  success: boolean;
  state: Record<string, unknown>;
  events: Array<{ type: string; payload: Record<string, unknown> }>;
  error?: string;
}

export interface GameActionValidator {
  validate(action: ValidatedGameAction): { valid: boolean; error?: string };
}
