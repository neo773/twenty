import { Client } from 'pg';

type DebuggableClient = Client & {
  debugConnectStack?: string;
  _handleErrorEvent: (error: Error) => void;
};

export const debugTraceUnhandledPgClientErrors = (): void => {
  const clientPrototype = Client.prototype as unknown as DebuggableClient;
  const originalConnect = clientPrototype.connect;
  const originalHandleErrorEvent = clientPrototype._handleErrorEvent;

  clientPrototype.connect = function (
    this: DebuggableClient,
    ...connectArguments: unknown[]
  ) {
    const previousStackTraceLimit = Error.stackTraceLimit;

    Error.stackTraceLimit = 60;
    this.debugConnectStack = new Error('pg client connected here').stack;
    Error.stackTraceLimit = previousStackTraceLimit;

    return (originalConnect as (...args: unknown[]) => unknown).apply(
      this,
      connectArguments,
    );
  } as DebuggableClient['connect'];

  clientPrototype._handleErrorEvent = function (
    this: DebuggableClient,
    error: Error,
  ) {
    if (this.listenerCount('error') === 0) {
      process.stdout.write(
        `[snapshot-debug] pg client without error listener got "${error.message}". ${this.debugConnectStack}\n`,
      );
    }

    return originalHandleErrorEvent.call(this, error);
  };
};
