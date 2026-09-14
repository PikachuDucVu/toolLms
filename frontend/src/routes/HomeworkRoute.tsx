import { AppShell } from '../components/layout/AppShell';
import { HomeworkPage } from '../features/homework/HomeworkPage';

export function HomeworkRoute() {
  return <AppShell page="homework" showConfig={false}><HomeworkPage /></AppShell>;
}
