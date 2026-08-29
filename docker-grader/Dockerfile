FROM node:24.19.0-bookworm-slim

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
