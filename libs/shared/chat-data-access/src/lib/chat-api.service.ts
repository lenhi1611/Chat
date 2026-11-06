import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, InjectionToken } from '@angular/core';
import {
  API_PATHS,
  type ConversationDTO,
  type CreateConversationRequest,
  isApiError,
  type ListMessagesResponse,
  type WsTicketResponse,
} from '@realtime-chat/contracts';
import type { Observable } from 'rxjs';
import type { RequestError } from './chat.models';

/** e.g. `http://localhost:3000/api`, without a trailing slash. */
export const CHAT_API_BASE_URL = new InjectionToken<string>(
  'CHAT_API_BASE_URL',
);

/**
 * REST calls of the chat. The Bearer token, and a refresh on TOKEN_EXPIRED,
 * come from the auth interceptor (provideAuth with the same apiBaseUrl).
 */
@Injectable()
export class ChatApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(CHAT_API_BASE_URL);

  wsTicket(): Observable<WsTicketResponse> {
    return this.http.post<WsTicketResponse>(
      this.url(API_PATHS.auth.wsTicket),
      {},
    );
  }

  listConversations(): Observable<ConversationDTO[]> {
    return this.http.get<ConversationDTO[]>(this.url(API_PATHS.conversations));
  }

  createConversation(
    request: CreateConversationRequest,
  ): Observable<ConversationDTO> {
    return this.http.post<ConversationDTO>(
      this.url(API_PATHS.conversations),
      request,
    );
  }

  /** `before: null` → the latest page. */
  listMessages(
    conversationId: string,
    before: number | null,
  ): Observable<ListMessagesResponse> {
    return this.http.get<ListMessagesResponse>(
      this.url(API_PATHS.conversationMessages(conversationId)),
      { params: before === null ? {} : { before } },
    );
  }

  private url(path: string): string {
    return `${this.baseUrl}/${path}`;
  }
}

export function toRequestError(error: unknown): RequestError {
  if (error instanceof HttpErrorResponse && isApiError(error.error)) {
    const { code, message } = error.error.error;
    return { code, message };
  }
  return {
    code: 'NETWORK_ERROR',
    message: 'Cannot reach the server. Check your connection and try again.',
  };
}

export const isUnauthorized = (error: unknown): boolean =>
  error instanceof HttpErrorResponse && error.status === 401;
