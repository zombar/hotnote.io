.PHONY: help init dev prod build up down logs clean restart test coverage lint format lint-html lint-css check-unused check-size validate

# Default target
.DEFAULT_GOAL := help

# Colors for terminal output
CYAN := \033[0;36m
RESET := \033[0m

help: ## Show this help message
	@echo "$(CYAN)Available commands:$(RESET)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-15s$(RESET) %s\n", $$1, $$2}'

init: ## Install dev tools (brew packages) and set up pre-commit hooks
	@echo "$(CYAN)Installing development tools$(RESET)"
	@command -v brew >/dev/null 2>&1 || { echo "Error: Homebrew not installed. Visit https://brew.sh"; exit 1; }
	@echo "$(CYAN)Installing brew packages$(RESET)"
	@brew install node yamllint
	@echo "$(CYAN)Installing npm dependencies and setting up git hooks$(RESET)"
	@npm install
	@echo "$(CYAN)✓ Development environment ready!$(RESET)"

dev: ## Start development server

build: ## Build the production Docker image
	@echo "$(CYAN)Building production image$(RESET)"
	@docker compose build --no-cache

up: build ## Start all services (use 'make dev' or 'make prod' instead)
	@echo "$(CYAN)Starting development server on http://localhost:5173$(RESET)"
	@docker compose up --detach --force-recreate

down: ## Stop all services
	@docker compose down

logs: ## Show logs (dev or prod, e.g., make logs-dev)
	@docker compose logs -f

clean: ## Remove all containers, volumes, and images
	@echo "$(CYAN)Cleaning up Docker resources$(RESET)"
	@docker compose down -v
	@docker system prune -f

restart: ## Restart development server
	@echo "$(CYAN)Restarting development server$(RESET)"
	@docker compose restart

test: ## Run tests and all validation checks
	@echo "$(CYAN)Running app tests$(RESET)"
	@npm test -- --run
	@echo "$(CYAN)Running infrastructure tests$(RESET)"
	@npm run test:infra
	@echo "$(CYAN)Running validation checks$(RESET)"
	@$(MAKE) validate

coverage: ## Run tests with coverage report
	@echo "$(CYAN)Running tests with coverage$(RESET)"
	@npm run test:coverage

lint: ## Run ESLint
	@echo "$(CYAN)Running ESLint$(RESET)"
	@npm run lint

format: ## Check code formatting with Prettier
	@echo "$(CYAN)Checking code formatting$(RESET)"
	@npm run format:check

lint-html: ## Validate HTML files
	@echo "$(CYAN)Validating HTML$(RESET)"
	@npm run lint:html

lint-css: ## Lint CSS files
	@echo "$(CYAN)Linting CSS$(RESET)"
	@npm run lint:css

check-unused: ## Check for unused exports
	@echo "$(CYAN)Checking for unused exports$(RESET)"
	@npm run check:unused

check-size: ## Check bundle size
	@echo "$(CYAN)Checking bundle size$(RESET)"
	@npm run check:size

validate: lint format lint-html lint-css ## Run all validation checks
	@echo "$(CYAN)✓ All validation checks passed!$(RESET)"

shell: ## Open shell in development container
	@docker compose run --rm sh

install: ## Install dependencies locally
	@echo "$(CYAN)Installing dependencies$(RESET)"
	@npm install
