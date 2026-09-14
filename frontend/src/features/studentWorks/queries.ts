import { queryOptions } from "@tanstack/react-query";
import { fetchStudentWorks } from "./api";

export function studentWorksQuery(classId: string | null | undefined, slotId: string | null | undefined) {
  return queryOptions({
    queryKey: ["studentWorks", classId, slotId] as const,
    queryFn: ({ signal }) => fetchStudentWorks(slotId!, classId!, signal),
    enabled: Boolean(classId && slotId),
    staleTime: 30_000,
  });
}
