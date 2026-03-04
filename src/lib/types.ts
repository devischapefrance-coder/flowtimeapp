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
  avatar_url: string | null;
  created_at: string;
}

export interface Member {
  id: string;
  family_id: string;
  name: string;
  role: string;
  emoji: string;
  color: string;
  birth_date: string | null;
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
  category: string;
  shared: boolean;
  reminder_minutes: number | null;
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

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface Attachment {
  id: string;
  url: string;
  name: string;
  type: string;
}

export interface Note {
  id: string;
  family_id: string;
  title: string;
  content: string;
  category: "info" | "important" | "rappel";
  author_name: string;
  pinned: boolean;
  checklist: ChecklistItem[];
  attachments: Attachment[];
  visible_to: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface NoteComment {
  id: string;
  note_id: string;
  family_id: string;
  author_name: string;
  content: string;
  created_at: string;
}

export interface Birthday {
  id: string;
  family_id: string;
  name: string;
  date: string;
  emoji: string;
  member_id: string | null;
  created_at: string;
}

export interface Meal {
  id: string;
  family_id: string;
  date: string;
  meal_type: "petit-dejeuner" | "dejeuner" | "diner";
  name: string;
  emoji: string;
  created_at: string;
}

export interface ShoppingItem {
  id: string;
  family_id: string;
  name: string;
  category: string;
  checked: boolean;
  added_by: string;
  created_at: string;
}

export interface Expense {
  id: string;
  family_id: string;
  amount: number;
  description: string;
  category: string;
  member_id: string | null;
  date: string;
  created_at: string;
}

export interface Chore {
  id: string;
  family_id: string;
  name: string;
  emoji: string;
  frequency: "daily" | "weekly";
  assigned_members: string[];
  current_index: number;
  last_rotated: string | null;
  created_at: string;
}

export interface FamilyPhoto {
  id: string;
  family_id: string;
  url: string;
  caption: string;
  uploaded_by: string;
  event_id: string | null;
  week_label: string | null;
  created_at: string;
}

export interface FlowAction {
  type: "add_event" | "delete_event" | "edit_event" | "add_recurring";
  data: Record<string, unknown>;
}

export interface FlowResponse {
  response?: string;
  action?: FlowAction;
}
