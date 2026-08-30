FROM node:24.19.0-bookworm-slim@sha256:a9f5f7c91a432850b2a8a7797adf5eadb6c733ceed61167806cee7ea7fbc29df

WORKDIR /workspace
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
RUN npm ci \
    && npx playwright install --with-deps chromium \
    && chmod -R a+rX "$PLAYWRIGHT_BROWSERS_PATH" \
    && npm cache clean --force

COPY shared ./shared
COPY reports/output.mjs reports/browser-html.mjs reports/browser-artifacts.mjs ./reports/
COPY docker-grader ./docker-grader

ENV CI=true
