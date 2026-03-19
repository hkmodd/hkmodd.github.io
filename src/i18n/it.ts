import type { Translations } from './en';

const it: Translations = {
  boot: {
    lines: [
      'DARKCORE://INIT',
      'Inizializzazione sessione criptata...',
      'Caricamento moduli difensivi...',
      'Canale sicuro stabilito...',
      'Tutti i sistemi operativi.',
      'ACCESSO GARANTITO',
    ],
  },

  hero: {
    name: 'Sebastiano Gelmetti',
    realName: 'Sebastiano Gelmetti',
    title: 'Security Researcher & Systems Engineer',
    bio: '',
    scroll: 'Scorri per esplorare',
    status: 'DISPONIBILE',
    github: '⟨/⟩ GitHub',
    linkedin: 'in LinkedIn',
    cv: '↓ CV',
  },

  arsenal: {
    title: 'Arsenale',
    skills: [
      { name: 'Ghidra', level: 90, icon: 'ghidra', desc: 'Reverse engineering binari e analisi malware' },
      { name: 'Wireshark', level: 80, icon: 'wireshark', desc: 'Analisi protocolli di rete e ispezione pacchetti' },
      { name: 'OSINT', level: 85, icon: 'osint', desc: 'Intelligence open-source e automazione ricognizione' },
      { name: 'Splunk / SIEM', level: 85, icon: 'splunk', desc: 'Analisi log, alerting e correlazione minacce' },
      { name: 'Threat Intel', level: 90, icon: 'threat-intel', desc: 'Tracciamento IOC e mappatura panorama minacce' },
      { name: 'Incident Response', level: 85, icon: 'incident-response', desc: 'Contenimento, digital forensics e recovery' },
      { name: 'Rust', level: 90, icon: 'rust', desc: 'Programmazione di sistema e tooling memory-safe' },
      { name: 'Python', level: 85, icon: 'python', desc: 'Automazione sicurezza e scripting analisi' },
      { name: 'C / C++', level: 80, icon: 'c-cpp', desc: 'Analisi low-level e codice performance-critical' },
      { name: 'TypeScript', level: 85, icon: 'typescript', desc: 'Applicazioni full-stack e developer tooling' },
      { name: 'Tauri', level: 85, icon: 'tauri', desc: 'App desktop sicurezza, performance Rust-native' },
      { name: 'Context Engineering', level: 85, icon: 'context-eng', desc: 'Progettazione prompt e orchestrazione multi-agent' },
    ],
  },

  ops: {
    title: 'Operazioni',
    projects: [
      {
        title: 'Projects-TO-LLMs',
        tags: 'RUST / TAURI / AI',
        description: 'Strumento Rust + Tauri per convertire intere codebase in contesto XML strutturato per LLM.',
        linkLabel: 'Vedi Context Tool →',
        url: 'https://github.com/hkmodd/Projects-TO-LLMs',
        status: 'LIVE',
      },
      {
        title: 'CS0724IT',
        tags: 'PYTHON / CYBERSECURITY',
        description: 'Bootcamp Epicode Cybersecurity Specialist. Difesa avanzata di rete, metodologie di penetration testing e script di automazione Python.',
        linkLabel: 'Vedi Bootcamp →',
        url: 'https://github.com/hkmodd/CS0724IT',
        badge: 'BOOTCAMP',
      },
      {
        title: 'DarkCore-Manager',
        tags: 'RUST / SYSTEM',
        description: 'Strumento di orchestrazione ad alte prestazioni per layer Steam. Memory safety nativa Rust, virtualizzazione VDF e gestione avanzata librerie locali.',
        linkLabel: 'Vedi System Core →',
        url: 'https://github.com/hkmodd/DarkCore-Manager',
        status: 'LIVE',
      },
      {
        title: 'INSTAFollows-Ult.',
        tags: 'RUST + TAURI',
        description: 'Strumento OSINT & Sorveglianza Elite. Sorveglianza stealth, rilevamento traditori e gestione di massa con architettura 100% locale.',
        linkLabel: 'Vedi Sorveglianza →',
        url: 'https://github.com/hkmodd/INSTAFollows-Ultimate',
        status: 'BETA',
      },
      {
        title: 'INSTASTREAM-Ult.',
        tags: 'RUST + RTMP',
        description: 'Strumento broadcast Instagram Live di nuova generazione. Auth sicura cookies.json, negoziazione auto-key e UI glassmorfismo cyberpunk.',
        linkLabel: 'Vedi Broadcast →',
        url: 'https://github.com/hkmodd/INSTASTREAM-Ultimate',
        status: 'BETA',
      },
    ],
  },

  identity: {
    title: 'Identity Record',
    cards: [
      {
        header: 'ROOT ACCESS // ORIGIN',
        title: 'Security-First Dal Giorno Zero',
        body: "Smanetto dai 12 anni: smontando firmware, aggirando protezioni hardware (Xbox/XGD3), capendo <em>come e perché</em> le cose si rompono. 12+ anni di curiosità hands-on hanno forgiato un mindset ossessionato dalla <strong>protezione</strong>. Capisco come cedono i sistemi per assicurarmi che non cedano. Sono quello che chiude la porta <em>e</em> controlla i cardini.",
      },
      {
        header: 'PROTOCOL // EVOLUTION',
        title: 'Cybersecurity Specialist',
        body: "Formalizzato nel <strong>2024</strong> con certificazione <strong>Epicode (+600h)</strong> Cybersecurity Specialist. Dal Penetration Testing all'Hardening Linux/Windows, mitigazione OWASP Top 10 e automazione Python. Poi accelerato con workflow AI-augmented, costruendo tool che moltiplicano le capacità difensive. <strong>Direzione chiara + AI = qualsiasi cosa è costruibile.</strong>",
      },
      {
        header: 'HUMAN INTEL // LEADERSHIP',
        title: 'Operational Integrity',
        body: "3+ anni di gestione Team in ambienti ad alta pressione (Hospitality Management). Coordino risorse sotto stress, prendo decisioni critiche in tempo reale e mantengo l'integrità operativa. Il tipo di persona a cui affidi l'accesso alla produzione: <strong>affidabile, composto, responsabile.</strong>",
      },
    ],
  },

  aiIntel: {
    title: 'AI Intelligence',
    subtitle: 'Non uso l\'AI. Ci sviluppo. Familiarità profonda con modelli, toolchain e workflow AI di livello developer.',
    cards: [
      {
        header: 'TOOLCHAIN // MASTERY',
        title: 'Sviluppo AI-Augmented',
        body: 'Power user quotidiano di <strong>Antigravity (Gemini)</strong>, <strong>Cursor (Claude/GPT)</strong> e <strong>GitHub Copilot</strong>. Uso agenti AI come partner di pair-programming, non chatbot. Progetto prompt personalizzati, istruzioni di sistema e pipeline multi-agente per codebase complesse.',
      },
      {
        header: 'MODELS // KNOWLEDGE',
        title: 'Modelli Closed & Open Source',
        body: 'Conoscenza approfondita di <strong>GPT-4o, Claude 3.5/4, Gemini 2.5 Pro</strong> (closed) e <strong>LLaMA 3, Mistral, DeepSeek, Qwen</strong> (open). Comprendo context window, tokenizzazione, fine-tuning, architetture RAG e quando usare quale modello per quale task.',
      },
      {
        header: 'WORKFLOW // INTEGRATION',
        title: 'Developer, Non Solo Utente',
        body: 'Costruisco <strong>tool Rust + Tauri</strong> che convertono intere codebase in contesto LLM (Projects-TO-LLMs). Progetto workflow di sviluppo AI-augmented: code review automatica, refactoring intelligente, scanning di sicurezza con triage AI-driven. La differenza tra <em>usare</em> l\'AI e <em>sviluppare</em> con l\'AI.',
      },
      {
        header: 'SECURITY // AI',
        title: 'AI nella Cybersecurity',
        body: 'Applico l\'AI al <strong>threat detection</strong>, analisi log e anomaly hunting. Uso LLM per accelerare incident response, automatizzare OSINT e generare detection rule. Comprendo sia il <strong>potenziale offensivo</strong> che le applicazioni difensive dell\'AI nelle operazioni di sicurezza.',
      },
    ],
  },

  terminal: {
    title: 'TERMINALE',
    subtitle: 'Ambiente interattivo a riga di comando. Digita "help" per iniziare.',
    greeting: 'Benvenuto in HKModd Terminal v2.0\nDigita "help" per i comandi disponibili.\n',
    prompt: 'hkmodd@darkcore',
  },

  footer: {
    rights: '© 2026 HKModd. Tutti i diritti riservati.',
    madeWith: 'Progettato con React + TypeScript + Three.js',
    backToTop: "Torna all'inizio",
  },

  actions: {
    resetTheme: '⟲ ESCI RED TEAM',
    openTerminal: 'APRI TERMINALE',
    langToggle: 'EN',
  },

  redteam: {
    activated: '⚠ ACCESSO ROOT GARANTITO // PROTOCOLLO DARKCORE ATTIVO',
    deactivated: 'Modalità default ripristinata',
  },
};

export default it;
