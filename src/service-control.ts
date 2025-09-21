import os from "node:os"
import type { Redis } from "ioredis"
import type {
  ServiceController,
  ServiceControllerOptions,
  ServiceState,
  ServiceInstance,
  Logger,
  ServiceControlConfig,
} from "./types.js"

const DEFAULT_CONFIG: Required<ServiceControlConfig> = {
  prefix: "controlService:control",
  heartbeatTtl: 30,
  pollMs: 1000,
}

function sleep(ms: number): Promise<void> {
  // Prefer Bun.sleep when available
  if (typeof (globalThis as unknown as { Bun?: { sleep: (ms: number) => Promise<void> } }).Bun?.sleep === "function") {
    // @ts-ignore Bun global in runtime
    return Bun.sleep(ms)
  }
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createServiceController(options: ServiceControllerOptions): ServiceController {
  const { redis, logger, config = {} } = options
  const finalConfig = { ...DEFAULT_CONFIG, ...config }

  const hostname = os.hostname()
  const instanceId = `${hostname}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`
  const prefix = finalConfig.prefix

  const servicesSetKey = `${prefix}:services`
  const instancesSetKey = `${prefix}:service:${options.serviceName}:instances`
  const instanceKey = `${prefix}:service:${options.serviceName}:instance:${instanceId}`
  const stateKey = `${prefix}:state:${options.serviceName}`
  const signalKey = `${prefix}:signal:${options.serviceName}`

  async function register(): Promise<void> {
    const now = new Date().toISOString()
    const payload: ServiceInstance = {
      serviceName: options.serviceName,
      appType: options.appType,
      instanceId,
      hostname,
      pid: process.pid,
      startedAt: now,
      lastSeen: now,
      status: "running",
      tags: options.tags ?? [],
      meta: options.meta ?? {},
    }

    await redis.sadd(servicesSetKey, options.serviceName)
    await redis.sadd(instancesSetKey, instanceId)
    await redis.set(instanceKey, JSON.stringify(payload), "EX", finalConfig.heartbeatTtl)

    // Initialize state to running if not set
    const existingState = await redis.get(stateKey)
    if (!existingState) {
      await redis.set(stateKey, "running")
    }

    // Recover from stale stopping state if no explicit stop signal is pending
    // This prevents services from immediately exiting on reboot after a prior shutdown
    const pendingSignal = await redis.get(signalKey)
    if (existingState === "stopping" && pendingSignal !== "stop") {
      await redis.set(stateKey, "running")
      logger.warn("Recovered from stale stopping state", { previousState: existingState, pendingSignal })
    }

    // Graceful shutdown updates
    process.on("SIGINT", async () => {
      await shutdown("SIGINT")
    })
    process.on("SIGTERM", async () => {
      await shutdown("SIGTERM")
    })

    logger.info("Service registered", { instanceId, stateKey, signalKey })
  }

  async function heartbeat(statusOverride?: ServiceState): Promise<void> {
    const now = new Date().toISOString()
    const raw = await redis.get(instanceKey)
    let payload: Partial<ServiceInstance> = {}
    try {
      payload = raw ? JSON.parse(raw) : {}
    } catch {
      payload = {}
    }
    const body: ServiceInstance = {
      ...payload,
      serviceName: options.serviceName,
      appType: options.appType,
      instanceId,
      hostname,
      pid: process.pid,
      startedAt: payload.startedAt ?? now,
      lastSeen: now,
      status: statusOverride ?? ((await getState()) as ServiceState),
      tags: options.tags ?? [],
      meta: options.meta ?? {},
    }
    await redis.set(instanceKey, JSON.stringify(body), "EX", finalConfig.heartbeatTtl)
  }

  async function applySignal(): Promise<"none" | "pause" | "resume" | "stop"> {
    const signal = await redis.get(signalKey)
    if (!signal) return "none"
    const normalized = signal.toLowerCase()
    switch (normalized) {
      case "pause":
        await redis.set(stateKey, "paused")
        await redis.del(signalKey)
        logger.warn("Pause signal applied")
        return "pause"
      case "resume":
        await redis.set(stateKey, "running")
        await redis.del(signalKey)
        logger.warn("Resume signal applied")
        return "resume"
      case "stop":
        await redis.set(stateKey, "stopping")
        await redis.del(signalKey)
        logger.warn("Stop signal applied")
        return "stop"
      default:
        // unknown signal - ignore but delete to prevent loops
        await redis.del(signalKey)
        logger.warn("Unknown signal received", { signal })
        return "none"
    }
  }

  async function getState(): Promise<ServiceState> {
    const state = await redis.get(stateKey)
    if (state === "paused") return "paused"
    if (state === "stopping") return "stopping"
    return "running"
  }

  async function waitIfPaused(): Promise<void> {
    // First, check and apply any incoming signal
    await applySignal()
    let state = await getState()
    if (state !== "paused") return
    logger.info("Service paused. Waiting for resume signal...")
    // Loop until resumed or stop
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await heartbeat("paused")
      const sig = await applySignal()
      state = await getState()
      if (sig === "stop" || state === "stopping") {
        break
      }
      if (state === "running") {
        logger.info("Resumed from pause")
        break
      }
      await sleep(finalConfig.pollMs)
    }
  }

  async function shouldStop(): Promise<boolean> {
    const sig = await applySignal()
    const state = await getState()
    return sig === "stop" || state === "stopping"
  }

  async function shutdown(reason?: string): Promise<void> {
    try {
      await redis.set(stateKey, "stopping")
      const raw = await redis.get(instanceKey)
      let payload: Partial<ServiceInstance> = {}
      try {
        payload = raw ? JSON.parse(raw) : {}
      } catch {
        payload = {}
      }
      const body: ServiceInstance = {
        ...payload,
        serviceName: options.serviceName,
        appType: options.appType,
        instanceId,
        hostname,
        pid: process.pid,
        startedAt: payload.startedAt ?? new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        status: "stopping",
        tags: options.tags ?? [],
        meta: options.meta ?? {},
        stopReason: reason ?? "manual",
      }
      // Short TTL so registry cleans up fast
      await redis.set(instanceKey, JSON.stringify(body), "EX", 10)
      await redis.srem(instancesSetKey, instanceId)
    } catch (error) {
      logger.error("Error during shutdown", { error })
    } finally {
      logger.info("Shutdown complete", { reason })
    }
  }

  return {
    register,
    heartbeat,
    waitIfPaused,
    shouldStop,
    shutdown,
    getState,
  }
}
