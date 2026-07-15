.PHONY: build run test lint docker

build:
	go build -o bin/api ./cmd/api

run:
	go run ./cmd/api

test:
	go test -race -cover ./...

lint:
	go vet ./...
	gofmt -l . | grep . && exit 1 || true

docker:
	docker build -t concord/api:dev .

deps:
	go mod download
	go mod tidy
