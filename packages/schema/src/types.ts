export interface ManifestSchema {
  $schema?: string;
  name: string;
  version: string;
  description: string;
  displayName?: string;
  author?: string | { name: string; email?: string; url?: string };
  homepage?: string;
  repository?: string;
  license?: string;
  keywords?: string[];
  defaultEnabled?: boolean;
  emitLanguage?: 'typescript' | 'javascript' | 'go';
  skills?: SkillSchema[];
  hooks?: HooksSchema;
  mcpServers?: Record<string, MCPServerSchema>;
  tools?: ToolSchema[];
  commands?: CommandSchema[];
  agents?: AgentSchema[];
  rules?: RuleSchema[];
  lspServers?: LSPServerSchema[];
  userConfig?: Record<string, UserConfigOptionSchema>;
  settings?: UserConfigOptionSchema[];
  metadata?: Record<string, unknown>;
  targets?: string[];
}

export interface SkillSchema {
  name: string;
  description: string;
  content?: string;
  filePath?: string;
}

export interface MCPServerSchema {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'http';
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: ToolParametersSchema;
}

export interface ToolParametersSchema {
  type: 'object';
  properties: Record<string, ToolParameterSchema>;
  required?: string[];
}

export interface ToolParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: ToolParameterSchema;
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
}

export interface CommandSchema {
  name: string;
  description?: string;
  prompt?: string;
}

export interface AgentSchema {
  name: string;
  description?: string;
  prompt?: string;
  tools?: string[];
}

export interface RuleSchema {
  name: string;
  description?: string;
  pattern?: string;
  action?: 'allow' | 'deny' | 'warn';
}

export interface LSPServerSchema {
  name: string;
  command: string;
  args?: string[];
  languages?: string[];
}

export interface UserConfigOptionSchema {
  type: 'string' | 'number' | 'boolean' | 'directory' | 'file';
  title: string;
  description: string;
  sensitive?: boolean;
  required?: boolean;
  default?: unknown;
  multiple?: boolean;
}

export interface HooksSchema {
  sessionStart?: HookDefinitionSchema;
  sessionEnd?: HookDefinitionSchema;
  userPromptSubmit?: HookDefinitionSchema;
  userPromptExpansion?: HookDefinitionSchema;
  preToolUse?: HookDefinitionSchema;
  postToolUse?: HookDefinitionSchema;
  postToolUseFailure?: HookDefinitionSchema;
  permissionRequest?: HookDefinitionSchema;
  permissionDenied?: HookDefinitionSchema;
  subagentStart?: HookDefinitionSchema;
  subagentStop?: HookDefinitionSchema;
  preCompact?: HookDefinitionSchema;
  postCompact?: HookDefinitionSchema;
  stop?: HookDefinitionSchema;
  stopFailure?: HookDefinitionSchema;
  notification?: HookDefinitionSchema;
  fileChanged?: HookDefinitionSchema;
  cwdChanged?: HookDefinitionSchema;
  setup?: HookDefinitionSchema;
}

export interface HookDefinitionSchema {
  matcher?: string;
  handler: HookHandlerSchema;
}

export type HookHandlerSchema = CommandHandlerSchema | HttpHandlerSchema | ReferenceHandlerSchema;

export interface CommandHandlerSchema {
  type: 'command';
  command: string;
  statusMessage?: string;
  shell?: 'bash' | 'powershell' | 'cmd';
}

export interface HttpHandlerSchema {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

export interface ReferenceHandlerSchema {
  type: 'reference';
  reference: string;
}

export interface AgentPathEntry {
  name: string;
  displayName?: string;
  skillPath: string;
  binary: string;
  manifestPath?: string;
}

export interface AgentPathsRegistry {
  version: number;
  description?: string;
  store: { path: string; description?: string };
  skillsCompat: { path: string; description?: string };
  agents: AgentPathEntry[];
}
