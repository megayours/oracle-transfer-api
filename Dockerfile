# use the official Bun image
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# install dependencies into temp directory
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
COPY package.json bun.lock /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# copy node_modules from temp directory
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# [optional] tests & build
ENV NODE_ENV=production
RUN bun test
#RUN bun run build

# copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/*.ts .
COPY --from=prerelease /usr/src/app/package.json .

# Install gosu for privilege dropping
RUN apt-get update && \
    apt-get install -y --no-install-recommends gosu && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Add to release stage
RUN mkdir -p /var/lib/oracle-transfer && \
    chown -R bun:bun /var/lib/oracle-transfer && \
    chmod 755 /var/lib/oracle-transfer

RUN mkdir -p /usr/src/app/data && \
    chown -R bun:bun /usr/src/app/data && \
    chmod 755 /usr/src/app/data

# Create /tmp directory and set permissions
RUN mkdir -p /tmp && chown bun:bun /tmp

# Add entrypoint script
COPY entrypoint.sh /usr/src/app/entrypoint.sh
RUN chmod +x /usr/src/app/entrypoint.sh

# Use the entrypoint script
ENTRYPOINT ["/usr/src/app/entrypoint.sh"]
CMD ["bun", "run", "index.ts"]