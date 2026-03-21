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
  nav: {
    hero: string;
    arsenal: string;
    operations: string;
    identity: string;
    terminal: string;
  };
  footer: {
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
    bio: '',
    scroll: 'Scroll to explore',
    status: 'OPEN TO OPPORTUNITIES',
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
        description: 'Privacy-first social media analytics and monitoring tool. Follower tracking, change detection & bulk management — all data processed locally, nothing leaves the device.',
        linkLabel: 'View Project →',
        url: 'https://github.com/hkmodd/INSTAFollows-Ultimate',
        status: 'BETA',
      },
      {
        title: 'INSTASTREAM-Ult.',
        tags: 'RUST + RTMP',
        description: 'Next-gen Instagram Live broadcast tool. Secure token-based authentication, automatic key negotiation, and modern dark-theme interface.',
        linkLabel: 'View Broadcast →',
        url: 'https://github.com/hkmodd/INSTASTREAM-Ultimate',
        status: 'BETA',
      },
    ],
  },

  identity: {
    title: 'Professional Profile',
    cards: [
      {
        header: 'BACKGROUND // ORIGIN',
        title: 'Security-First Since Day One',
        body: "Exploring security since age 12: analyzing firmware, studying hardware protection mechanisms, understanding <em>how and why</em> systems fail. 12+ years of hands-on experience built a professional approach rooted in <strong>defense</strong>. I study vulnerabilities to prevent them — not to exploit them.",
      },
      {
        header: 'TRAINING // CERTIFICATIONS',
        title: 'Cybersecurity Specialist',
        body: 'Formalized in <strong>2024</strong> with <strong>Epicode (+600h)</strong> Cybersecurity Specialist certification. Core competencies in Penetration Testing, Linux/Windows hardening, OWASP Top 10 mitigation, and Python automation. Integrating AI-augmented workflows to accelerate analysis and development, building tools that <strong>multiply defensive capabilities</strong>.',
      },
      {
        header: 'LEADERSHIP // EXPERIENCE',
        title: 'Operational Reliability',
        body: '3+ years of team management in high-pressure environments (Hospitality Management). Proven track record in resource coordination, rapid decision-making under stress, and maintaining operational integrity. Professional profile: <strong>reliable, methodical, results-driven.</strong>',
      },
    ],
  },

  aiIntel: {
    title: 'AI Intelligence',
    subtitle: 'Deep, hands-on experience integrating AI tooling into development workflows. Professional familiarity with models, toolchains, and enterprise-grade AI pipelines.',
    cards: [
      {
        header: 'TOOLCHAIN // MASTERY',
        title: 'AI-Augmented Development',
        body: 'Advanced daily use of <strong>Antigravity (Gemini)</strong>, <strong>Cursor (Claude/GPT)</strong>, and <strong>GitHub Copilot</strong>. I integrate AI agents as pair-programming tools, not chatbots. I engineer custom prompts, system instructions, and multi-agent pipelines for complex codebases.',
      },
      {
        header: 'MODELS // KNOWLEDGE',
        title: 'Closed & Open Source Models',
        body: 'Deep knowledge of <strong>GPT-4o, Claude 3.5/4, Gemini 2.5 Pro</strong> (closed) and <strong>LLaMA 3, Mistral, DeepSeek, Qwen</strong> (open). I understand context windows, tokenization, fine-tuning, RAG architectures, and how to select the right model for each use case.',
      },
      {
        header: 'WORKFLOW // INTEGRATION',
        title: 'Builder, Not Just User',
        body: 'I build <strong>Rust + Tauri tools</strong> that convert entire codebases into LLM context (Projects-TO-LLMs). I design AI-augmented development workflows: automated code review, intelligent refactoring, security scanning with AI-driven triage. The difference between <em>using</em> AI and <em>engineering</em> with it.',
      },
      {
        header: 'SECURITY // AI',
        title: 'AI in Cybersecurity',
        body: 'Applying AI to <strong>threat detection</strong>, log analysis, and anomaly detection. Using LLMs to accelerate incident response, automate OSINT workflows, and generate detection rules. Understanding both the <strong>offensive potential</strong> and defensive applications of AI in security operations.',
      },
    ],
  },

  terminal: {
    title: 'TERMINAL',
    subtitle: 'Interactive command-line environment. Type "help" to begin.',
    greeting: 'Welcome to HKModd Terminal v2.0\nType "help" for available commands.\n',
    prompt: 'hkmodd@darkcore',
  },

  nav: {
    hero: 'Home',
    arsenal: 'Arsenal',
    operations: 'Operations',
    identity: 'Profile',
    terminal: 'Terminal',
  },

  footer: {
    madeWith: 'Engineered with React + TypeScript + Three.js',
    backToTop: 'Back to top',
  },

  actions: {
    resetTheme: '⟲ EXIT RED TEAM',
    openTerminal: 'OPEN TERMINAL',
    langToggle: 'IT',
  },

  redteam: {
    activated: '⚠ ROOT ACCESS GRANTED // DARKCORE PROTOCOL ACTIVE',
    deactivated: 'Default mode restored',
  },
};

export default en;
