import { inspect } from 'util';

class ErrorBase extends Error {
  constructor(public kind: string, public override message: string) {
    super(message);
    this.name = kind;

    Object.setPrototypeOf(this, ErrorBase.prototype);
  }

  get [Symbol.toStringTag](): string {
    return this.kind;
  }

  override toString(): string {
    return `${this.kind}: ${this.message}`;
  }
}

export class UnexpectedError extends ErrorBase {
  constructor(public override message: string) {
    super('UnexpectedError', message);
  }
}

export class MapUndefinedError extends ErrorBase {
  constructor(profile: string, provider: string) {
    super(
      'MapUndefinedError',
      `Map for ${profile} and ${provider} does not exist. Use \`superface create --map --profileId ${profile} --providerName ${provider}\` to create it.`
    );
  }
}

export class ComponentUndefinedError extends ErrorBase {
  constructor(component: 'Client' | 'Profile' | 'Provider' | 'UseCase') {
    super('ComponentUndefinedError', `Undefined ${component}`);
  }
}

export class FixturesPathUndefinedError extends ErrorBase {
  constructor() {
    super('FixturePathUndefinedError', 'Fixture path missing.');
  }
}

export class RecordingPathUndefinedError extends ErrorBase {
  constructor() {
    super('RecordingPathUndefinedError', 'Recording path missing.');
  }
}

export class InstanceMissingError extends ErrorBase {
  constructor(component: 'Profile' | 'Provider' | 'UseCase') {
    super('InstanceMissingError', `Should be ${component} instance.`);
  }
}

export class SuperJsonNotFoundError extends ErrorBase {
  constructor() {
    super('SuperJsonNotFoundError', 'No super.json found.');
  }
}

export class RecordingsNotFoundError extends ErrorBase {
  constructor() {
    super(
      'RecordingsNotFoundError',
      'Recordings could not be found for running mocked tests. You must call the live API first to record API traffic. Use the environment variable SUPERFACE_LIVE_API to call the API and record traffic. See https://github.com/superfaceai/testing-lib#recording for details.'
    );
  }
}

export function assertIsIOError(
  error: unknown
): asserts error is { code: string } {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err: Record<string, any> = error;
    if (typeof err.code === 'string') {
      return;
    }
  }

  throw new UnexpectedError(`${inspect(error)}`);
}
