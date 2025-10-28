import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';


export interface User {
  user_id: string;
  username: string;
  is_admin: boolean;
};

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

  public async getAll() : Promise<User[]> {
    let data = await firstValueFrom(this.http.get<User[]>(environment.API_URL + '/users'));
    console.log(data)
    return data;

  }

  public async create(user: CreateUser) {
    return firstValueFrom(this.http.post(environment.API_URL + '/users', user));
  }
}
