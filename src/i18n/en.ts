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

export interface FlagshipCopy {
  kicker: string;
  title: string;
  tags: string;
  problem: string;
  outcome: string;
  cta: string;
  url: string;
}

export interface CertModuleCopy {
  code: string;
  title: string;
  date: string;
}

export interface Translations {
  boot: { hint: string; hintTap: string };
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
    contact: string;
    proofLine: string;
    punch: string[];
  };
  kicker: {
    arsenal: string;
    operations: string;
    operationsLoading: string;
    operationsReady: string;
    identity: string;
    certs: string;
    aiIntel: string;
    terminal: string;
    contact: string;
  };
  arsenal: {
    title: string;
    groupLabels: {
      recon: string;
      defense: string;
      engineering: string;
      tooling: string;
    };
    skills: SkillItem[];
  };
  ops: {
    title: string;
    liveWebApps: string;
    openSource: string;
    flagship: FlagshipCopy;
    projects: ProjectItem[];
  };
  identity: {
    title: string;
    cards: DossierCard[];
    certs: {
      kicker: string;
      title: string;
      diplomaTitle: string;
      diplomaMeta: string;
      diplomaCta: string;
      close: string;
      modules: CertModuleCopy[];
    };
  };
  contact: {
    kicker: string;
    title: string;
    body: string;
    cta: string;
    location: string;
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
    contact: string;
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
    hint: 'From the ground',
    hintTap: 'Tap the bolt',
  },

  hero: {
    name: 'Sebastiano Gelmetti',
    realName: 'Sebastiano Gelmetti',
    title: 'LLM systems, orchestration, defense',
    bio: 'I research how language models get built into real systems: context, tools, multi-agent harnesses, local and cloud runtimes. Twelve years on the metal, six hundred hours certified, Rust and Tauri in production.',
    scroll: 'Keep going',
    status: 'Open to new work',
    github: '⟨/⟩ GitHub',
    linkedin: 'in LinkedIn',
    cv: '↓ CV',
    contact: 'Let\'s talk',
    proofLine: '12 years in security · 600h Epicode · diploma 2025',
    punch: ['I build systems', 'not chats', 'not toys'],
  },

  kicker: {
    arsenal: 'Craft',
    operations: 'Selected work',
    operationsLoading: 'Updating projects',
    operationsReady: 'projects',
    identity: 'About',
    certs: 'On paper',
    aiIntel: 'Research',
    terminal: 'Playground',
    contact: 'A coffee',
  },

  arsenal: {
    title: 'Arsenal',
    groupLabels: {
      recon: 'Analysis',
      defense: 'Defense',
      engineering: 'Engineering',
      tooling: 'Tools',
    },
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
    liveWebApps: 'On the web',
    openSource: 'Open source',
    flagship: {
      kicker: 'Flagship',
      title: 'Projects-TO-LLMs',
      tags: 'RUST / TAURI / AI',
      problem: 'A blind LLM on a codebase is noise. You need <strong>structured context</strong>, not a file dump.',
      outcome: 'Local Rust + Tauri pipeline that serializes entire repositories into contextual XML for LLMs. Memory-safe. <strong>Zero data leaves the machine.</strong>',
      cta: 'Open repo',
      url: 'https://github.com/hkmodd/Projects-TO-LLMs',
    },
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
        header: 'Origins',
        title: 'Security as a vocation',
        body: "I've studied security since I was twelve: firmware, hardware protections, the exact moment a system gives way. Twelve years of practice built an approach rooted in <strong>defense</strong>. I learn how things break so they can hold.",
      },
      {
        header: 'Training',
        title: 'Cybersecurity Specialist',
        body: 'Made formal in <strong>2024</strong> with the <strong>Epicode (+600h)</strong> Cybersecurity Specialist path. Penetration testing, Linux/Windows hardening, OWASP Top 10, Python automation. I fold AI into the workflow to move faster, and I build tools that <strong>multiply defensive reach</strong>.',
      },
      {
        header: 'Experience',
        title: 'Calm under pressure',
        body: 'Three years leading teams in high-pressure hospitality. Coordination, fast calls, operational integrity kept intact. The working profile is simple: <strong>reliable, methodical, aimed at the result.</strong>',
      },
    ],
    certs: {
      kicker: 'Third-party proof',
      title: 'Certifications',
      diplomaTitle: 'Cybersecurity Specialist',
      diplomaMeta: 'Epicode · CS0724IT · 19 February 2025 · +600h',
      diplomaCta: 'Download PDF',
      close: 'Close',
      modules: [
        { code: 'M0', title: 'Cybersecurity Basics', date: '03.11.2024' },
        { code: 'M1', title: 'Ethical Hacking & Networking', date: '08.11.2024' },
        { code: 'M2', title: 'Python & C', date: '15.11.2024' },
        { code: 'M3', title: 'Ethical Hacking with Python', date: '22.11.2024' },
        { code: 'M4', title: 'Assessment & Pentest', date: '06.12.2024' },
        { code: 'M5', title: 'Web Apps & Exploit', date: '13.12.2024' },
        { code: 'M6', title: 'Keylogger, Backdoor, Metasploit', date: '20.12.2024' },
        { code: 'M7', title: 'SIEM, Log, SOC, Malware', date: '17.01.2025' },
        { code: 'M8', title: 'Splunk, IAM, Windows', date: '24.01.2025' },
        { code: 'M9', title: 'Remediation & Mitigation', date: '31.01.2025' },
      ],
    },
  },

  contact: {
    kicker: 'Direct channel',
    title: 'Contact',
    body: 'Based in Garda. Open for research and roles in LLM systems, orchestration, and security.',
    cta: 'Write me',
    location: 'Garda, Italy',
  },

  aiIntel: {
    title: 'LLM Systems',
    subtitle: 'I research and build the layer around the model: context, tools, agents, runtimes. The names on the API change. The systems problems do not.',
    cards: [
      {
        header: 'Orchestration',
        title: 'Agents as a system, not a chat',
        body: 'I design <strong>multi-agent harnesses</strong>: tool-use, routing, memory, handoff, failure modes. The model is a component. The system is the work. Daily practice across IDE agents, local runtimes, and cloud endpoints, without pinning a version that will be stale next quarter.',
      },
      {
        header: 'Context',
        title: 'What the model is allowed to see',
        body: 'Context engineering is the job. I pack repositories, logs, and tools into <strong>structured, budgeted context</strong> (Projects-TO-LLMs). Retrieval, packing, eval, and the decision of what never enters the window. That is where quality actually lives.',
      },
      {
        header: 'Runtime',
        title: 'Frontier, open weights, on-device',
        body: 'I move across <strong>closed APIs, open weights, and local inference</strong> as the problem requires. Quantization, VRAM, latency, and where the bytes are allowed to go. The point is choosing a runtime, not collecting a model zoo.',
      },
      {
        header: 'Defense',
        title: 'The same stack, pointed at security',
        body: 'I apply that stack to <strong>detection, log triage, incident acceleration, OSINT</strong>. Same discipline: context, tools, eval. I understand how these systems fail, so they can be used to defend, not to decorate a resume.',
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
    contact: 'Contact',
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
