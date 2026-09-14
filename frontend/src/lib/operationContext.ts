import type { QueryClient } from '@tanstack/react-query';

let authEpoch = 0;
const controllers = new Set<AbortController>();
const workflowResets = new Set<() => void>();

export function currentAuthEpoch(): number { return authEpoch; }
export function isCurrentAuthEpoch(epoch: number): boolean { return epoch === authEpoch; }

export function createOperationController(): AbortController {
  const controller = new AbortController();
  controllers.add(controller);
  controller.signal.addEventListener('abort', () => controllers.delete(controller), { once: true });
  return controller;
}

export function releaseOperationController(controller: AbortController): void {
  controllers.delete(controller);
}

export function registerWorkflowReset(reset: () => void): () => void {
  workflowResets.add(reset);
  return () => workflowResets.delete(reset);
}

export async function transitionAuthContext(queryClient: QueryClient): Promise<number> {
  authEpoch += 1;
  for (const controller of controllers) controller.abort();
  controllers.clear();
  await queryClient.cancelQueries();
  queryClient.clear();
  for (const reset of workflowResets) reset();
  return authEpoch;
}

export function resetOperationContextForTests(): void {
  authEpoch = 0;
  controllers.clear();
  workflowResets.clear();
}
