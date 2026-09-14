import { createOperationController, currentAuthEpoch, isCurrentAuthEpoch, releaseOperationController } from '../../lib/operationContext';

export interface HomeworkContextSnapshot {
  authEpoch: number;
  classId: string;
  generation: number;
}

let activeClassId = '';
let generation = 0;
const controllers = new Set<AbortController>();

export function transitionHomeworkContext(classId: string): number {
  if (classId === activeClassId) return generation;
  generation += 1;
  activeClassId = classId;
  abortHomeworkOperations();
  return generation;
}

export function resetHomeworkContext(): void {
  generation += 1;
  activeClassId = '';
  abortHomeworkOperations();
}

export function captureHomeworkContext(classId: string): HomeworkContextSnapshot {
  return { authEpoch: currentAuthEpoch(), classId, generation };
}

export function isCurrentHomeworkContext(context: HomeworkContextSnapshot): boolean {
  return isCurrentAuthEpoch(context.authEpoch) && context.generation === generation && context.classId === activeClassId;
}

export function createHomeworkOperationController(): AbortController {
  const controller = createOperationController();
  controllers.add(controller);
  controller.signal.addEventListener('abort', () => controllers.delete(controller), { once: true });
  return controller;
}

export function releaseHomeworkOperationController(controller: AbortController): void {
  controllers.delete(controller);
  releaseOperationController(controller);
}

function abortHomeworkOperations(): void {
  for (const controller of controllers) controller.abort();
  controllers.clear();
}
