import { wrap } from 'comlink';
import { BridgeMethods, methodNames } from './meta';
import type { ProcessorWorkerApi } from '../../../features-worker';
import { abortable } from '../util';

/** How long the worker should be idle before terminating. */
const workerTimeout = 10_000;
/** Upper bound for a single worker RPC. */
const operationTimeout = 120_000;

interface WorkerBridge extends BridgeMethods {}

class WorkerBridge {
  protected _queue = Promise.resolve() as Promise<unknown>;
  /** Worker instance associated with this processor. */
  protected _worker?: Worker;
  /** Comlinked worker API. */
  protected _workerApi?: ProcessorWorkerApi;
  /** ID from setTimeout */
  protected _workerTimeout?: number;

  protected _withOperationTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this._terminateWorker();
        reject(new Error('Worker operation timed out'));
      }, operationTimeout);

      promise.then(
        (value) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      );
    });
  }

  protected _terminateWorker() {
    if (!this._worker) return;
    this._worker.terminate();
    this._worker = undefined;
    this._workerApi = undefined;
  }

  protected _startWorker() {
    const workerURL = new URL(
      '../../../features-worker/index.ts',
      import.meta.url,
    );
    this._worker = new Worker(workerURL, { type: 'module' });
    this._workerApi = wrap<ProcessorWorkerApi>(this._worker);
  }
}

for (const methodName of methodNames) {
  WorkerBridge.prototype[methodName] = function (
    this: WorkerBridge,
    signal: AbortSignal,
    ...args: any
  ) {
    const task = this._queue
      // Keep the queue alive even if the previous task failed.
      .catch(() => undefined)
      .then(async () => {
        if (signal.aborted) throw new DOMException('AbortError', 'AbortError');

        clearTimeout(this._workerTimeout);
        if (!this._worker) this._startWorker();

        const onAbort = () => this._terminateWorker();
        signal.addEventListener('abort', onAbort);

        return this._withOperationTimeout(
          abortable(
            signal,
            // @ts-ignore - TypeScript can't figure this out
            this._workerApi![methodName](...args),
          ),
        ).finally(() => {
          // No longer care about aborting - this task is complete.
          signal.removeEventListener('abort', onAbort);

          // Start a timer to clear up the worker.
          this._workerTimeout = setTimeout(() => {
            this._terminateWorker();
          }, workerTimeout);
        });
      });

    this._queue = task.then(
      () => undefined,
      () => undefined,
    );

    return task;
  } as any;
}

export default WorkerBridge;
