import { format, transports, createLogger as winstonCreateLogger } from "winston"
import type { Logger } from "./types.js"

export enum LogLevel {
  Debug = "debug",
  Info = "info",
  Warn = "warn",
  Error = "error",
}

interface LoggerMeta {
  [key: string]: unknown
  label?: never
  level?: never
  message?: never
  timestamp?: never
}

export type WinstonLogger = {
  [LogLevel.Debug]: (message: string, meta?: LoggerMeta) => void
  [LogLevel.Info]: (message: string, meta?: LoggerMeta) => void
  [LogLevel.Warn]: (message: string, meta?: LoggerMeta) => void
  [LogLevel.Error]: (message: string | Error, meta?: LoggerMeta) => void
}

export interface CreateLoggerOptions {
  level?: LogLevel
  pretty?: boolean
  label?: string
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const { level = LogLevel.Info, pretty = false, label } = options

  const winstonFormat = pretty
    ? format.combine(
        format.errors({ stack: true }),
        ...(label ? [format.label({ label })] : []),
        format.timestamp(),
        customPrettyPrint,
      )
    : format.combine(
        format.errors({ stack: true }),
        ...(label ? [format.label({ label })] : []),
        format.timestamp(),
        format.json(),
      )

  const winstonLogger = winstonCreateLogger({
    level,
    format: winstonFormat,
    defaultMeta: { label },
    transports: [new transports.Console()],
  })

  return {
    debug: (message: string, meta?: Record<string, unknown>) => winstonLogger.debug(message, meta),
    info: (message: string, meta?: Record<string, unknown>) => winstonLogger.info(message, meta),
    warn: (message: string, meta?: Record<string, unknown>) => winstonLogger.warn(message, meta),
    error: (message: string | Error, meta?: Record<string, unknown>) => {
      if (message instanceof Error) {
        winstonLogger.error(message.message, { error: message, ...meta })
      } else {
        winstonLogger.error(message, meta)
      }
    },
  }
}

// Pretty print utilities
enum Style {
  BOLD = 1,
  THIN = 2,
  ITALIC = 3,
  PURPLE = 35,
  CYAN = 36,
  GREEN = 32,
  YELLOW = 33,
  RED = 31,
  GRAY = 90,
}

const PREFIX = "\x1b"

const colorize = (text: string, style: Style[]) => {
  if (!style.length) {
    return text
  }
  return `${PREFIX}[${style.join(";")}m${text}${PREFIX}[0m`
}

const levelColors: Record<string, Style[]> = {
  [LogLevel.Debug]: [Style.CYAN],
  [LogLevel.Info]: [Style.GREEN],
  [LogLevel.Warn]: [Style.YELLOW],
  [LogLevel.Error]: [Style.RED],
}

const customPrettyPrint = format.printf((log) => {
  const { timestamp, label, level, message, ...rest } = log
  return [
    colorize(String(timestamp), [Style.BOLD]),
    colorize(`(${label || "unknown"})`, [Style.PURPLE]),
    colorize(`${String(level).toUpperCase()}:`, levelColors[String(level)] || []),
    String(message),
    colorize(`- ${JSON.stringify(rest, null, 2)}`, [Style.THIN]),
  ].join(" ")
})
