FROM node:22.17.0-alpine

RUN apk add --no-cache docker-cli tar
WORKDIR /app
COPY package.json main.js healthcheck.js ./
COPY lib ./lib

ENV NODE_ENV=production
EXPOSE 3100
CMD ["node", "main.js"]
