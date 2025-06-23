import { Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Logger } from '../utils/logger.js';

/**
 * SSE连接管理器 - 负责管理所有的SSE长连接和心跳机制
 */
export class SSEConnectionManager {
  private transports: { [sessionId: string]: SSEServerTransport } = {};
  private connections: Map<string, { res: Response }> = new Map();
  private keepAliveIntervalId: NodeJS.Timeout | null = null;
  private readonly KEEP_ALIVE_INTERVAL_MS = 1000 * 25; // 25秒心跳间隔

  constructor() {
    this.startGlobalKeepAlive();
  }

  /**
   * 启动全局心跳管理
   */
  private startGlobalKeepAlive(): void {
    if (this.keepAliveIntervalId) {
      clearInterval(this.keepAliveIntervalId);
    }

    this.keepAliveIntervalId = setInterval(() => {
      for (const [sessionId, connection] of this.connections.entries()) {
        if (!connection.res.writableEnded) {
          connection.res.write(': keepalive\n\n');
        } else {
          // 移除已关闭的连接
          this.removeConnection(sessionId);
        }
      }
    }, this.KEEP_ALIVE_INTERVAL_MS);
  }

  /**
   * 添加新的SSE连接
   */
  public addConnection(
    sessionId: string,
    transport: SSEServerTransport,
    req: Request,
    res: Response,
  ): void {
    this.transports[sessionId] = transport;
    this.connections.set(sessionId, { res });
    console.info(`[SSE Connection] Client connected: ${sessionId}`);
    req.on('close', () => {
      this.removeConnection(sessionId);
    });
  }

  /**
   * 移除SSE连接
   */
  public removeConnection(sessionId: string): void {
    const transport = this.transports[sessionId];
    if (transport) {
      try {
        transport.close();
        Logger.info(`[SSE Connection] Transport closed for: ${sessionId}`);
      } catch (error) {
        Logger.error(`[SSE Connection] Error closing transport for: ${sessionId}`, error);
      }
    }
    delete this.transports[sessionId];
    this.connections.delete(sessionId);
    console.info(`[SSE Connection] Client disconnected: ${sessionId}`);
  }

  /**
   * 获取指定sessionId的传输实例
   */
  public getTransport(sessionId: string): SSEServerTransport | undefined {
    console.info(`[SSE Connection] Getting transport for sessionId: ${sessionId}`);
    return this.transports[sessionId];
  }

  /**
   * 关闭连接管理器
   */
  public shutdown() {
    if (this.keepAliveIntervalId) {
      clearInterval(this.keepAliveIntervalId);
      this.keepAliveIntervalId = null;
    }

    // 关闭所有连接
    Logger.info(`[SSE Connection] Shutting down all connections (${this.connections.size} active)`);
    for (const sessionId of this.connections.keys()) {
      this.removeConnection(sessionId);
    }
    Logger.info(`[SSE Connection] All connections closed`);
  }
} 