import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, catchError, from, firstValueFrom, Observable, tap, Subject } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { User } from '../services/users.service';
import { DateTime, Interval } from "luxon";
import { environment } from 'src/environments/environment';
import { Router } from '@angular/router';

interface LoginData {
  userToken: any,
  refreshToken: any,
  user: User
}
@Injectable({
  providedIn: 'root'
})
export class AuthService implements OnDestroy {

  private logout_timer:any;
  public authenticated: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  public current_user: BehaviorSubject<User|null> = new BehaviorSubject<User|null>(null);

  constructor(private http: HttpClient, public router: Router) {
    const user = localStorage.getItem('user');
    const id_token = localStorage.getItem('id_token');
    const expires_at = localStorage.getItem('expires_at');
    try {
      if(user && id_token && expires_at) {
        if(DateTime.fromISO(expires_at) > DateTime.now()) {
          this.setTimer();
          this.authenticated.next(true);
          this.current_user.next(JSON.parse(user));
        }
      }
    }
    catch(err) {
      console.log("auth error", err)
      this.authenticated.next(false);
    }
  }

  private setTimer() {
    if(this.logout_timer) {
      clearTimeout(this.logout_timer)
      this.logout_timer = null;
    }
    const expires_at = localStorage.getItem('expires_at');
    if(expires_at) {
      const delay = Interval.fromDateTimes(DateTime.now(), DateTime.fromISO(expires_at)).length('milliseconds');
      this.logout_timer = setTimeout(() => this.refresh(), delay)
    }

  }

  public ngOnDestroy(): void {
    this.authenticated.next(false);
    this.authenticated.complete();
  }

  public async login(username: string, password: string) {
    const login = await firstValueFrom(this.http.post<LoginData>(environment.API_URL + "/login", {username: username, password: password}));

    localStorage.setItem('id_token', login.userToken.token);
    localStorage.setItem('refresh_token', login.refreshToken.token);
    localStorage.setItem('user', JSON.stringify(login.user));
    localStorage.setItem("expires_at", DateTime.now().plus({seconds: login.userToken.expiresIn}).toString() );

    this.authenticated.next(true);
    this.current_user.next(login.user);
    this.setTimer();
  }

  public async activate(activation_code: string) {
    return await firstValueFrom(this.http.post<LoginData>(environment.API_URL + "/activate", {activation_code: activation_code}));
  }

  public async register(username: string, password: string) {
    return await firstValueFrom(this.http.post<LoginData>(environment.API_URL + "/signup", {username: username, password: password}));
  }

  private async refresh() {
    const refresh_token = localStorage.getItem('refresh_token');
    try {
      const login = await firstValueFrom(this.http.post<LoginData>(environment.API_URL + "/refresh", {token: refresh_token}));

      localStorage.setItem('id_token', login.userToken.token);
      localStorage.setItem('refresh_token', login.refreshToken.token);
      localStorage.setItem("expires_at", DateTime.now().plus({seconds: login.userToken.expiresIn}).toString() );

      this.setTimer();
    }
    catch(err) {
      this.authenticated.next(false);
    }
  }

  public async logout() {
    this.authenticated.next(false);
    localStorage.removeItem('id_token');
    localStorage.removeItem('user');
    localStorage.removeItem('expires_at');
    this.router.navigate(['login']);
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
}
