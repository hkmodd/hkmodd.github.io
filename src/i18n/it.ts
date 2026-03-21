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
    status: 'APERTO A OPPORTUNITÀ',
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
        description: 'Strumento di analisi e monitoraggio social media privacy-first. Tracciamento follower, rilevamento variazioni e gestione massiva — tutti i dati elaborati localmente, nulla esce dal dispositivo.',
        linkLabel: 'Vedi Progetto →',
        url: 'https://github.com/hkmodd/INSTAFollows-Ultimate',
        status: 'BETA',
      },
      {
        title: 'INSTASTREAM-Ult.',
        tags: 'RUST + RTMP',
        description: 'Strumento broadcast Instagram Live di nuova generazione. Autenticazione sicura basata su token, negoziazione automatica delle chiavi e interfaccia moderna dark-theme.',
        linkLabel: 'Vedi Broadcast →',
        url: 'https://github.com/hkmodd/INSTASTREAM-Ultimate',
        status: 'BETA',
      },
    ],
  },

  identity: {
    title: 'Profilo Professionale',
    cards: [
      {
        header: 'PERCORSO // ORIGINI',
        title: 'Sicurezza Informatica Come Vocazione',
        body: "Studio la sicurezza informatica dai 12 anni: analizzando firmware, esplorando meccanismi di protezione hardware, capendo <em>come e perché</em> i sistemi cedono. Oltre 12 anni di esperienza pratica hanno costruito un approccio professionale orientato alla <strong>difesa</strong>. Comprendo le vulnerabilità per prevenirle — non per sfruttarle.",
      },
      {
        header: 'FORMAZIONE // CERTIFICAZIONI',
        title: 'Cybersecurity Specialist',
        body: "Percorso formalizzato nel <strong>2024</strong> con certificazione <strong>Epicode (+600h)</strong> Cybersecurity Specialist. Competenze consolidate in Penetration Testing, Hardening Linux/Windows, mitigazione OWASP Top 10 e automazione Python. Integro workflow AI-augmented per accelerare analisi e sviluppo, costruendo strumenti che <strong>moltiplicano le capacità difensive</strong>.",
      },
      {
        header: 'LEADERSHIP // ESPERIENZA',
        title: 'Affidabilità Operativa',
        body: "3+ anni di gestione team in ambienti ad alta pressione (Hospitality Management). Esperienza concreta nel coordinamento risorse, decisioni rapide sotto stress e mantenimento dell'integrità operativa. Profilo professionale: <strong>affidabile, metodico, orientato al risultato.</strong>",
      },
    ],
  },

  aiIntel: {
    title: 'AI Intelligence',
    subtitle: 'Esperienza approfondita nell\'integrazione di strumenti AI nei workflow di sviluppo. Familiarità professionale con modelli, toolchain e pipeline di livello enterprise.',
    cards: [
      {
        header: 'STRUMENTI // COMPETENZE',
        title: 'Sviluppo AI-Augmented',
        body: 'Utilizzo avanzato quotidiano di <strong>Antigravity (Gemini)</strong>, <strong>Cursor (Claude/GPT)</strong> e <strong>GitHub Copilot</strong>. Integro agenti AI come strumenti di pair-programming, non semplici chatbot. Progetto prompt personalizzati, system instructions e pipeline multi-agente per codebase complesse.',
      },
      {
        header: 'MODELLI // CONOSCENZA',
        title: 'Modelli Closed e Open Source',
        body: 'Conoscenza approfondita di <strong>GPT-4o, Claude 3.5/4, Gemini 2.5 Pro</strong> (closed) e <strong>LLaMA 3, Mistral, DeepSeek, Qwen</strong> (open). Comprendo context window, tokenizzazione, fine-tuning, architetture RAG e la scelta del modello appropriato per ogni caso d\'uso.',
      },
      {
        header: 'WORKFLOW // INTEGRAZIONE',
        title: 'Sviluppatore, Non Solo Utente',
        body: 'Costruisco <strong>strumenti Rust + Tauri</strong> che convertono intere codebase in contesto LLM (Projects-TO-LLMs). Progetto workflow di sviluppo AI-augmented: code review automatica, refactoring intelligente, scanning di sicurezza con triage AI-driven. La differenza tra <em>usare</em> l\'AI e <em>sviluppare</em> con l\'AI.',
      },
      {
        header: 'SICUREZZA // AI',
        title: 'AI nella Cybersecurity',
        body: 'Applico l\'AI al <strong>threat detection</strong>, analisi log e rilevamento anomalie. Uso LLM per accelerare la risposta agli incidenti, automatizzare attività OSINT e generare regole di detection. Comprendo sia il <strong>potenziale offensivo</strong> che le applicazioni difensive dell\'AI nelle operazioni di sicurezza.',
      },
    ],
  },

  terminal: {
    title: 'TERMINALE',
    subtitle: 'Ambiente interattivo a riga di comando. Digita "help" per iniziare.',
    greeting: 'Benvenuto in HKModd Terminal v2.0\nDigita "help" per i comandi disponibili.\n',
    prompt: 'hkmodd@darkcore',
  },

  nav: {
    hero: 'Home',
    arsenal: 'Arsenale',
    operations: 'Operazioni',
    identity: 'Profilo',
    terminal: 'Terminale',
  },

  footer: {
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
