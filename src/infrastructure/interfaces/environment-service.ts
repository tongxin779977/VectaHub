/**
 * 支持的系统信号
 */
export enum Signal {
  SIGINT = 'SIGINT',
  SIGTERM = 'SIGTERM',
  SIGUSR1 = 'SIGUSR1',
  SIGUSR2 = 'SIGUSR2',
}

/**
 * 环境服务接口
 * 统一管理环境变量、文件系统操作、进程控制等所有与环境相关的功能
 * 实现真正的环境隔离，禁止业务代码直接使用 Node.js API
 */
export interface IEnvironmentService {
  // ==========================================
  // 路径管理
  // ==========================================

  /**
   * 获取 VectaHub 主目录路径
   * @returns VectaHub 主目录的绝对路径
   */
  getHomePath(): string;

  /**
   * 基于主目录构建路径
   * @param segments - 路径分段
   * @returns 组合后的绝对路径
   */
  getPath(...segments: string[]): string;

  /**
   * 基于当前执行目录构建绝对路径
   * @param segments - 路径分段
   * @returns 解析后的绝对路径
   */
  resolvePath(...segments: string[]): string;

  // ==========================================
  // 文件系统操作
  // ==========================================

  /**
   * 读取文件内容
   * @param path - 文件路径
   * @returns 文件内容字符串
   * @throws VectaHubError (ErrorType.FILESYSTEM)
   */
  readFile(path: string): string;

  /**
   * 异步读取文件内容
   * @param path - 文件路径
   * @returns 文件内容字符串
   */
  readFileAsync(path: string): Promise<string>;

  /**
   * 逐行读取文件内容
   * @param path - 文件路径
   * @returns 异步可迭代字符串
   */
  readLines(path: string): AsyncIterable<string>;

  /**
   * 写入文件内容
   * @param path - 文件路径
   * @param content - 文件内容
   * @throws VectaHubError (ErrorType.FILESYSTEM)
   */
  writeFile(path: string, content: string): void;

  /**
   * 检查文件或目录是否存在
   * @param path - 文件或目录路径
   * @returns 是否存在
   */
  exists(path: string): boolean;

  /**
   * 创建目录（递归创建）
   * @param path - 目录路径
   * @throws VectaHubError (ErrorType.FILESYSTEM)
   */
  ensureDir(path: string): void;

  /**
   * 异步创建目录
   * @param path - 目录路径
   * @param options - 创建选项
   */
  mkdirAsync(path: string, options?: { recursive?: boolean }): Promise<void>;

  /**
   * 读取目录内容
   * @param path - 目录路径
   * @returns 文件名数组
   * @throws VectaHubError (ErrorType.FILESYSTEM)
   */
  readDir(path: string): string[];

  /**
   * 读取目录内容对象
   * @param path - 目录路径
   * @returns 目录项数组
   * @throws VectaHubError (ErrorType.FILESYSTEM)
   */
  readDirObjects(path: string): { name: string; isDirectory(): boolean }[];

  /**
   * 删除文件或目录
   * @param path - 路径
   * @param options - 删除选项
   */
  rm(path: string, options?: { recursive?: boolean; force?: boolean }): void;

  /**
   * 复制文件
   * @param src - 源路径
   * @param dest - 目标路径
   */
  copyFile(src: string, dest: string): void;

  /**
   * 创建文件写入流
   * @param path - 文件路径
   * @param options - 写入选项
   */
  createWriteStream(path: string, options?: { encoding?: string; flags?: string }): any;

  /**
   * 获取文件或目录信息
   * @param path - 路径
   */
  stat(path: string): { size: number; isDirectory(): boolean };

  /**
   * 获取系统临时目录
   * @returns 临时目录路径
   */
  getTmpDir(): string;

  // ==========================================
  // 环境变量管理
  // ==========================================

  /**
   * 读取环境变量
   * @param name - 环境变量名
   * @param defaultValue - 默认值
   * @returns 环境变量值
   */
  getEnv(name: string, defaultValue?: string): string | undefined;

  /**
   * 设置环境变量
   * @param name - 环境变量名
   * @param value - 环境变量值
   */
  setEnv(name: string, value: string): void;

  /**
   * 删除环境变量
   * @param name - 环境变量名
   */
  deleteEnv(name: string): void;

  /**
   * 读取布尔类型环境变量
   * @param name - 环境变量名
   * @param defaultValue - 默认值
   * @returns 布尔值
   */
  getEnvBoolean(name: string, defaultValue?: boolean): boolean;

  /**
   * 读取数值类型环境变量
   * @param name - 环境变量名
   * @param defaultValue - 默认值
   * @returns 数值
   */
  getEnvNumber(name: string, defaultValue?: number): number | undefined;

  /**
   * 获取所有环境变量
   * @returns 环境变量对象
   */
  getAllEnv(): Record<string, string | undefined>;

  // ==========================================
  // 进程控制
  // ==========================================

  /**
   * 执行 shell 命令
   * @param command - 命令字符串
   * @param options - 执行选项
   * @returns 命令输出
   */
  exec(command: string, options?: { cwd?: string; env?: Record<string, string> }): Promise<{ stdout: string; stderr: string }>;

  /**
   * 产生子进程
   * @param command - 命令
   * @param args - 参数
   * @param options - 选项
   */
  spawn(command: string, args: string[], options?: { cwd?: string; env?: Record<string, string>; stdio?: any }): any;

  /**
   * 退出进程
   * @param code - 退出码（默认为 0）
   * @throws VectaHubError (ErrorType.PROCESS)
   */
  exit(code?: number): never;

  /**
   * 获取命令行参数
   * @returns 命令行参数数组
   */
  getArgv(): string[];

  /**
   * 获取当前工作目录
   * @returns 当前工作目录的绝对路径
   */
  getCwd(): string;

  // ==========================================
  // 事件监听与管理
  // ==========================================

  /**
   * 设置进程信号监听器
   * @param signal - 信号名称
   * @param listener - 监听器函数
   */
  onSignal(signal: Signal, listener: () => void | Promise<void>): void;

  /**
   * 设置未捕获异常监听器
   * @param listener - 监听器函数
   */
  onUncaughtException(listener: (error: Error) => void | Promise<void>): void;

  /**
   * 设置未处理 Promise 拒绝监听器
   * @param listener - 监听器函数
   */
  onUnhandledRejection(listener: (reason: unknown) => void | Promise<void>): void;

  /**
   * 设置进程监听器
   * @param listener - 监听器函数
   */
  onWarning(listener: (warning: Error) => void): void;
}
