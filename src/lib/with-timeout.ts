/** Races `work` against a timer; a rejection after the timeout won never becomes an unhandled rejection. */
export async function withTimeout<T>(work: PromiseLike<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    });
    const pending = Promise.resolve(work);
    pending.catch(() => undefined);
    return await Promise.race([pending, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
