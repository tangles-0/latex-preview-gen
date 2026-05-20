import { notFound } from "next/navigation";

import { ThumbnailJobsDiagnostics } from "@/components/diagnostics/ThumbnailJobsDiagnostics";
import { isDiagPageEnabled } from "@/lib/env";
import { getStatusCounts, listJobs } from "@/lib/jobs/repository";
import type { SortDirection, SortField } from "@/lib/jobs/types";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const sortFields = new Set<SortField>([
  "createdAt",
  "updatedAt",
  "status",
  "attempts",
  "mediaId",
]);
const sortDirections = new Set<SortDirection>(["asc", "desc"]);

const getSingleValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const parseSortField = (value: string | undefined): SortField =>
  value && sortFields.has(value as SortField)
    ? (value as SortField)
    : "createdAt";

const parseSortDirection = (value: string | undefined): SortDirection =>
  value && sortDirections.has(value as SortDirection)
    ? (value as SortDirection)
    : "desc";

const HomePage = async ({ searchParams }: HomePageProps) => {
  if (!isDiagPageEnabled()) {
    notFound();
  }

  const params = await searchParams;
  const selectedStatus = getSingleValue(params.status);
  const sortField = parseSortField(getSingleValue(params.sort));
  const sortDirection = parseSortDirection(getSingleValue(params.direction));
  const [jobs, statusCounts] = await Promise.all([
    listJobs({
      status: selectedStatus || undefined,
      sortField,
      sortDirection,
    }),
    getStatusCounts(),
  ]);

  return (
    <ThumbnailJobsDiagnostics
      jobs={jobs}
      statusCounts={statusCounts.rows}
      failedCount={statusCounts.failedCount}
      selectedStatus={selectedStatus || undefined}
      sortField={sortField}
      sortDirection={sortDirection}
    />
  );
};

export default HomePage;
