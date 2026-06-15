import type { Env, GradingQueueMessage } from "./types";
import { app } from "./router";
import { processGradingBatch } from "./queues/gradingConsumer";

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return Promise.resolve(app.fetch(request, env, ctx));
  },
  async queue(batch: MessageBatch<GradingQueueMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(processGradingBatch(batch, env));
  },
};
