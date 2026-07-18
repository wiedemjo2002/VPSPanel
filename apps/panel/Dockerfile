FROM node:22.17.0-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY main.js healthcheck.js ./
COPY lib ./lib
COPY public ./public

ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "main.js"]
