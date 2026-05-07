export interface DeepDiveData {
  id: string;
  name: string;
  subtitle: string;
  descriptionIt: string;
  descriptionEn: string;
  useCasesIt: string[];
  useCasesEn: string[];
  techStats: {
    complexity: number;
    usage: number; // 0-100
  };
}

export const ARSENAL_DEEP_DIVE: Record<string, DeepDiveData> = {
  'Ghidra': {
    id: 'ghidra',
    name: 'Ghidra',
    subtitle: 'SRE Framework / NSA',
    descriptionIt: 'Framework di Software Reverse Engineering (SRE) sviluppato dall\'NSA. Lo utilizzo per disassemblare, decompilare e analizzare binari ostili. La sua architettura modulare permette di iniettare script custom in Python/Java per mappare dinamicamente l\'esecuzione del payload e svelare algoritmi di cifratura offuscati.',
    descriptionEn: 'Software Reverse Engineering (SRE) framework developed by the NSA. I use it to disassemble, decompile, and analyze hostile binaries. Its modular architecture allows injecting custom Python/Java scripts to dynamically map payload execution and unveil obfuscated cryptographic algorithms.',
    useCasesIt: ['Analisi statica di malware e ransomware', 'Ingegneria inversa di protocolli non documentati', 'Patching e bypass di routine di sicurezza'],
    useCasesEn: ['Static analysis of malware and ransomware', 'Reverse engineering of undocumented protocols', 'Patching and bypassing security routines'],
    techStats: { complexity: 95, usage: 80 }
  },
  'Wireshark': {
    id: 'wireshark',
    name: 'Wireshark',
    subtitle: 'Network Protocol Analyzer',
    descriptionIt: 'Lo standard de facto per l\'ispezione dei protocolli di rete. Lo sfrutto per dissezionare traffico PCAP, individuare esfiltrazioni di dati silenziose e ricostruire sessioni TCP/UDP frammentate. Essenziale per le fasi di network forensics durante un incidente.',
    descriptionEn: 'The de facto standard for network protocol inspection. I leverage it to dissect PCAP traffic, identify silent data exfiltration, and reconstruct fragmented TCP/UDP sessions. Essential for network forensics during an incident.',
    useCasesIt: ['Packet sniffing e network forensics', 'Analisi del traffico C2 (Command & Control)', 'Troubleshooting di stream TLS/SSL anomali'],
    useCasesEn: ['Packet sniffing and network forensics', 'C2 (Command & Control) traffic analysis', 'Troubleshooting anomalous TLS/SSL streams'],
    techStats: { complexity: 80, usage: 85 }
  },
  'OSINT': {
    id: 'osint',
    name: 'OSINT',
    subtitle: 'Open-Source Intelligence',
    descriptionIt: 'Metodologia di intelligence basata sull\'analisi di fonti pubbliche. Sviluppo e utilizzo framework automatizzati per aggregare data leak, footprint digitali e asset esposti in chiaro, mappando la superficie d\'attacco prima che lo facciano gli avversari.',
    descriptionEn: 'Intelligence methodology based on public source analysis. I develop and use automated frameworks to aggregate data leaks, digital footprints, and exposed plaintext assets, mapping the attack surface before adversaries do.',
    useCasesIt: ['Asset discovery e mappatura topologica', 'Analisi dei data breach storici (Dark Web)', 'Profilazione vettori di attacco social engineering'],
    useCasesEn: ['Asset discovery and topological mapping', 'Historical data breach analysis (Dark Web)', 'Profiling social engineering attack vectors'],
    techStats: { complexity: 75, usage: 90 }
  },
  'Splunk / SIEM': {
    id: 'splunk',
    name: 'Splunk / SIEM',
    subtitle: 'Log Aggregation & Alerting',
    descriptionIt: 'Piattaforma di Data-to-Everything per la sicurezza aziendale. Configuro architetture SIEM complesse per ingerire terabyte di log di sistema e di rete. Scrivo query SPL avanzate per correlare eventi apparentemente scollegati e generare alert SOC ad alta affidabilità.',
    descriptionEn: 'Data-to-Everything platform for enterprise security. I configure complex SIEM architectures to ingest terabytes of system and network logs. I write advanced SPL queries to correlate seemingly unrelated events and generate high-fidelity SOC alerts.',
    useCasesIt: ['Correlazione eventi multi-layer', 'Threat hunting proattivo nei log', 'Automazione dashboard per il Triage'],
    useCasesEn: ['Multi-layer event correlation', 'Proactive threat hunting in logs', 'Dashboard automation for Triage'],
    techStats: { complexity: 85, usage: 95 }
  },
  'Threat Intel': {
    id: 'threat-intel',
    name: 'Threat Intel',
    subtitle: 'Adversary Tactics Profiling',
    descriptionIt: 'Analisi strategica e tattica delle minacce. Utilizzo framework come MITRE ATT&CK per contestualizzare gli Indicatori di Compromissione (IoC) e adattare le difese aziendali ai TTP (Tactics, Techniques, and Procedures) specifici dei gruppi APT.',
    descriptionEn: 'Strategic and tactical threat analysis. I use frameworks like MITRE ATT&CK to contextualize Indicators of Compromise (IoC) and adapt enterprise defenses to the specific TTPs (Tactics, Techniques, and Procedures) of APT groups.',
    useCasesIt: ['Integrazione di feed IoC dinamici', 'Mappatura TTP su matrice MITRE ATT&CK', 'Produzione report strategici difensivi'],
    useCasesEn: ['Integration of dynamic IoC feeds', 'TTP mapping on MITRE ATT&CK matrix', 'Production of strategic defensive reports'],
    techStats: { complexity: 90, usage: 85 }
  },
  'Incident Response': {
    id: 'incident-response',
    name: 'Incident Response',
    subtitle: 'Cyber Crisis Management',
    descriptionIt: 'Applicazione pratica di procedure di contenimento, eradicazione e recovery. Intervengo in scenari di crisi (es. epidemie Ransomware) isolando gli host compromessi, prelevando artefatti forensi e ricostruendo la kill chain per fermare l\'emorragia.',
    descriptionEn: 'Practical application of containment, eradication, and recovery procedures. I intervene in crisis scenarios (e.g., Ransomware outbreaks) by isolating compromised hosts, extracting forensic artifacts, and reconstructing the kill chain to stop the bleeding.',
    useCasesIt: ['Triage rapido di sistemi infetti', 'Acquisizione forense di RAM e dischi', 'Coordinamento recovery post-breach'],
    useCasesEn: ['Rapid triage of infected systems', 'Forensic acquisition of RAM and disks', 'Post-breach recovery coordination'],
    techStats: { complexity: 95, usage: 80 }
  },
  'Rust': {
    id: 'rust',
    name: 'Rust',
    subtitle: 'Memory-Safe Systems Programming',
    descriptionIt: 'Il cuore della mia programmazione low-level moderna. Garantisce sicurezza della memoria thread-safe azzerando vulnerabilità classiche come buffer overflow. Lo uso per sviluppare tool crittografici, demoni di sistema velocissimi e agenti malware/C2 ad alte prestazioni.',
    descriptionEn: 'The core of my modern low-level programming. It guarantees thread-safe memory security, eliminating classic vulnerabilities like buffer overflows. I use it to develop cryptographic tools, lightning-fast system daemons, and high-performance malware/C2 agents.',
    useCasesIt: ['Sviluppo di agent endpoint nativi', 'Crittografia ad alte prestazioni', 'Tooling di sicurezza bypass-AV'],
    useCasesEn: ['Native endpoint agent development', 'High-performance cryptography', 'AV-bypass security tooling'],
    techStats: { complexity: 95, usage: 90 }
  },
  'Python': {
    id: 'python',
    name: 'Python',
    subtitle: 'Security Scripting & Automation',
    descriptionIt: 'Il coltellino svizzero dell\'ingegnere di sicurezza. Perfetto per automatizzare pipeline SOC, scrivere exploit proof-of-concept e processare rapidamente dump di dati giganteschi. Indispensabile per orchestrare API di intelligenza artificiale.',
    descriptionEn: 'The Swiss army knife of the security engineer. Perfect for automating SOC pipelines, writing proof-of-concept exploits, and rapidly processing massive data dumps. Indispensable for orchestrating artificial intelligence APIs.',
    useCasesIt: ['Sviluppo rapido exploit PoC', 'Automazione flussi SOAR e SOC', 'Elaborazione dati per AI/ML'],
    useCasesEn: ['Rapid PoC exploit development', 'SOAR and SOC flow automation', 'Data processing for AI/ML'],
    techStats: { complexity: 70, usage: 100 }
  },
  'C / C++': {
    id: 'c-cpp',
    name: 'C / C++',
    subtitle: 'Low-Level Engine Architecture',
    descriptionIt: 'Fondamentali per interagire direttamente con l\'hardware e le API del kernel (Windows/Linux). Indispensabili nell\'analisi statica per comprendere il codice vulnerabile e nello sviluppo di hook, shellcode e manipolazione diretta della memoria.',
    descriptionEn: 'Fundamental for interacting directly with hardware and kernel APIs (Windows/Linux). Indispensable in static analysis to understand vulnerable code and in the development of hooks, shellcode, and direct memory manipulation.',
    useCasesIt: ['Ricerca vulnerabilità in software legacy', 'Sviluppo kernel driver/rootkit', 'Iniezione shellcode e hook di memoria'],
    useCasesEn: ['Vulnerability research in legacy software', 'Kernel driver/rootkit development', 'Shellcode injection and memory hooking'],
    techStats: { complexity: 90, usage: 75 }
  },
  'TypeScript': {
    id: 'typescript',
    name: 'TypeScript',
    subtitle: 'Full-Stack Type Safety',
    descriptionIt: 'Tipizzazione statica per la solidità architetturale. Lo utilizzo sia per scalare backend complessi (Node/Bun) che per forgiare interfacce UI "Production Grade" (React/Next). Previene intere classi di bug in runtime.',
    descriptionEn: 'Static typing for architectural solidity. I use it both to scale complex backends (Node/Bun) and to forge "Production Grade" UI interfaces (React/Next). It prevents entire classes of runtime bugs.',
    useCasesIt: ['Sviluppo architetture frontend complesse', 'Backend API secure-by-design', 'Integrazione con framework Agentic AI'],
    useCasesEn: ['Complex frontend architecture development', 'Secure-by-design backend APIs', 'Integration with Agentic AI frameworks'],
    techStats: { complexity: 80, usage: 95 }
  },
  'Tauri': {
    id: 'tauri',
    name: 'Tauri',
    subtitle: 'Rust-Native Desktop Apps',
    descriptionIt: 'Il futuro delle applicazioni Desktop cross-platform. Permette di combinare la velocità nativa di Rust nel backend con l\'estetica web nel frontend. Resulta in binari minuscoli, veloci e con una superficie d\'attacco estremamente ridotta rispetto a Electron.',
    descriptionEn: 'The future of cross-platform Desktop applications. It allows combining the native speed of Rust in the backend with web aesthetics in the frontend. Results in tiny, fast binaries with a drastically reduced attack surface compared to Electron.',
    useCasesIt: ['UI per tool di sicurezza locali', 'Sostituzione performante di Electron', 'Isolamento sicuro IPC Core-Frontend'],
    useCasesEn: ['UI for local security tools', 'Performant replacement for Electron', 'Secure IPC Core-Frontend isolation'],
    techStats: { complexity: 85, usage: 80 }
  },
  'Context Engineering': {
    id: 'context-eng',
    name: 'Context Engineering',
    subtitle: 'Agentic Workflow Orchestration',
    descriptionIt: 'La nuova frontiera dell\'intelligenza artificiale. Progetto sistemi multi-agente e architetture di prompt dinamiche in cui LLM avanzati interagiscono con l\'ambiente, eseguono codice autonomamente e risolvono task ingegneristici complessi.',
    descriptionEn: 'The new frontier of artificial intelligence. I design multi-agent systems and dynamic prompt architectures where advanced LLMs interact with the environment, execute code autonomously, and solve complex engineering tasks.',
    useCasesIt: ['Sistemi RAG (Retrieval-Augmented Generation)', 'Orchestrazione AI autonoma via MCP', 'Automazione debug e Reverse Engineering'],
    useCasesEn: ['RAG (Retrieval-Augmented Generation) systems', 'Autonomous AI orchestration via MCP', 'Debug and Reverse Engineering automation'],
    techStats: { complexity: 95, usage: 90 }
  }
};
