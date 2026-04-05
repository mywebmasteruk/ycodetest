type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

const IS_JSON = process.env.NODE_ENV === 'production' || process.env.LOG_FORMAT === 'json';

function emit(entry: LogEntry): void {
  const { level, msg, ...extra } = entry;
  if (IS_JSON) {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra });
    if (level === 'error') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
    return;
  }
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '✅';
  const tag = extra.tag ? `[${extra.tag}]` : '';
  const rest = Object.keys(extra).length > (extra.tag ? 1 : 0)
    ? ' ' + JSON.stringify(extra)
    : '';
  const text = `${prefix} ${tag} ${msg}${rest}`;
  if (level === 'error') console.error(text);
  else if (level === 'warn') console.warn(text);
  else console.log(text);
}

export const logger = {
  info(msg: string, extra?: Record<string, unknown>) { emit({ level: 'info', msg, ...extra }); },
  warn(msg: string, extra?: Record<string, unknown>) { emit({ level: 'warn', msg, ...extra }); },
  error(msg: string, extra?: Record<string, unknown>) { emit({ level: 'error', msg, ...extra }); },
};
