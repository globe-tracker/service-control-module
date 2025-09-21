import type { Redis } from "ioredis"

export type ServiceControllerOptions = {
  serviceName: string
  appType: string
  tags?: string[]
  meta?: Record<string, string | number | boolean>
  redis: Redis
  logger: Logger
  config?: ServiceControlConfig
}

export type ServiceState = "running" | "paused" | "stopping"

export type ServiceControlConfig = {
  prefix?: string
  heartbeatTtl?: number
  pollMs?: number
}

export type Logger = {
  debug: (message: string, meta?: Record<string, unknown>) => void
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string | Error, meta?: Record<string, unknown>) => void
}

export type ServiceController = {
  register: () => Promise<void>
  heartbeat: (statusOverride?: ServiceState) => Promise<void>
  waitIfPaused: () => Promise<void>
  shouldStop: () => Promise<boolean>
  shutdown: (reason?: string) => Promise<void>
  getState: () => Promise<ServiceState>
}

export type ServiceInstance = {
  serviceName: string
  appType: string
  instanceId: string
  hostname: string
  pid: number
  startedAt: string
  lastSeen: string
  status: ServiceState
  tags: string[]
  meta: Record<string, string | number | boolean>
  stopReason?: string
}
