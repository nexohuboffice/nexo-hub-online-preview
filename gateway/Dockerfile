FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node *.mjs package.json ./
RUN node --test github-gateway.test.mjs http-smoke.test.mjs online-server.test.mjs
ENV NODE_ENV=production
USER node
EXPOSE 8080
CMD ["node", "online-server.mjs"]
