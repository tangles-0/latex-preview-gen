import type { ThumbnailGenerationJob } from "@/db/schema";
import type { SortDirection, SortField } from "@/lib/jobs/types";

type StatusCount = {
  status: string;
  count: number;
};

type ThumbnailJobsDiagnosticsProps = {
  jobs: ThumbnailGenerationJob[];
  statusCounts: StatusCount[];
  failedCount: number;
  selectedStatus?: string;
  sortField: SortField;
  sortDirection: SortDirection;
};

const statuses = [
  "pending",
  "downloading",
  "downloaded",
  "started",
  "creating",
  "created",
  "uploading",
  "complete",
  "failed",
];

const formatDate = (date: Date | null) =>
  date
    ? new Intl.DateTimeFormat("en-AU", {
        dateStyle: "short",
        timeStyle: "medium",
      }).format(date)
    : "-";

const nextSortDirection = (
  currentField: SortField,
  sortField: SortField,
  sortDirection: SortDirection,
): SortDirection =>
  currentField === sortField && sortDirection === "desc" ? "asc" : "desc";

export const ThumbnailJobsDiagnostics = ({
  jobs,
  statusCounts,
  failedCount,
  selectedStatus,
  sortField,
  sortDirection,
}: ThumbnailJobsDiagnosticsProps) => {
  const buildSortHref = (field: SortField) => {
    const params = new URLSearchParams();

    if (selectedStatus) {
      params.set("status", selectedStatus);
    }

    params.set("sort", field);
    params.set("direction", nextSortDirection(field, sortField, sortDirection));

    return `/?${params.toString()}`;
  };

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-8 text-neutral-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-cyan-300">
            Latex preview generator
          </p>
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight">
                Thumbnail generation jobs
              </h1>
              <p className="mt-2 max-w-2xl text-neutral-400">
                Local diagnostics for webhook-created preview tasks, retries,
                and upload acknowledgements.
              </p>
            </div>
            <form
              action="/"
              className="flex flex-col gap-2 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:flex-row sm:items-end"
            >
              <label className="flex flex-col gap-2 text-sm text-neutral-300">
                Status
                <select
                  name="status"
                  defaultValue={selectedStatus ?? ""}
                  className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100"
                >
                  <option value="">All statuses</option>
                  {statuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              <input type="hidden" name="sort" value={sortField} />
              <input type="hidden" name="direction" value={sortDirection} />
              <button
                type="submit"
                className="rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-cyan-200"
              >
                Filter
              </button>
            </form>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">Total visible</p>
            <p className="mt-2 text-3xl font-semibold">{jobs.length}</p>
          </div>
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="text-sm text-neutral-400">Failed</p>
            <p className="mt-2 text-3xl font-semibold text-red-300">
              {failedCount}
            </p>
          </div>
          {statusCounts.slice(0, 2).map((row) => (
            <div
              key={row.status}
              className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
            >
              <p className="text-sm text-neutral-400">{row.status}</p>
              <p className="mt-2 text-3xl font-semibold">{row.count}</p>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-800 text-sm">
              <thead className="bg-neutral-900/80 text-left text-xs uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="px-4 py-3">
                    <a href={buildSortHref("mediaId")}>Media ID</a>
                  </th>
                  <th className="px-4 py-3">
                    <a href={buildSortHref("status")}>Status</a>
                  </th>
                  <th className="px-4 py-3">
                    <a href={buildSortHref("attempts")}>Attempts</a>
                  </th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">MIME type</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">
                    <a href={buildSortHref("createdAt")}>Created</a>
                  </th>
                  <th className="px-4 py-3">
                    <a href={buildSortHref("updatedAt")}>Updated</a>
                  </th>
                  <th className="px-4 py-3">Last error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {jobs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-10 text-center text-neutral-400"
                    >
                      No jobs match the current filter.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.mediaId} className="align-top">
                      <td className="max-w-72 break-all px-4 py-3 font-mono text-xs text-cyan-200">
                        {job.mediaId}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-neutral-800 px-2 py-1 text-xs">
                          {job.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">{job.attempts}</td>
                      <td className="px-4 py-3 text-neutral-300">
                        {job.contentType}
                      </td>
                      <td className="px-4 py-3 text-neutral-300">
                        {job.mimeType}
                      </td>
                      <td className="px-4 py-3">
                        {job.generationDurationMs === null
                          ? "-"
                          : `${job.generationDurationMs}ms`}
                      </td>
                      <td className="px-4 py-3 text-neutral-300">
                        {formatDate(job.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-neutral-300">
                        {formatDate(job.updatedAt)}
                      </td>
                      <td className="max-w-96 break-words px-4 py-3 text-red-200">
                        {job.lastError ?? job.failureReason ?? "-"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
};
