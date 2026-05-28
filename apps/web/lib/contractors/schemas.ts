import { z } from "zod";

export const ContractorStatusEnum = z.enum(["active", "expired", "terminated"]);
export type ContractorStatus = z.infer<typeof ContractorStatusEnum>;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a date in YYYY-MM-DD format");

export const CreateContractorSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(100),
  last_name: z.string().min(1, "Last name is required").max(100),
  email: z.string().email("Must be a valid email address").max(255),
  start_date: isoDate,
  end_date: isoDate,
  sponsor_user_id: z.string().min(1, "Sponsor is required"),
  external_ref: z.string().max(255).optional().nullable(),
  attributes: z
    .string()
    .optional()
    .nullable()
    .refine((val) => {
      if (!val || val.trim() === "") return true;
      try {
        JSON.parse(val);
        return true;
      } catch {
        return false;
      }
    }, "Must be valid JSON"),
});

export type CreateContractorInput = z.infer<typeof CreateContractorSchema>;

export const UpdateContractorSchema = CreateContractorSchema.partial().extend({
  deleted_at: z.null().optional(),
});

export type UpdateContractorInput = z.infer<typeof UpdateContractorSchema>;

export type ContractorRow = {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  email: string;
  startDate: string;
  endDate: string;
  sponsorUserId: string | null;
  sponsorName: string | null;
  externalRef: string | null;
  attributes: string | null;
  status: ContractorStatus;
  deletedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type OrgMember = {
  userId: string;
  name: string | null;
  email: string;
};
