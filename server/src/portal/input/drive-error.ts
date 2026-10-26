import type { DriveErrorCode } from '@reticlehq/core';

/** Structured, code-tagged failure so callers branch on cause, not message text. */
export class DriveError extends Error {
  readonly code: DriveErrorCode;
  constructor(code: DriveErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'DriveError';
  }
}
