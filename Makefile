.PHONY: help dev prod build up down logs clean restart test

# Default target
.DEFAULT_GOAL := help

# Colors for terminal output
CYAN := \033[0;36m
RESET := \033[0m

help: ## Show this help message
	@echo "$(CYAN)Available commands:$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-15s$(RESET) %s\n", $$1, $$2}'

dev: ## Start development server

build: ## Build the production Docker image
	@echo "$(CYAN)Building production image$(RESET)"
	@docker compose build

up: build ## Start all services (use 'make dev' or 'make prod' instead)
	@echo "$(CYAN)Starting development server on http://localhost:5173$(RESET)"
	@docker compose up -d

down: ## Stop all services
	@docker compose down

logs: ## Show logs (dev or prod, e.g., make logs-dev)
	@docker compose --profile dev logs -f

clean: ## Remove all containers, volumes, and images
	@echo "$(CYAN)Cleaning up Docker resources$(RESET)"
	@docker compose --profile dev --profile prod down -v
	@docker system prune -f

restart: ## Restart development server
	@echo "$(CYAN)Restarting development server$(RESET)"
	@docker compose --profile dev restart

test: ## Run tests
	@echo "$(CYAN)Running tests$(RESET)"
	@docker compose --profile dev run --rm dev npm test

shell: ## Open shell in development container
	@docker compose --profile dev run --rm dev sh

install: ## Install dependencies locally
	@echo "$(CYAN)Installing dependencies$(RESET)"
	@npm install
