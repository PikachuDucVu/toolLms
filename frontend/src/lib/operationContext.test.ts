import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOperationController, currentAuthEpoch, registerWorkflowReset, resetOperationContextForTests, transitionAuthContext } from './operationContext';
afterEach(resetOperationContextForTests);
describe('auth operation context', () => {
  it('increments epoch, aborts controllers, clears query state, then resets workflows', async () => {
    const client = new QueryClient(); client.setQueryData(['private'], { teacher: 'A' });
    const controller = createOperationController(); const reset = vi.fn(); registerWorkflowReset(reset);
    await transitionAuthContext(client);
    expect(currentAuthEpoch()).toBe(1); expect(controller.signal.aborted).toBe(true); expect(client.getQueryData(['private'])).toBeUndefined(); expect(reset).toHaveBeenCalledOnce();
  });
});
