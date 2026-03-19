export interface DossierCard {
  header: string;
  title: string;
  body: string;
}

export interface AIIntelCard {
  header: string;
  title: string;
  body: string;
}

export interface SkillItem {
  name: string;
  level: number;
  icon: string;
  desc: string;
}

export interface ProjectItem {
  title: string;
  tags: string;
  description: string;
  linkLabel: string;
  url: string;
  badge?: string;
  status?: 'LIVE' | 'BETA' | 'ARCHIVED';
}

export interface Translations {
  boot: { lines: string[] };
  hero: {
    name: string;
    realName: string;
    title: string;
    bio: string;
    scroll: string;
    status: string;
    github: string;
    linkedin: string;
    cv: string;
  };
  arsenal: {
    title: string;
    skills: SkillItem[];
  };
  ops: {
    title: string;
    projects: ProjectItem[];
  };
  identity: {
    title: string;
    cards: DossierCard[];
  };
  aiIntel: {
    title: string;
    subtitle: string;
    cards: AIIntelCard[];
  };
  terminal: {
    title: string;
    subtitle: string;
    greeting: string;
    prompt: string;
  };
  footer: {
    rights: string;
    madeWith: string;
    backToTop: string;
  };
  actions: {
    resetTheme: string;
    openTerminal: string;
    langToggle: string;
  };
  redteam: {
    activated: string;
    deactivated: string;
  };
}

