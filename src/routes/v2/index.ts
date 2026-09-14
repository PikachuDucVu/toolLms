import { Hono } from 'hono';
import type { Env } from '../../types';
import { requestContext, type RequestContextVariables } from '../../middleware/requestContext';
import { v2Security } from '../../middleware/v2Security';
import { v2Error, v2Success } from './helpers';
import { v2AuthRoutes } from './auth';
import { v2ConfigRoutes, v2ModelsRoutes } from './config';
import { v2ClassesRoutes } from './classes';
import { v2AssessmentsRoutes } from './assessments';
import { v2ClassHomeworkRoutes, v2HomeworkRoutes } from './homework';
import { v2CommentsRoutes, v2SlotCommentsRoutes } from './comments';
import { v2CheckpointClassRoutes, v2CheckpointRoutes, v2CheckpointSlotRoutes } from './checkpoints';
import { v2DemoSlotRoutes } from './demos';
import { v2SlotStudentWorkRoutes, v2ResourceRoutes } from './studentWorks';
import { LmsAuthenticationError } from '../../services/lmsClient';
import { buildExpiredSessionCookie, destroySession } from '../../services/sessionService';
import { matchedRouteTemplate, structuredLog } from '../../observability/structuredLogger';

export const v2Routes = new Hono<{ Bindings: Env; Variables: RequestContextVariables }>();

v2Routes.use('*', requestContext);
v2Routes.use('*', v2Security);
v2Routes.get('/health', (c) => v2Success(c, { status: 'ok', version: 'v2' }));
v2Routes.route('/auth', v2AuthRoutes);
v2Routes.route('/config', v2ConfigRoutes);
v2Routes.route('/ai', v2ModelsRoutes);
v2Routes.route('/classes', v2ClassesRoutes);
v2Routes.route('/classes', v2ClassHomeworkRoutes);
v2Routes.route('/classes', v2CheckpointClassRoutes);
v2Routes.route('/slots', v2AssessmentsRoutes);
v2Routes.route('/slots', v2SlotCommentsRoutes);
v2Routes.route('/slots', v2CheckpointSlotRoutes);
v2Routes.route('/slots', v2DemoSlotRoutes);
v2Routes.route('/slots', v2SlotStudentWorkRoutes);
v2Routes.route('/resources', v2ResourceRoutes);
v2Routes.route('/comments', v2CommentsRoutes);
v2Routes.route('/checkpoints', v2CheckpointRoutes);
v2Routes.route('/homework', v2HomeworkRoutes);

v2Routes.notFound((c) => v2Error(c, 'NOT_FOUND', 'Không tìm thấy API.', 404));
v2Routes.onError(async (error, c) => {
  if (error instanceof LmsAuthenticationError) {
    await destroySession(c.env, c.req.raw);
    c.header('Set-Cookie', buildExpiredSessionCookie(c.req.raw));
    return v2Error(c, 'AUTH_REQUIRED', 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.', 401);
  }
  structuredLog('error', {
    requestId: c.get('requestId'),
    route: matchedRouteTemplate(c),
    method: c.req.method,
    status: 500,
    category: 'internal',
  });
  return v2Error(c, 'INTERNAL_ERROR', 'Đã xảy ra lỗi máy chủ.', 500);
});
