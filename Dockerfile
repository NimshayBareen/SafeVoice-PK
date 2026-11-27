# Builds the web app and serves it together with the API from one container (used for online hosting).
FROM node:20-alpine AS web
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend ./
RUN npm run build

FROM node:20-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend ./
COPY --from=web /app/frontend/dist /app/frontend/dist
ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000
# "npm start" creates/updates the tables, loads the starter knowledge base, then starts the server
CMD ["npm", "start"]
