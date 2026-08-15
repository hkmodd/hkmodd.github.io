import type { Translations } from './en';

const it: Translations = {
  boot: {
    hint: 'Traccia la S',
    hintTap: 'Tocca la S',
  },

  hero: {
    name: 'Sebastiano Gelmetti',
    realName: 'Sebastiano Gelmetti',
    title: 'Sistemi LLM, orchestrazione, difesa',
    bio: 'Ricerca su come i language model diventano sistemi veri: contesto, tool, harness multi-agente, runtime locali e cloud. Dodici anni sul metal, seicento ore certificate, Rust e Tauri in produzione.',
    scroll: 'Scorri',
    status: 'Aperto a nuove collaborazioni',
    github: '⟨/⟩ GitHub',
    linkedin: 'in LinkedIn',
    cv: '↓ CV',
    contact: 'Parliamone',
    proofLine: '12 anni di sicurezza · 600h Epicode · diploma 2025',
    punch: ['Costruisco sistemi', 'non chat', 'non giocattoli'],
  },

  kicker: {
    arsenal: 'Mestiere',
    operations: 'Lavori scelti',
    operationsLoading: 'Aggiorno i progetti',
    operationsReady: 'progetti',
    identity: 'Chi sono',
    certs: 'Su carta',
    aiIntel: 'Ricerca',
    terminal: 'Sandbox',
    contact: 'Un caffè',
  },

  arsenal: {
    title: 'Arsenale',
    groupLabels: {
      recon: 'Analisi',
      defense: 'Difesa',
      engineering: 'Ingegneria',
      tooling: 'Strumenti',
    },
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
    liveWebApps: 'Sul web',
    openSource: 'Open source',
    flagship: {
      kicker: 'Flagship',
      title: 'Projects-TO-LLMs',
      tags: 'RUST / TAURI / AI',
      problem: 'Un LLM cieco su una codebase è rumore. Serve <strong>contesto strutturato</strong>, non un dump di file.',
      outcome: 'Pipeline locale Rust + Tauri che serializza interi repository in XML contestuale per LLM. Memory-safe. <strong>Zero dati escono dalla macchina.</strong>',
      cta: 'Apri il repo',
      url: 'https://github.com/hkmodd/Projects-TO-LLMs',
    },
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
        header: 'Origini',
        title: 'La sicurezza come vocazione',
        body: "Studio la sicurezza dai dodici anni: firmware, protezioni hardware, il momento esatto in cui un sistema cede. Dodici anni di pratica hanno costruito un approccio orientato alla <strong>difesa</strong>. Imparo come le cose si rompono perché possano tenere.",
      },
      {
        header: 'Formazione',
        title: 'Cybersecurity Specialist',
        body: "Reso formale nel <strong>2024</strong> con il percorso <strong>Epicode (+600h)</strong> Cybersecurity Specialist. Penetration testing, hardening Linux/Windows, OWASP Top 10, automazione Python. Integro l'AI nel lavoro per andare più veloce, e costruisco strumenti che <strong>allargano la portata difensiva</strong>.",
      },
      {
        header: 'Esperienza',
        title: 'Calma sotto pressione',
        body: "Tre anni a guidare team in hospitality ad alta pressione. Coordinamento, decisioni rapide, integrità operativa tenuta insieme. Il profilo di lavoro è semplice: <strong>affidabile, metodico, puntato al risultato.</strong>",
      },
    ],
    certs: {
      kicker: 'Prova terza parte',
      title: 'Certificazioni',
      diplomaTitle: 'Cybersecurity Specialist',
      diplomaMeta: 'Epicode · CS0724IT · 19 febbraio 2025 · +600h',
      diplomaCta: 'Scarica PDF',
      close: 'Chiudi',
      modules: [
        { code: 'M0', title: 'Basi di Cybersecurity', date: '03.11.2024' },
        { code: 'M1', title: 'Ethical Hacking e Networking', date: '08.11.2024' },
        { code: 'M2', title: 'Python e C', date: '15.11.2024' },
        { code: 'M3', title: 'Ethical Hacking con Python', date: '22.11.2024' },
        { code: 'M4', title: 'Assessment e Pentest', date: '06.12.2024' },
        { code: 'M5', title: 'Web Apps e Exploit', date: '13.12.2024' },
        { code: 'M6', title: 'Keylogger, Backdoor, Metasploit', date: '20.12.2024' },
        { code: 'M7', title: 'SIEM, Log, SOC, Malware', date: '17.01.2025' },
        { code: 'M8', title: 'Splunk, IAM, Windows', date: '24.01.2025' },
        { code: 'M9', title: 'Remediation e Mitigation', date: '31.01.2025' },
      ],
    },
  },

  contact: {
    kicker: 'Canale diretto',
    title: 'Contatto',
    body: 'Garda. Aperto per ricerca e ruoli su sistemi LLM, orchestrazione e sicurezza.',
    cta: 'Scrivimi',
    location: 'Garda, Italia',
  },

  aiIntel: {
    title: 'Sistemi LLM',
    subtitle: 'Ricerca e costruzione del layer intorno al modello: contesto, tool, agenti, runtime. I nomi sulle API cambiano. I problemi di sistema no.',
    cards: [
      {
        header: 'Orchestrazione',
        title: 'Agenti come sistema, non come chat',
        body: 'Progetto <strong>harness multi-agente</strong>: tool-use, routing, memoria, handoff, modi di fallire. Il modello è un componente. Il sistema è il lavoro. Pratica quotidiana su agenti in IDE, runtime locali ed endpoint cloud, senza inchiodare una versione che sarà vecchia il trimestre dopo.',
      },
      {
        header: 'Contesto',
        title: 'Cosa il modello è autorizzato a vedere',
        body: 'Il context engineering è il mestiere. Impacchetto repository, log e tool in <strong>contesto strutturato e budgetato</strong> (Projects-TO-LLMs). Retrieval, packing, eval, e la decisione di cosa non entra nella finestra. È lì che vive la qualità.',
      },
      {
        header: 'Runtime',
        title: 'Frontier, pesi aperti, on-device',
        body: 'Mi muovo tra <strong>API chiuse, pesi aperti e inferenza locale</strong> a seconda del problema. Quantizzazione, VRAM, latenza, e dove i byte possono andare. Il punto è scegliere un runtime, non collezionare uno zoo di modelli.',
      },
      {
        header: 'Difesa',
        title: 'Lo stesso stack, puntato sulla sicurezza',
        body: 'Applico quello stack a <strong>detection, triage dei log, accelerazione degli incidenti, OSINT</strong>. Stessa disciplina: contesto, tool, eval. Capisco come questi sistemi cedono, così si usano per difendere, non per decorare un curriculum.',
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
    contact: 'Contatto',
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
