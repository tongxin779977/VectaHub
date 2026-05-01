export type ProgressPhase =
  | 'idle'
  | 'normalizing'
  | 'matching'
  | 'extracting'
  | 'synthesizing'
  | 'validating'
  | 'completed'
  | 'failed';

export interface ParseProgress {
  phase: ProgressPhase;
  percent: number;
  message: string;
  startTime: number;
  elapsed?: number;
}

export type ProgressCallback = (progress: ParseProgress) => void;

export interface ProgressTracker {
  start(): void;
  update(phase: ProgressPhase, message: string, percent?: number): void;
  complete(result?: unknown): void;
  fail(error: Error): void;
  onProgress(callback: ProgressCallback): void;
  getProgress(): ParseProgress;
  reset(): void;
}

const PHASE_MESSAGES: Record<ProgressPhase, { start: string; end: string }> = {
  idle: { start: '准备中...', end: '就绪' },
  normalizing: { start: '规范化输入...', end: '输入已规范化' },
  matching: { start: '匹配意图...', end: '意图已匹配' },
  extracting: { start: '提取参数...', end: '参数已提取' },
  synthesizing: { start: '合成命令...', end: '命令已合成' },
  validating: { start: '验证命令...', end: '命令已验证' },
  completed: { start: '完成', end: '解析完成' },
  failed: { start: '失败', end: '解析失败' },
};

const PHASE_WEIGHTS: Record<ProgressPhase, number> = {
  idle: 0,
  normalizing: 10,
  matching: 30,
  extracting: 50,
  synthesizing: 70,
  validating: 90,
  completed: 100,
  failed: 0,
};

function createProgressTracker(): ProgressTracker {
  let startTime = 0;
  let currentProgress: ParseProgress = {
    phase: 'idle',
    percent: 0,
    message: '准备中...',
    startTime: 0,
  };
  const callbacks: ProgressCallback[] = [];

  function notifyListeners(): void {
    const elapsed = startTime ? Date.now() - startTime : 0;
    currentProgress.elapsed = elapsed;
    callbacks.forEach(cb => cb({ ...currentProgress }));
  }

  function start(): void {
    startTime = Date.now();
    currentProgress = {
      phase: 'normalizing',
      percent: 0,
      message: PHASE_MESSAGES.normalizing.start,
      startTime,
    };
    notifyListeners();
  }

  function update(phase: ProgressPhase, message: string, percent?: number): void {
    const newPercent = percent ?? PHASE_WEIGHTS[phase];
    currentProgress = {
      ...currentProgress,
      phase,
      percent: Math.min(newPercent, 100),
      message: message || PHASE_MESSAGES[phase].start,
    };
    notifyListeners();
  }

  function complete(result?: unknown): void {
    currentProgress = {
      ...currentProgress,
      phase: 'completed',
      percent: 100,
      message: PHASE_MESSAGES.completed.end,
    };
    notifyListeners();
  }

  function fail(error: Error): void {
    currentProgress = {
      ...currentProgress,
      phase: 'failed',
      percent: 0,
      message: `错误: ${error.message}`,
    };
    notifyListeners();
  }

  function onProgress(callback: ProgressCallback): void {
    callbacks.push(callback);
  }

  function getProgress(): ParseProgress {
    return { ...currentProgress };
  }

  function reset(): void {
    startTime = 0;
    currentProgress = {
      phase: 'idle',
      percent: 0,
      message: '准备中...',
      startTime: 0,
    };
    callbacks.length = 0;
  }

  return {
    start,
    update,
    complete,
    fail,
    onProgress,
    getProgress,
    reset,
  };
}

export const progressTracker = createProgressTracker();

export interface StreamParser<T> {
  parse(input: string, onProgress?: ProgressCallback): Promise<T>;
}

export function createStreamParser<T>(
  parser: (input: string) => Promise<T>
): StreamParser<T> {
  const tracker = createProgressTracker();

  return {
    async parse(input: string, onProgress?: ProgressCallback): Promise<T> {
      if (onProgress) {
        tracker.onProgress(onProgress);
      }

      try {
        tracker.start();

        tracker.update('normalizing', '规范化输入...', 10);
        await sleep(10);

        tracker.update('matching', '匹配意图...', 30);
        await sleep(20);

        tracker.update('extracting', '提取参数...', 50);
        await sleep(10);

        tracker.update('synthesizing', '合成命令...', 70);
        const result = await parser(input);

        tracker.update('validating', '验证命令...', 90);
        await sleep(10);

        tracker.complete(result);
        return result;
      } catch (error) {
        tracker.fail(error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatProgress(progress: ParseProgress): string {
  const { phase, percent, message, elapsed } = progress;
  const bar = createProgressBar(percent);
  const time = elapsed ? ` [${(elapsed / 1000).toFixed(1)}s]` : '';

  return `${bar} ${message}${time}`;
}

function createProgressBar(percent: number, width = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}] ${percent}%`;
}

export interface ProgressSpinner {
  start(message?: string): void;
  update(message: string): void;
  succeed(message?: string): void;
  fail(message?: string): void;
  stop(): void;
}

const SPINNER_CHARS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function createProgressSpinner(): ProgressSpinner {
  let interval: ReturnType<typeof setInterval> | null = null;
  let currentIndex = 0;
  let currentMessage = '';

  function tick(): void {
    if (currentMessage) {
      process.stdout.write(`\r${SPINNER_CHARS[currentIndex]} ${currentMessage}`);
    }
    currentIndex = (currentIndex + 1) % SPINNER_CHARS.length;
  }

  return {
    start(message = '处理中'): void {
      currentMessage = message;
      currentIndex = 0;
      tick();
      interval = setInterval(tick, 80);
    },

    update(message: string): void {
      currentMessage = message;
      process.stdout.write(`\r${SPINNER_CHARS[currentIndex]} ${message}`);
    },

    succeed(message = '完成'): void {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      process.stdout.write(`\r✓ ${message}\n`);
    },

    fail(message = '失败'): void {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      process.stdout.write(`\r✗ ${message}\n`);
    },

    stop(): void {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      process.stdout.write('\r' + ' '.repeat(50) + '\r');
    },
  };
}

export const spinner = createProgressSpinner();
