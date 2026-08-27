FROM node:24.20.0-bookworm-slim

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci && npx playwright install --with-deps chromium && npm cache clean --force

COPY .prettierrc.json .prettierignore .stylelintrc.json .htmlvalidate.json .markdownlint-cli2.jsonc eslint.config.mjs ./
COPY grader ./grader

ENV CI=true
ENV NODE_ENV=test

CMD ["node", "grader/src/grade.mjs"]
