import { queryOptions } from "@tanstack/react-query";
import { fetchStorageProducts, fetchStudentWorks } from "./api";

export function studentWorksQuery(classId: string | null | undefined, slotId: string | null | undefined) {
  return queryOptions({
    queryKey: ["studentWorks", classId, slotId] as const,
    queryFn: ({ signal }) => fetchStudentWorks(slotId!, classId!, signal),
    enabled: Boolean(classId && slotId),
    staleTime: 30_000,
  });
}

export function storageProductsQuery(classId: string | null | undefined) {
  return queryOptions({
    queryKey: ["storageProducts", classId] as const,
    queryFn: ({ signal }) => fetchStorageProducts(classId!, signal),
    enabled: Boolean(classId),
    staleTime: 30_000,
  });
}
