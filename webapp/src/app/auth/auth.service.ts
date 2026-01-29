import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, catchError, from, firstValueFrom, Observable, tap, Subject } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { User } from '../services/users.service';
import { DateTime, Interval } from "luxon";
import { environment } from 'src/environments/environment';
import { Router } from '@angular/router';

const EXPIRE_SAFETY_SECONDS = 10;

interface LoginData {
  userToken: any,
  refreshToken: any,
  imageToken: any,
  user: User
}
@Injectable({
  providedIn: 'root'
})
export class AuthService implements OnDestroy {

  public authenticated: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  public current_user: BehaviorSubject<User|null> = new BehaviorSubject<User|null>(null);
  private waitForToken: Promise<void> | null = null;

  constructor(private http: HttpClient, public router: Router) {
  }

  public ngOnDestroy(): void {
    this.authenticated.next(false);
    this.authenticated.complete();
    this.current_user.next(null);
    this.current_user.complete();
  }

  public async login(username: string, password: string, stayLoggedIn: boolean) {
    const loginPromise  = firstValueFrom(this.http.post<LoginData>(
      environment.API_URL + "/login",
      {
        username,
        password,
        stayLoggedIn
      },
      { headers: { 'Authorization': '' } }
    ))
      .then(login => {
        this.setLogin(login);
      })
      .finally(() => this.waitForToken = null);
    this.waitForToken = loginPromise as unknown as Promise<void>;
    await loginPromise;
  }

  public async activate(activation_code: string) {
    return await firstValueFrom(this.http.post<LoginData>(environment.API_URL + "/activate", {activation_code: activation_code}));
  }

  public async register(username: string, password: string) {
    return await firstValueFrom(this.http.post<LoginData>(environment.API_URL + "/signup", {username: username, password: password}));
  }

  public async getToken(): Promise<string | null> {
    if (this.waitForToken === null) {
      this.waitForToken = this.refresh()
          .finally(() => this.waitForToken = null);
    }

    try {
      await this.waitForToken;
    } catch (err) {}

    return localStorage.getItem('id_token');
  }

  public async getImageToken(): Promise<string | null> {
    try {
      await this.getToken();
    } catch (err) {}

    return localStorage.getItem('image_token');
  }

  private async refresh() {
    const user = localStorage.getItem('user');
    const idToken = localStorage.getItem('id_token');
    const refreshToken = localStorage.getItem('refresh_token');
    const expiresAt = localStorage.getItem('expires_at');
    const refreshExpiresAt = localStorage.getItem('refresh_expires_at');
    const nowUnixtime = DateTime.now().toUnixInteger();

    try {
      if (idToken && expiresAt && nowUnixtime < DateTime.fromISO(expiresAt).toUnixInteger() && user) {
        if (!this.authenticated.getValue()) {
          this.authenticated.next(true);
        }

        const parsedUser = JSON.parse(user);
        if (parsedUser && this.current_user.getValue()?.user_id !== parsedUser.user_id) {
          this.current_user.next(parsedUser);
        }
        return;
      }

      if (refreshToken && refreshExpiresAt && nowUnixtime < DateTime.fromISO(refreshExpiresAt).toUnixInteger()) {
          const login = await firstValueFrom(this.http.post<LoginData>(
            environment.API_URL + "/refresh",
            { token: refreshToken },
            { headers: { 'Authorization': '' } }
          ));
          this.setLogin(login);
          return;
      }
    } catch (err: any) {
      console.log("auth error", err)

      if (err && 'status' in err && err.status === 401) {
        await this.logout();
      }
    }
  }

  public async logout() {
    this.authenticated.next(false);
    this.current_user.next(null);
    localStorage.removeItem('id_token');
    localStorage.removeItem('user');
    localStorage.removeItem('expires_at');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('refresh_expires_at');
    await this.router.navigate(['login']);
  }

  public async changePassword(new_password:string) {
    await firstValueFrom(this.http.post<LoginData>(environment.API_URL + "/changepass", {username: '', password: new_password}));
  }

  public async getPwToken(email:string) {
    await firstValueFrom(this.http.post<LoginData>(environment.API_URL + "/getreset", {username: email, password: ''}));
  }

  public async recoverPassword(new_password:string, token:string) {
    await firstValueFrom(this.http.post<LoginData>(environment.API_URL + "/reset", {password: new_password, token: token}));
  }

  private setLogin(login: LoginData) {
    localStorage.setItem('id_token', login.userToken.token);
    localStorage.setItem('refresh_token', login.refreshToken.token);
    localStorage.setItem('image_token', login.imageToken.token);
    localStorage.setItem("expires_at", DateTime.now().plus({seconds: login.userToken.expiresIn - EXPIRE_SAFETY_SECONDS}).toString());
    localStorage.setItem("refresh_expires_at", DateTime.now().plus({seconds: login.refreshToken.expiresIn - EXPIRE_SAFETY_SECONDS}).toString());

    if (!this.authenticated.getValue()) {
      this.authenticated.next(true);
    }

    if (login.user) {
      localStorage.setItem('user', JSON.stringify(login.user));

      if (this.current_user.getValue()?.user_id !== login.user?.user_id) {
        this.current_user.next(login.user);
      }
    } else {
      try {
        const parsedUser = JSON.parse(localStorage.getItem('user') || '');

        if (parsedUser && this.current_user.getValue()?.user_id !== parsedUser?.user_id) {
          this.current_user.next(login.user);
        }
      } catch (err) {}
    }

  }
}
