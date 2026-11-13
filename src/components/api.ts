/**
 * Description:  Browser helpers for calling /api/command and tracking an action's busy, error and
 *               success state.
 * Author:       Alex Wu
 * Dependencies: react, server/validation.ts
 * Usage:
 */
'use client';
import { useState } from 'react';
import type { Operation } from '@/server/validation';
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
export async function api<T = unknown>(
  operation: Operation,
  payload: unknown = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch('/api/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, payload }),
    cache: 'no-store',
    signal,
  });
  const body = await response.json();
  if (!response.ok)
    throw new ApiError(
      body.error ?? 'Request failed.',
      response.status,
      Number(response.headers.get('Retry-After')) || 0,
    );
  return body.data as T;
}
export function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  async function run<T>(fn: () => Promise<T>, message = 'Saved.'): Promise<T | undefined> {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await fn();
      setSuccess(message);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, success, run };
}
export function formValues(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form));
}
