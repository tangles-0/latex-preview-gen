# Latex preview worker

Self-hosted Next.js worker for Latex thumbnails, YouTube ingestion, and queued
image generation.

## Agent / AI development

Project guidance lives in:

- `.cursor/skills/web-implementation/`
- `.cursor/skills/web-testing/`
- `.cursor/skills/agentic-continuity/`

Run tests with `pnpm test`.

## Production container

The included multi-stage `Dockerfile` builds the Next.js standalone output on
Node 22 and installs the media tools used by the worker (`ffmpeg`,
`pdftoppm`, LibreOffice, fonts, and yt-dlp). The runtime process runs as the
unprivileged `nextjs` user.

Build and run it with mounted writable scratch directories:

```sh
docker build -t latex-preview-gen .
docker run --rm -p 3000:3000 --env-file .env \
  -v latex-preview-data:/app/data latex-preview-gen
```

Apply database schema changes before deploying a new image:

```sh
pnpm db:push
```

## Thumbnail queue

Thumbnail jobs are claimed durably in PostgreSQL. `PREVIEW_CONCURRENCY`
controls the maximum number of active thumbnail claims across worker
processes/containers that share the database. It defaults to `2` and is
clamped to `1..16`. Failed attempts are returned to the queue with exponential
backoff; the third failed attempt is terminal.

Set `IMAGE_GENERATION_ENABLED=false` when sharing a database with a latex node
that only provisions the thumbnail queue. The node Compose stack sets this
automatically.

`DOWNLOAD_PATH`, `THUMBNAIL_PATH`, and `LATEX_PREVIEW_TMP_DIR` are scratch
locations. Downloaded sources and generated thumbnails are removed after each
attempt, including successful and terminal attempts.

## Node-local source paths

The authenticated `POST /api/thumbnail-jobs` payload accepts exactly one of:

```json
{
  "downloadUrl": "https://latex.example.com/api/media/id/download"
}
```

or:

```json
{
  "localSourcePath": "documents/example.pdf"
}
```

Local ingest is disabled unless `NODE_LIBRARY_PATH` is configured. Relative
paths resolve beneath that root; absolute paths must already be beneath it.
The worker rejects traversal, directories, missing files, and symlinks, then
validates the path again immediately before processing. Mount the library
read-only in production:

```sh
docker run --rm --env-file .env \
  -v /srv/latex-library:/mnt/latex-library:ro \
  -e NODE_LIBRARY_PATH=/mnt/latex-library \
  latex-preview-gen
```

Local sources are never removed or copied into the download scratch area.
For local-source jobs the authenticated callback sends the generated scratch
path instead of a base64 image. The node app reads that path from the shared,
read-only scratch mount, writes its `sm`/`lg` library variants, and returns
before the worker removes the scratch file. `LATEX_API_BASE_URL` and
`LATEX_OUTGOING_API_SECRET_KEY` remain required.
