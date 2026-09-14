import { AppShell } from '../components/layout/AppShell';
import { AssessmentNavigationGuard } from '../features/assessments';
import { CommentsWorkspace } from '../features/classes/CommentsWorkspace';

export function CommentsRoute() {
  return <><AssessmentNavigationGuard /><AppShell><CommentsWorkspace /></AppShell></>;
}
