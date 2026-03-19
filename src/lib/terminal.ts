/**
 * TerminalOS — a self-contained virtual terminal with VFS, command parser,
 * and CTF crack minigame. Pure TypeScript, no React dependency.
 */

export interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'success' | 'system';
  text: string;
}

let _lineId = 0;
function nextLineId(): number {
  return ++_lineId;
}

interface FSNode {
  type: 'file' | 'dir';
  content?: string;
  children?: Record<string, FSNode>;
}

const VFS: FSNode = {
  type: 'dir',
  children: {
    home: {
      type: 'dir',
      children: {
        hkmodd: {
          type: 'dir',
          children: {
            '.profile': { type: 'file', content: 'export PS1="hkmodd@sec:~$ "\n# Red team operator since 2020' },
            'readme.txt': { type: 'file', content: 'Welcome to HKModd\'s system.\nTry exploring with `ls`, `cat`, and `cd`.\nThere might be secrets hidden somewhere...' },
            projects: {
              type: 'dir',
              children: {
                'lithoapp.md': { type: 'file', content: '# LithoApp\nFull-stack lithophane generator\nStack: React + R3F + WASM + PWA\nStatus: Production' },
                'scanner.py': { type: 'file', content: '#!/usr/bin/env python3\n# Network reconnaissance tool\n# Usage: python3 scanner.py --target <IP>\nimport nmap\n# [REDACTED]' },
              },
            },
            '.secret': {
              type: 'dir',
              children: {
                'flag.enc': { type: 'file', content: '=== ENCRYPTED FLAG ===\nUse `crack` command to attempt decryption.\nHint: The key is persistence.' },
              },
            },
          },
        },
      },
    },
    etc: {
      type: 'dir',
      children: {
        'motd': { type: 'file', content: '╔══════════════════════════════╗\n║   HKModd Security Kernel     ║\n║   v2.0 — All Unauthorized    ║\n║   Access Will Be Logged      ║\n╚══════════════════════════════╝' },
      },
    },
  },
};

export class TerminalEngine {
  private history: TerminalLine[] = [];
  private commandHistory: string[] = [];
  private cwd: string[] = ['home', 'hkmodd'];
  private crackStage = 0;
  private ctfSolved = false;

  constructor(greeting: string, ctfSolved = false) {
    this.ctfSolved = ctfSolved;
    greeting.split('\n').forEach((line) => {
      this.history.push({ id: nextLineId(), type: 'system', text: line });
    });
  }

  getHistory(): TerminalLine[] {
    return [...this.history];
  }

  getCommandHistory(): string[] {
    return [...this.commandHistory];
  }

  isCTFSolved(): boolean {
    return this.ctfSolved;
  }

  execute(input: string): TerminalLine[] {
    const trimmed = input.trim();
    this.history.push({ id: nextLineId(), type: 'input', text: `$ ${trimmed}` });

    if (!trimmed) return this.getHistory();

    // Track command history for ↑/↓ navigation
    this.commandHistory.push(trimmed);

    const [cmd, ...args] = trimmed.split(/\s+/);

    switch (cmd.toLowerCase()) {
      case 'help':
        this.out([
          'Available commands:',
          '  help          — Show this help',
          '  ls [dir]      — List directory contents',
          '  cd <dir>      — Change directory',
          '  cat <file>    — Display file contents',
          '  pwd           — Print working directory',
          '  whoami        — Display current user',
          '  clear         — Clear terminal',
          '  crack         — Attempt CTF decryption',
          '  uname         — System information',
          '  date          — Current date/time',
          '  echo <text>   — Echo text',
          '  socials       — Social media links',
          '  skills        — List technical skills',
          '  history       — Command history',
          '  matrix        — Enter the Matrix',
          '  nmap          — Network scan (simulated)',
        ]);
        break;

      case 'ls':
        this.cmdLs(args[0]);
        break;

      case 'cd':
        this.cmdCd(args[0]);
        break;

      case 'cat':
        this.cmdCat(args[0]);
        break;

      case 'pwd':
        this.out([`/${this.cwd.join('/')}`]);
        break;

      case 'whoami':
        this.out(['hkmodd']);
        break;

      case 'clear':
        this.history = [];
        break;

      case 'crack':
        this.cmdCrack();
        break;

      case 'uname':
        this.out(['HKModd Security Kernel v2.0 (x86_64-redteam-linux-gnu)']);
        break;

      case 'date':
        this.out([new Date().toString()]);
        break;

      case 'echo':
        this.out([args.join(' ')]);
        break;

      case 'socials':
        this.out([
          'GitHub:   https://github.com/HKModd',
          'LinkedIn: https://linkedin.com/in/hkmodd',
          'Email:    hkmodd@proton.me',
        ]);
        break;

      case 'skills':
        this.out([
          '◆ Penetration Testing    ████████░░ 90%',
          '◆ React / TypeScript     ████████░░ 90%',
          '◆ Python / Node.js       ████████░░ 85%',
          '◆ Network Security       ████████░░ 85%',
          '◆ Vulnerability Research ████████░░ 85%',
          '◆ Docker / K8s           ███████░░░ 75%',
        ]);
        break;

      case 'sudo':
        this.err(['Permission denied. Nice try though. 😏']);
        break;

      case 'rm':
        this.err(['rm: operation not permitted in sandbox mode']);
        break;

      case 'matrix':
        this.out([
          '',
          '  ░▒▓█ ENTERING THE MATRIX █▓▒░',
          '',
          '  01001000 01001011 01001101',
          '  ╔══╦══╦══╦══╦══╦══╦══╦══╗',
          '  ║ⒽⓀ║ⓂⓄ║ⒹⒹ║░░║▓▓║██║▒▒║░░║',
          '  ╠══╬══╬══╬══╬══╬══╬══╬══╣',
          '  ║▓▓║░░║██║▒▒║ⒽⓀ║ⓂⓄ║ⒹⒹ║░░║',
          '  ╚══╩══╩══╩══╩══╩══╩══╩══╝',
          '  01001111 01010000 01010011',
          '',
          '  Wake up, Neo...',
          '',
        ]);
        break;

      case 'nmap':
        this.out([
          '',
          'Starting Nmap 7.95 ( https://nmap.org )',
          'Nmap scan report for darkcore.local (127.0.0.1)',
          'Host is up (0.00042s latency).',
          '',
          'PORT     STATE  SERVICE       VERSION',
          '22/tcp   open   ssh           OpenSSH 9.2 (SecureCore)',
          '80/tcp   open   http          nginx 1.25.3',
          '443/tcp  open   ssl/http      nginx 1.25.3',
          '8080/tcp closed http-proxy',
          '8443/tcp open   darkcore-api  HKModd/2.0',
          '',
          'Service detection performed.',
          'Nmap done: 1 IP address (1 host up) scanned in 2.41 seconds',
          '',
        ]);
        break;

      case 'history':
        if (this.commandHistory.length <= 1) {
          this.out(['  (no previous commands)']);
        } else {
          // Show all except the current "history" command
          const hist = this.commandHistory.slice(0, -1);
          this.out(hist.map((cmd, i) => `  ${String(i + 1).padStart(4)}  ${cmd}`));
        }
        break;

      default:
        this.err([`command not found: ${cmd}. Type "help" for available commands.`]);
    }

    return this.getHistory();
  }

