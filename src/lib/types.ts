export interface Profile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  emoji: string;
  lat: number | null;
  lng: number | null;
  family_id: string;
  created_at: string;
}

export interface Member {
  id: string;
  family_id: string;
  name: string;
  role: string;
  emoji: string;
  color: string;
  schedules: unknown[];
  created_at: string;
}

export interface Contact {
  id: string;
  family_id: string;
  name: string;
  phone: string;
  relation: string;
  emoji: string;
  created_at: string;
}

export interface Address {
  id: string;
  family_id: string;
  name: string;
  emoji: string;
  address: string;
  lat: number | null;
  lng: number | null;
  members: string[];
  created_at: string;
}

export interface Event {
  id: string;
  family_id: string;
  title: string;
  description: string;
  time: string;
  date: string;
  member_id: string | null;
  recurring: RecurringConfig | null;
  created_at: string;
  members?: Member;
}

export interface RecurringConfig {
  days: number[];
  time_start: string;
  time_end: string;
}

export interface WellbeingSession {
  id: string;
  user_id: string;
  activity: string;
  minutes: number;
  date: string;
  created_at: string;
}

export interface DeviceLocation {
  id: string;
  family_id: string;
  user_id: string;
  device_name: string;
  emoji: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  updated_at: string;
  created_at: string;
}

export interface FlowAction {
  type: "add_event" | "delete_event" | "add_recurring";
  data: Record<string, unknown>;
}

export interface FlowResponse {
  response?: string;
  action?: FlowAction;
}
