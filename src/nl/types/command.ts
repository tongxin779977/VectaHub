export interface CommandInfo {
  name: string;
  description: string;
  usage: string;
  category: string;
}

export interface ToolInfo {
  name: string;
  version: string;
  commands: CommandInfo[];
  lastScanned: string;
}

export interface KnowledgeBaseData {
  version: string;
  tools: ToolInfo[];
}