FROM node:22-bookworm AS frontend-build
WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend ./
RUN npm run build

FROM golang:1.25 AS build
WORKDIR /src/backend

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend ./
COPY --from=frontend-build /frontend/dist ./web/dist
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -tags embedui -o /out/agilerr .

FROM debian:bookworm-slim
WORKDIR /app

RUN useradd --system --create-home --uid 10001 agilerr

COPY --from=build /out/agilerr /app/agilerr

ENV HTTP_ADDR=0.0.0.0:8090
EXPOSE 8090

USER agilerr
CMD ["/app/agilerr"]
