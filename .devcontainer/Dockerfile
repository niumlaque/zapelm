FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bullseye

ARG NODE_UID=1000
ARG NODE_GID=1000

RUN if [ "$(id -u node)" != "$NODE_UID" ] || [ "$(id -g node)" != "$NODE_GID" ]; then \
      groupmod -g "$NODE_GID" node && \
      usermod -u "$NODE_UID" node && \
      chown -R node:node /home/node; \
    fi

ENV NODE_ENV=development