  private resolve(pathStr?: string): FSNode | null {
    const parts = pathStr === '/'
      ? []
      : pathStr?.startsWith('/')
        ? pathStr.split('/').filter(Boolean)
        : [...this.cwd, ...(pathStr?.split('/').filter(Boolean) ?? [])];

    // Resolve ..
    const resolved: string[] = [];
    for (const p of parts) {
      if (p === '..') resolved.pop();
      else if (p !== '.') resolved.push(p);
    }

    let node: FSNode = VFS;
    for (const segment of resolved) {
      if (node.type !== 'dir' || !node.children?.[segment]) return null;
      node = node.children[segment];
    }
    return node;
  }

  private cmdLs(path?: string) {
    const node = this.resolve(path ?? '.');
    if (!node) return this.err([`ls: cannot access '${path}': No such file or directory`]);
    if (node.type !== 'dir' || !node.children) return this.err([`ls: '${path}' is not a directory`]);

    const entries = Object.entries(node.children).map(([name, child]) => {
      const prefix = child.type === 'dir' ? '📁 ' : '📄 ';
      return `  ${prefix}${name}${child.type === 'dir' ? '/' : ''}`;
    });
    this.out(entries.length ? entries : ['  (empty)']);
  }

  private cmdCd(path?: string) {
    if (!path || path === '~') {
      this.cwd = ['home', 'hkmodd'];
      return;
    }

    const parts = path.startsWith('/')
      ? path.split('/').filter(Boolean)
      : [...this.cwd, ...path.split('/').filter(Boolean)];

    const resolved: string[] = [];
    for (const p of parts) {
      if (p === '..') resolved.pop();
      else if (p !== '.') resolved.push(p);
    }

    const node = this.resolve('/' + resolved.join('/'));
    if (!node) return this.err([`cd: no such directory: ${path}`]);
    if (node.type !== 'dir') return this.err([`cd: not a directory: ${path}`]);

    this.cwd = resolved;
  }

  private cmdCat(path?: string) {
    if (!path) return this.err(['cat: missing file operand']);
    const node = this.resolve(path);
    if (!node) return this.err([`cat: ${path}: No such file or directory`]);
    if (node.type !== 'file') return this.err([`cat: ${path}: Is a directory`]);
    this.out((node.content ?? '').split('\n'));
  }

  private cmdCrack() {
    if (this.ctfSolved) {
      this.success(['🏴 Flag already captured! You\'re a true operator.']);
      return;
    }

    this.crackStage++;

    switch (this.crackStage) {
      case 1:
        this.out([
          '🔓 Initiating brute-force decryption...',
          '   [████░░░░░░] 30% — Key space analysis',
          '   Partial key recovered: 0x4F...',
          '   Run `crack` again to continue...',
        ]);
        break;
      case 2:
        this.out([
          '🔓 Continuing decryption...',
          '   [███████░░░] 65% — Rainbow table lookup',
          '   Decrypting layer 2 of 3...',
          '   Almost there... run `crack` one more time.',
        ]);
        break;
      default:
        this.ctfSolved = true;
        this.success([
          '🏴 DECRYPTION COMPLETE!',
          '',
          '   ╔═══════════════════════════════════╗',
          '   ║  FLAG{hkm0dd_r3d_t3am_0p3r4t0r}  ║',
          '   ╚═══════════════════════════════════╝',
          '',
          '   Congratulations, operator.',
          '   You\'ve proven your persistence.',
        ]);
    }
  }

  private out(lines: string[]) {
    lines.forEach((text) => this.history.push({ id: nextLineId(), type: 'output', text }));
  }

  private err(lines: string[]) {
    lines.forEach((text) => this.history.push({ id: nextLineId(), type: 'error', text }));
  }

  private success(lines: string[]) {
    lines.forEach((text) => this.history.push({ id: nextLineId(), type: 'success', text }));
  }
}
