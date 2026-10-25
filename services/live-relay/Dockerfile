# The bundle (dist/main.cjs) is built before deploy with `npm run build`; it carries ws and the relay rules.
FROM node:22-slim
WORKDIR /app
COPY dist/main.cjs ./main.cjs
ENV NODE_ENV=production
USER node
CMD ["node", "main.cjs"]
