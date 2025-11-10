import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor
} from '@angular/common/http';
import {from, lastValueFrom, Observable} from 'rxjs';
import {AuthService} from "./auth.service";

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(private authService: AuthService) {}

  intercept(req: HttpRequest<any>,
    next: HttpHandler): Observable<HttpEvent<any>> {
    return from(this.handle(req, next))
  }

  async handle(req: HttpRequest<any>, next: HttpHandler): Promise<HttpEvent<any>> {
      if (!req.headers.has('Authorization')) {
        try {
          const idToken = await this.authService.getToken();
          if (idToken) {
            const cloned = req.clone({
              headers: req.headers.set("Authorization", "Bearer " + idToken)
            });

            return lastValueFrom(next.handle(cloned));
          }
        } catch (error) {
          // Ignore errors and proceed without token
        }
      }

    return lastValueFrom(next.handle(req));
  }
}
