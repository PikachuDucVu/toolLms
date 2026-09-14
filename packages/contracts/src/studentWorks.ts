import { z } from "zod";
import { EntityIdSchema, successEnvelope } from "./common";

export const RelatedUrlSchema = z.object({
  name: z.string().max(500),
  url: z.string().max(2000),
});
export type RelatedUrl = z.infer<typeof RelatedUrlSchema>;

export const StudentWorkLatestDataSchema = z.object({
  title: z.string().max(500),
  thumbnail: z.string().max(2000).default(""),
  videoUrls: z.array(z.string().max(2000)).default([]),
  imageUrl: z.array(z.string().max(2000)).default([]),
  attachmentUrls: z.array(z.string().max(2000)).default([]),
  comment: z.string().max(30_000).default(""),
  rejectReason: z.string().max(2000).nullable().default(null),
  relatedUrls: z.array(RelatedUrlSchema).default([]),
});
export type StudentWorkLatestData = z.infer<typeof StudentWorkLatestDataSchema>;

export const StudentWorkSchema = z.object({
  id: EntityIdSchema,
  status: z.string().max(100),
  studentId: EntityIdSchema,
  classSessionId: EntityIdSchema,
  classId: EntityIdSchema,
  version: z.number().int().default(1),
  displayOrder: z.number().int().default(0),
  latestData: StudentWorkLatestDataSchema,
  createdBy: z.object({ displayName: z.string().nullable() }).nullable().optional(),
  createdAt: z.string().nullable().optional(),
  lastModifiedBy: z.object({ displayName: z.string().nullable() }).nullable().optional(),
  lastModifiedAt: z.string().nullable().optional(),
});
export type StudentWork = z.infer<typeof StudentWorkSchema>;

export const StudentWorksResponseSchema = successEnvelope(z.object({
  studentWorks: z.array(StudentWorkSchema).max(500),
}));
export type StudentWorksResponse = z.infer<typeof StudentWorksResponseSchema>;

export const SaveStudentWorkInputSchema = z.object({
  id: EntityIdSchema.optional(),
  classId: EntityIdSchema,
  classSessionId: EntityIdSchema,
  studentId: EntityIdSchema,
  displayOrder: z.number().int().default(0),
  classSessionNumber: z.number().int().optional(),
  title: z.string().trim().min(1, "Vui lòng nhập tên sản phẩm").max(500),
  thumbnail: z.string().max(2000).optional().default(""),
  videoUrls: z.array(z.string().max(2000)).optional().default([]),
  imageUrl: z.array(z.string().max(2000)).optional().default([]),
  attachmentUrls: z.array(z.string().max(2000)).optional().default([]),
  comment: z.string().max(30_000).optional().default(""),
  rejectReason: z.string().max(2000).optional().default(""),
  relatedUrls: z.array(RelatedUrlSchema).optional().default([]),
});
export type SaveStudentWorkInput = z.infer<typeof SaveStudentWorkInputSchema>;

export const SaveStudentWorkResponseSchema = successEnvelope(z.object({
  studentWork: StudentWorkSchema,
}));
export type SaveStudentWorkResponse = z.infer<typeof SaveStudentWorkResponseSchema>;

export const DeleteStudentWorkResponseSchema = successEnvelope(z.object({
  id: EntityIdSchema,
  deleted: z.boolean(),
}));
export type DeleteStudentWorkResponse = z.infer<typeof DeleteStudentWorkResponseSchema>;

export const UploadResourceResponseSchema = successEnvelope(z.object({
  link: z.string(),
  url: z.string(),
}));
export type UploadResourceResponse = z.infer<typeof UploadResourceResponseSchema>;
