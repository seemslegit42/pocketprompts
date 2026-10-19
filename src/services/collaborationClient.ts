export interface CollaboratorPresence {
  clientId: string;
  userName: string;
  userColor: string;
  roomId: string;
  focusedField: string | null;
  cursorPos: number;
  isTyping: boolean;
  updatedAt: string;
}

export interface LivePromptDraftPayload {
  roomId: string;
  title: string;
  prompt: string;
  insertion_point: number;
  color: string;
  followup_prompt: string;
  placeholder_hint: string;
  show_action_bars: boolean;
  use_structured_outputs: boolean;
  structured_schema: string;
  dot_template: string;
  category_ids: string[];
  lastEditedBy?: string;
  lastEditedByColor?: string;
  updatedAt?: string;
}

export function getCollabWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/collab`;
}

export const COLLABORATOR_PRESETS = [
  { name: 'A. Rivera (Mobile RN)', color: '#F2A7A0' },
  { name: 'M. Chen (Prompt Eng)', color: '#3EB991' },
  { name: 'S. Patel (Systems Lead)', color: '#20B2AA' },
  { name: 'K. Vance (Policy Audit)', color: '#FFD700' },
];