const en: Translations = {
  boot: {
    lines: [
      'DARKCORE://INIT',
      'Initializing encrypted session...',
      'Loading defensive modules...',
      'Establishing secure channel...',
      'All systems operational.',
      'ACCESS GRANTED',
    ],
  },

  hero: {
    name: 'Sebastiano Gelmetti',
    realName: 'Sebastiano Gelmetti',
    title: 'Security Researcher & Systems Engineer',
    bio: 'Hacker mindset, maximum defense. I reverse-engineer binaries, defend SOCs, and build Rust tools to automate what others do by hand.',
    scroll: 'Scroll to explore',
    status: 'AVAILABLE FOR HIRE',
    github: '⟨/⟩ GitHub',
    linkedin: 'in LinkedIn',
    cv: '↓ CV',
  },

  arsenal: {
    title: 'Arsenal',
    skills: [
      { name: 'Ghidra', level: 90, icon: 'ghidra', desc: 'Binary reverse engineering & malware analysis' },
      { name: 'Wireshark', level: 80, icon: 'wireshark', desc: 'Network protocol analysis & deep packet inspection' },
      { name: 'OSINT', level: 85, icon: 'osint', desc: 'Open-source intelligence & recon automation' },
      { name: 'Splunk / SIEM', level: 85, icon: 'splunk', desc: 'Log analysis, alerting & threat correlation' },
      { name: 'Threat Intel', level: 90, icon: 'threat-intel', desc: 'IOC tracking & threat landscape mapping' },
      { name: 'Incident Response', level: 85, icon: 'incident-response', desc: 'Containment, digital forensics & recovery' },
      { name: 'Rust', level: 90, icon: 'rust', desc: 'Systems programming & memory-safe tooling' },
      { name: 'Python', level: 85, icon: 'python', desc: 'Security automation & analysis scripting' },
      { name: 'C / C++', level: 80, icon: 'c-cpp', desc: 'Low-level analysis & performance-critical code' },
      { name: 'TypeScript', level: 85, icon: 'typescript', desc: 'Full-stack applications & developer tooling' },
      { name: 'Tauri', level: 85, icon: 'tauri', desc: 'Desktop security apps, Rust-native performance' },
      { name: 'Context Engineering', level: 85, icon: 'context-eng', desc: 'Prompt design & multi-agent orchestration' },
    ],
  },

  ops: {
    title: 'Operations',
    projects: [
      {
        title: 'Projects-TO-LLMs',
        tags: 'RUST / TAURI / AI',
        description: 'Rust + Tauri tool converting full codebases into structured XML context for LLMs.',
        linkLabel: 'View Context Tool →',
        url: 'https://github.com/hkmodd/Projects-TO-LLMs',
        status: 'LIVE',
      },
      {
        title: 'CS0724IT',
        tags: 'PYTHON / CYBERSECURITY',
        description: 'Epicode Cybersecurity Specialist Bootcamp. Advanced network defense, penetration testing methodologies, and Python automation scripts.',
        linkLabel: 'View Bootcamp →',
        url: 'https://github.com/hkmodd/CS0724IT',
        badge: 'BOOTCAMP',
      },
      {
        title: 'DarkCore-Manager',
        tags: 'RUST / SYSTEM',
        description: 'High-performance orchestration tool for Steam layers. Rust-native memory safety, VDF virtualization, and advanced local library management.',
        linkLabel: 'View System Core →',
        url: 'https://github.com/hkmodd/DarkCore-Manager',
        status: 'LIVE',
      },
      {
        title: 'INSTAFollows-Ult.',
        tags: 'RUST + TAURI',
        description: 'Elite OSINT & Surveillance Tool. Stealth surveillance, traitor detection & mass management with 100% local privacy architecture.',
        linkLabel: 'View Surveillance →',
        url: 'https://github.com/hkmodd/INSTAFollows-Ultimate',
        status: 'BETA',
      },
      {
        title: 'INSTASTREAM-Ult.',
        tags: 'RUST + RTMP',
        description: 'Next-gen Instagram Live broadcast tool. Secure cookies.json auth, auto-key negotiation, and cyberpunk glassmorphism UI.',
        linkLabel: 'View Broadcast →',
        url: 'https://github.com/hkmodd/INSTASTREAM-Ultimate',
        status: 'BETA',
      },
      {
        title: 'Calcologas',
        tags: 'TYPESCRIPT / MEME',
        description: 'Meme Premium gas bill calculator. Fallout-style aesthetics, cinematic effects, and synthesized sound engine. Made for grandpa.',
        linkLabel: 'View Anomaly →',
        url: 'https://github.com/hkmodd/Calcologas',
        status: 'LIVE',
      },
    ],
  },

  identity: {
    title: 'Identity Record',
    cards: [
      {
        header: 'ROOT ACCESS // ORIGIN',
        title: 'The Hacker Mindset',
        body: "I wasn't born in a classroom. My curiosity started by disassembling firmware and bypassing hardware protections (Xbox/XGD3) to understand <em>how</em> things work. This self-taught Reverse Engineering background gives me a tactical advantage: <strong>I think like the attacker.</strong>",
      },
      {
        header: 'PROTOCOL // EVOLUTION',
        title: 'Cybersecurity Specialist',
        body: 'Certified <strong>Epicode (+600h)</strong>. I transformed my passion into offensive and defensive methodology. From Penetration Testing to Linux/Windows hardening. I don\'t just run tools — I analyze attack vectors and mitigate critical vulnerabilities (OWASP Top 10).',
      },
      {
        header: 'HUMAN INTEL // LEADERSHIP',
        title: 'Operational Integrity',
        body: '3+ years of Team Management in high-pressure environments (Hospitality Management). I know how to coordinate resources under stress, make critical decisions in real-time, and maintain operational integrity. A SOC Analyst with the <strong>managerial composure</strong> of a Team Leader.',
      },
    ],
  },

  aiIntel: {
    title: 'AI Intelligence',
    subtitle: 'I don\'t just use AI — I engineer with it. Deep familiarity with models, toolchains, and developer-grade AI workflows.',
    cards: [
      {
        header: 'TOOLCHAIN // MASTERY',
        title: 'AI-Augmented Development',
        body: 'Daily power user of <strong>Antigravity (Gemini)</strong>, <strong>Cursor (Claude/GPT)</strong>, and <strong>GitHub Copilot</strong>. I use AI agents as pair-programming partners — not chatbots. I engineer custom prompts, system instructions, and multi-agent pipelines for complex codebases.',
      },
      {
        header: 'MODELS // KNOWLEDGE',
        title: 'Closed & Open Source Models',
        body: 'Deep knowledge of <strong>GPT-4o, Claude 3.5/4, Gemini 2.5 Pro</strong> (closed) and <strong>LLaMA 3, Mistral, DeepSeek, Qwen</strong> (open). I understand context windows, tokenization, fine-tuning, RAG architectures, and when to use which model for which task.',
      },
      {
        header: 'WORKFLOW // INTEGRATION',
        title: 'Developer, Not Just User',
        body: 'I build <strong>Rust + Tauri tools</strong> that convert entire codebases into LLM context (Projects-TO-LLMs). I design AI-augmented development workflows: automated code review, intelligent refactoring, security scanning with AI-driven triage. The difference between <em>using</em> AI and <em>engineering</em> with it.',
      },
      {
        header: 'SECURITY // AI',
        title: 'AI in Cybersecurity',
        body: 'Applying AI to <strong>threat detection</strong>, log analysis, and anomaly hunting. Using LLMs to accelerate incident response, automate OSINT, and generate detection rules. Understanding both the <strong>offensive potential</strong> and defensive applications of AI in security operations.',
      },
    ],
  },

  terminal: {
    title: 'TERMINAL',
    subtitle: 'Interactive command-line environment. Type "help" to begin.',
    greeting: 'Welcome to HKModd Terminal v2.0\nType "help" for available commands.\n',
    prompt: 'hkmodd@darkcore',
  },

  footer: {
    rights: '© 2026 HKModd. All rights reserved.',
    madeWith: 'Engineered with React + TypeScript + Three.js',
    backToTop: 'Back to top',
  },

  actions: {
    resetTheme: '⟲ EXIT RED TEAM',
    openTerminal: 'OPEN TERMINAL',
    langToggle: 'IT',
  },

  redteam: {
    activated: '⚠ ROOT ACCESS GRANTED — DARKCORE PROTOCOL ACTIVE',
    deactivated: 'Default mode restored',
  },
};

export default en;
