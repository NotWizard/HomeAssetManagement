import { deleteJSON, getJSON, postJSON, putJSON } from './apiClient';
import type { Member } from '../types';

export function fetchMembers() {
  return getJSON<Member[]>('/members');
}

export function createMember(name: string) {
  return postJSON<Member>('/members', { name });
}

export function updateMember(id: number, name: string) {
  return putJSON<Member>(`/members/${id}`, { name });
}

export function deleteMember(id: number) {
  return deleteJSON<boolean>(`/members/${id}`);
}
