import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface TemplateSummary {
  _id: string;
  name: string;
  owner_id?: string;
  public: boolean;
  createdAt?: number;
  updatedAt?: number;
}

@Injectable({
  providedIn: 'root'
})
export class RecipeService {
  private base = environment.API_URL + '/device';

  constructor(private http: HttpClient) {}

  public async listTemplates(): Promise<TemplateSummary[]> {
    return await firstValueFrom(this.http.get<TemplateSummary[]>(`${this.base}/recipes`));
  }

  public async getTemplate(id: string): Promise<any> {
    return await firstValueFrom(this.http.get<any>(`${this.base}/recipes/${id}`));
  }

  public async createTemplate(name: string, steps: any, isPublic: boolean) {
    const body = { name, steps, public: isPublic };
    return await firstValueFrom(this.http.post(`${this.base}/recipes`, body));
  }

  public async deleteTemplate(id: string) {
    return await firstValueFrom(this.http.delete(`${this.base}/recipes/${id}`));
  }
}

