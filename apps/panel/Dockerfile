FROM node:22.17.0-alpine

WORKDIR /app
COPY package.json ./
COPY server.js healthcheck.js ./
COPY public ./public

ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "server.js"]
