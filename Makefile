all: install-types build-types install-lib build-lib install-repo build-cli build-cli-nix build-web build-web-docker build-web-nix
	@echo "Built everything!"

install-types:
	cd packages/template-types-lib && bun i
	@echo "Installed types!"

it: install-types

build-types:
	cd packages/template-types-lib && bun run build
	@echo "Built types!"

bt: build-types

install-lib:
	cd packages/skaff-lib && bun i
	@echo "Installed lib!"

il: install-lib

build-lib:
	cd packages/skaff-lib && bun run build
	@echo "Built lib!"

bl: build-lib

install-repo:
	bun i
	@echo "Installed repo!"

ir: install-repo

build-cli:
	cd apps/cli && bun run build:dist
	@echo "Built CLI!"

bc: build-cli

build-cli-nix:
	nix build .

bcn: build-cli-nix

build-web:
	cd apps/web && bun run build
	@echo "Built web!"

bw: build-web

build-web-docker:
	cd apps/web && ./docker/build.sh
	@echo "Built web Docker image!"

bwd: build-web-docker

run-cli:
	cd apps/cli && ./bin/run.js
	@echo "Ran CLI!"

rc: run-cli

run-cli-nix:
	nix run
	@echo "Ran CLI via Nix!"

rcn: run-cli-nix

run-web:
	cd apps/web && bun run start
	@echo "Ran web!"

rw: run-web

run-web-docker:
	docker run -p 3000:3000 -v ~/projects/templated:/projects timonteutelink/skaff:latest
	@echo "Ran web Docker image!"

rwd: run-web-docker

run-web-docker-compose:
	cd apps/web && docker compose -f docker/docker-compose.yml up --build
	@echo "Ran web Docker image via Docker Compose!"

rwdc: run-web-docker-compose

dev-web:
	cd apps/web && bun run dev
	@echo "Running web in dev mode!"

dw: dev-web
