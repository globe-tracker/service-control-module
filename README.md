# @globetracker/service-control

Service control and lifecycle management for distributed services using Redis.

## Features

- **Service Registration**: Register services with unique instance IDs
- **Heartbeat Management**: Automatic heartbeat with configurable TTL
- **State Management**: Control service states (running, paused, stopping)
- **Signal Handling**: Support for pause, resume, and stop signals
- **Graceful Shutdown**: Automatic cleanup on process termination
- **Redis Integration**: Uses Redis for distributed state management

## Installation

```bash
npm install @globetracker/service-control
```

## Usage

### Basic Setup

```typescript
import { createServiceController, createLogger } from "@globetracker/service-control"
import Redis from "ioredis"

const redis = new Redis("redis://localhost:6379")
const logger = createLogger({ level: "info", label: "my-service" })

const controller = createServiceController({
  serviceName: "my-service",
  appType: "api",
  redis,
  logger,
  tags: ["production", "api"],
  meta: { version: "1.0.0" }
})

// Register the service
await controller.register()

// Start heartbeat
setInterval(async () => {
  await controller.heartbeat()
}, 10000)

// Check if service should pause
await controller.waitIfPaused()

// Check if service should stop
if (await controller.shouldStop()) {
  await controller.shutdown("manual")
  process.exit(0)
}
```

### Configuration Options

```typescript
const controller = createServiceController({
  serviceName: "my-service",
  appType: "worker",
  redis,
  logger,
  config: {
    prefix: "myapp:control",        // Redis key prefix
    heartbeatTtl: 60,               // Heartbeat TTL in seconds
    pollMs: 2000                    // Polling interval in milliseconds
  }
})
```

### Service States

- **running**: Service is active and processing
- **paused**: Service is paused and waiting for resume signal
- **stopping**: Service is shutting down

### Signals

Send signals to control service behavior:

```bash
# Pause service
redis-cli SET "controlService:control:signal:my-service" "pause"

# Resume service
redis-cli SET "controlService:control:signal:my-service" "resume"

# Stop service
redis-cli SET "controlService:control:signal:my-service" "stop"
```

## API Reference

### `createServiceController(options)`

Creates a new service controller instance.

**Parameters:**

- `options.serviceName` (string): Unique name for the service
- `options.appType` (string): Type of application (e.g., "api", "worker")
- `options.redis` (Redis): ioredis instance
- `options.logger` (Logger): Logger instance
- `options.tags` (string[], optional): Service tags
- `options.meta` (object, optional): Additional metadata
- `options.config` (ServiceControlConfig, optional): Configuration options

**Returns:** `ServiceController`

### `ServiceController`

#### `register(): Promise<void>`

Registers the service with Redis and sets up signal handlers.

#### `heartbeat(statusOverride?: ServiceState): Promise<void>`

Updates the service heartbeat. Optionally override the current status.

#### `waitIfPaused(): Promise<void>`

Blocks execution if the service is paused until resumed or stopped.

#### `shouldStop(): Promise<boolean>`

Checks if the service should stop based on signals or state.

#### `shutdown(reason?: string): Promise<void>`

Gracefully shuts down the service and cleans up Redis entries.

#### `getState(): Promise<ServiceState>`

Gets the current service state.

### `createLogger(options)`

Creates a logger instance compatible with the service controller.

**Parameters:**

- `options.level` (LogLevel, optional): Log level (default: "info")
- `options.pretty` (boolean, optional): Enable pretty printing (default: false)
- `options.label` (string, optional): Logger label

**Returns:** `Logger`

## Redis Keys

The service controller uses the following Redis key patterns:

- `{prefix}:services` - Set of all registered services
- `{prefix}:service:{serviceName}:instances` - Set of service instances
- `{prefix}:service:{serviceName}:instance:{instanceId}` - Instance data
- `{prefix}:state:{serviceName}` - Service state
- `{prefix}:signal:{serviceName}` - Control signals

## Development

### Release Process

This project uses an automated release script for version management and GitHub releases.

#### Available Release Commands

```bash
# Patch release (1.0.0 → 1.0.1)
bun run release:patch

# Minor release (1.0.0 → 1.1.0)
bun run release:minor

# Major release (1.0.0 → 2.0.0)
bun run release:major

# Prerelease (1.0.0 → 1.0.1-rc.1)
bun run release:prerelease

# Dry run (see what would happen without making changes)
bun run release:dry-run

# Skip tests (use with caution)
bun run release:skip-tests
```

#### Release Process

The release script automatically:

1. **Pre-release Checks**: Ensures clean working directory, correct branch, and remote origin
2. **Quality Assurance**: Runs linting, type checking, and build
3. **Version Bumping**: Updates package.json with new version
4. **Git Operations**: Creates release commit and git tag
5. **NPM Publishing**: Publishes package to npm registry as `@globetracker/service-control`
6. **GitHub Release**: Creates GitHub release with changelog integration
7. **CI/CD Trigger**: Automatically triggers CI/CD workflows

#### Requirements

- **GitHub CLI**: Install from <https://cli.github.com/> for release creation
- **NPM Account**: Must be logged in to npm (`npm login`) for publishing
- **Clean Working Directory**: Commit or stash changes before releasing
- **Main Branch**: Must be on main/master branch to release

#### NPM Publishing

The package is automatically published to npm as `@globetracker/service-control` during the release process.

**Manual NPM Commands:**

```bash
# Test npm publish (dry-run)
bun run publish:npm:dry-run

# Publish to npm manually
bun run publish:npm
```

## License

MIT
