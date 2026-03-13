import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';
import type { RecipeTemplate } from '@fg2/shared-types';

@Injectable({
  providedIn: 'root'
})
export class RecipeService {
  private base = environment.API_URL + '/device';

  constructor(private http: HttpClient) {}

  public async listTemplates(): Promise<RecipeTemplate[]> {
    return await firstValueFrom(this.http.get<RecipeTemplate[]>(`${this.base}/recipes`));
  }

  public async getTemplate(id: string): Promise<RecipeTemplate> {
    return await firstValueFrom(this.http.get<RecipeTemplate>(`${this.base}/recipes/${id}`));
  }

  public async createTemplate(name: string, steps: RecipeTemplate['steps'], isPublic: boolean) {
    const body = { name, steps, public: isPublic };
    return await firstValueFrom(this.http.post<RecipeTemplate>(`${this.base}/recipes`, body));
  }

  public async deleteTemplate(id: string) {
    return await firstValueFrom(this.http.delete(`${this.base}/recipes/${id}`));
  }
}

