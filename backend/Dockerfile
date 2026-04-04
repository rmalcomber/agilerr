FROM golang:1.25 AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/agilerr .

FROM debian:bookworm-slim
WORKDIR /app

RUN useradd --system --create-home --uid 10001 agilerr

COPY --from=build /out/agilerr /app/agilerr

ENV HTTP_ADDR=0.0.0.0:8090
EXPOSE 8090

USER agilerr
CMD ["/app/agilerr"]
