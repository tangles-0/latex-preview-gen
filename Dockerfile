FROM node:22-bookworm-slim AS dependencies

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.16.1 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS builder

COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runner

ARG TARGETARCH

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV YT_DLP_BINARY_PATH=/app/binaries
ENV YT_DLP_BINARY=yt-dlp-wrapper.sh
ENV YT_DLP_REAL_BINARY=/app/binaries/yt-dlp
ENV YT_DLP_JS_RUNTIME=node

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    fontconfig \
    fonts-dejavu \
    fonts-liberation \
    libreoffice \
    poppler-utils \
    tini \
  && case "$TARGETARCH" in \
    "arm64") yt_dlp_asset="yt-dlp_linux_aarch64" ;; \
    *) yt_dlp_asset="yt-dlp_linux" ;; \
  esac \
  && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/${yt_dlp_asset}" \
    -o /usr/local/bin/yt-dlp \
  && chmod 0755 /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nextjs \
  && useradd --system --uid 1001 --gid nextjs --create-home nextjs

ARG IMAGE_VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/tangles-0/latex-preview-gen"
LABEL org.opencontainers.image.version="${IMAGE_VERSION}"

COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/binaries/yt-dlp-wrapper.sh ./binaries/yt-dlp-wrapper.sh

RUN chmod 0755 ./binaries/yt-dlp-wrapper.sh \
  && ln -s /usr/local/bin/yt-dlp ./binaries/yt-dlp \
  && mkdir -p data/downloads data/thumbnails data/tmp data/image-generations \
  && chown -R nextjs:nextjs /app

USER nextjs

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server.js"]
