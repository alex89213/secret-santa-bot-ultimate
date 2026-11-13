/**
 * Description:  Shared types for the data the server sends to pages.
 * Author:       Alex Wu
 * Dependencies: domain/draw.ts
 * Usage:
 */
import type { DrawMode, Validation } from './draw';
export type Member = {
  id: string;
  group_id: string;
  /** Null only for past-only people recorded without a Discord account. */
  discord_id: string | null;
  display_name: string;
  role: 'admin' | 'member';
  active: boolean;
  /** Part of imported history only: no access, never in new draws, never messaged. */
  past_only: boolean;
};
export type Exchange = {
  id: string;
  group_id: string;
  name: string;
  budget: number | null;
  currency: string;
  status: 'draft' | 'finalized' | 'completed';
  historical: boolean;
  history_complete: boolean;
  mode: DrawMode;
  recent_count: number;
  revision: number;
  /** Chronological order within the group; past years can be placed between others. */
  sequence: number;
};
export type Group = {
  id: string;
  name: string;
  guild_id: string;
  admin: boolean;
  member_count: number;
  exchanges: Exchange[];
};
export type Context = {
  user: { id: string; discord_id: string; display_name: string };
  owner: boolean;
  setup_available: boolean;
  groups: Group[];
};
export type WishlistItem = {
  id: string;
  title: string;
  description: string;
  url: string | null;
  price: number | null;
  /** 1 is the most wanted. */
  position: number;
  created_at: string;
  updated_at: string;
};
export type GroupDetail = {
  group: Group;
  admin: boolean;
  members: Member[];
  exchanges: Exchange[];
};
export type Delivery = {
  id: string;
  giver: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  attempts: number;
  error_code: string | null;
  sent_at: string | null;
  next_attempt_at?: string;
};
export type DeliveryProgress = {
  deliveries: Delivery[];
  total: number;
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  next_attempt_at: string | null;
};
export type ExchangeDetail = {
  exchange: Exchange;
  group_name: string;
  admin: boolean;
  own_member_id: string | null;
  recipient: { id: string; display_name: string; wishlist: WishlistItem[] } | null;
  participants: Pick<Member, 'id' | 'display_name' | 'discord_id' | 'past_only'>[];
  validation: { report: Validation; optimal: boolean; created_at: string } | null;
  candidate_available: boolean;
  deliveries: Delivery[];
};
