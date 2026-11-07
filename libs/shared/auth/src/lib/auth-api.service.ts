import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  API_PATHS,
  type AuthResponse,
  type LoginRequest,
  type RegisterRequest,
} from '@realtime-chat/contracts';
import type { Observable } from 'rxjs';
import { AUTH_CONFIG } from './auth.config';

/**
 * REST calls of the auth routes. Those that read or set the refresh cookie
 * (register, login, refresh, logout) go `withCredentials`: the API is on
 * another origin, so the browser only sends/stores the cookie when asked.
 */
@Injectable()
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(AUTH_CONFIG).apiBaseUrl;

  register(request: RegisterRequest): Observable<AuthResponse> {
    return this.post(API_PATHS.auth.register, request);
  }

  login(request: LoginRequest): Observable<AuthResponse> {
    return this.post(API_PATHS.auth.login, request);
  }

  refresh(): Observable<AuthResponse> {
    return this.post(API_PATHS.auth.refresh, {});
  }

  logout(): Observable<unknown> {
    return this.post(API_PATHS.auth.logout, {});
  }

  private post<T>(path: string, body: unknown): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}/${path}`, body, {
      withCredentials: true,
    });
  }
}
