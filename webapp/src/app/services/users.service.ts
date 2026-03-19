import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
import type { User } from '@fg2/shared-types';

export type UserLite = Pick<User, 'user_id' | 'username' | 'is_admin'>;

export interface CreateUser {
  username: string;
  password: string;
  is_admin: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class UsersService {

  constructor(private http: HttpClient) { }

  public async getAll() : Promise<UserLite[]> {
    let data = await firstValueFrom(this.http.get<UserLite[]>(environment.API_URL + '/users'));
    console.log(data)
    return data;

  }

  public async create(user: CreateUser) {
    return firstValueFrom(this.http.post(environment.API_URL + '/users', user));
  }
}
