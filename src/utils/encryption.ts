import * as crypto from 'crypto';
import { Logger } from './logger.js';

/**
 * 字段加密管理器
 * 使用 AES-256-GCM 算法对敏感字段进行加密和解密
 * 支持任意字符串密钥（通过 SHA-256 派生为 32 字节密钥）
 */
export class FieldEncryption {
  private static instance: FieldEncryption;
  private key: Buffer | null = null;
  private initialized: boolean = false;

  // 加密前缀标识
  private static readonly ENCRYPTION_PREFIX = 'enc:';
  // IV长度：12字节（GCM推荐）
  private static readonly IV_LENGTH = 12;

  /**
   * 私有构造函数，单例模式
   */
  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): FieldEncryption {
    if (!FieldEncryption.instance) {
      FieldEncryption.instance = new FieldEncryption();
    }
    return FieldEncryption.instance;
  }

  /**
   * 初始化加密管理器
   * 从环境变量 FEISHU_ENCRYPTION_KEY 获取密钥
   * 支持任意字符串，通过 SHA-256 派生为 32 字节密钥
   */
  public initialize(): void {
    if (this.initialized) {
      Logger.debug('字段加密管理器已初始化，跳过');
      return;
    }

    const envKey = process.env.FEISHU_ENCRYPTION_KEY;
    if (!envKey) {
      Logger.info('未设置 FEISHU_ENCRYPTION_KEY，敏感字段将明文存储');
      this.initialized = true;
      return;
    }

    // 使用 SHA-256 将任意字符串派生为 32 字节密钥
    this.key = this.deriveKey(envKey);
    Logger.info('字段加密已启用，敏感字段将加密存储');
    this.initialized = true;
  }

  /**
   * 从任意字符串派生 32 字节密钥
   * 使用 SHA-256 哈希
   * @param input 用户输入的密钥字符串
   * @returns 32 字节密钥
   */
  private deriveKey(input: string): Buffer {
    return crypto.createHash('sha256').update(input, 'utf-8').digest();
  }

  /**
   * 检查是否启用加密
   */
  public isEnabled(): boolean {
    return this.initialized && this.key !== null;
  }

  /**
   * 加密单个字段值
   * @param plaintext 明文值
   * @returns 加密后的值，格式：enc:base64(iv):base64(authTag):base64(ciphertext)
   */
  public encryptField(plaintext: string): string {
    if (!this.isEnabled()) {
      return plaintext; // 未启用加密，直接返回明文
    }

    if (!plaintext) {
      return plaintext; // 空值不加密
    }

    // 生成随机IV
    const iv = crypto.randomBytes(FieldEncryption.IV_LENGTH);

    // 创建加密器
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key!, iv);

    // 加密
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ]);

    // 获取认证标签
    const authTag = cipher.getAuthTag();

    // 返回格式：enc:base64(iv):base64(authTag):base64(ciphertext)
    return `${FieldEncryption.ENCRYPTION_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  /**
   * 解密单个字段值
   * @param encryptedValue 加密值，格式：enc:base64(iv):base64(authTag):base64(ciphertext)
   * @returns 解密后的明文
   */
  public decryptField(encryptedValue: string): string {
    if (!this.isEnabled()) {
      throw new Error('加密未启用，无法解密');
    }

    if (!encryptedValue || !FieldEncryption.isEncrypted(encryptedValue)) {
      return encryptedValue; // 未加密，直接返回
    }

    // 移除前缀
    const data = encryptedValue.slice(FieldEncryption.ENCRYPTION_PREFIX.length);

    // 解析加密数据
    const parts = data.split(':');
    if (parts.length !== 3) {
      throw new Error('加密数据格式错误');
    }

    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const ciphertext = Buffer.from(parts[2], 'base64');

    // 创建解密器
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key!, iv);
    decipher.setAuthTag(authTag);

    // 解密
    try {
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);
      return decrypted.toString('utf-8');
    } catch (error) {
      Logger.error('解密失败，密钥可能已变更', error);
      throw new Error('解密失败，密钥可能已变更');
    }
  }

  /**
   * 检查字段值是否已加密
   * @param value 字段值
   * @returns 是否已加密
   */
  public static isEncrypted(value: string): boolean {
    if (!value) {
      return false;
    }
    return value.startsWith(FieldEncryption.ENCRYPTION_PREFIX);
  }

  /**
   * 解密字段（如果已加密），否则返回原值
   * @param value 字段值
   * @returns 解密后的值或原值
   */
  public decryptIfNeeded(value: string): string {
    if (!value || !FieldEncryption.isEncrypted(value)) {
      return value;
    }
    return this.decryptField(value);
  }

  /**
   * 重置加密管理器（用于测试或特殊场景）
   */
  public reset(): void {
    this.key = null;
    this.initialized = false;
  }
}