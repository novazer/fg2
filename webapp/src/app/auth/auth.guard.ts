import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { firstValueFrom, Observable } from 'rxjs';
import { environment } from 'src/environments/environment';
import type { DeviceAccessInfo } from '@fg2/shared-types';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(public auth: AuthService, public router: Router, private http: HttpClient) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree
  {
    if (this.auth.authenticated.value) {
      return true;
    }

    return this.canActivatePublicRoute(route);
  }

  private async canActivatePublicRoute(route: ActivatedRouteSnapshot): Promise<boolean> {
    const routePath = route.routeConfig?.path;
    const isPublicCapableRoute = routePath === 'device/:device_id/charts' || routePath === 'device/:device_id/diary';
    const deviceId = route.paramMap.get('device_id');

    if (isPublicCapableRoute && deviceId) {
      try {
        const result = await firstValueFrom(
          this.http.get<DeviceAccessInfo>(
            environment.API_URL + '/device/cloudsettings/' + deviceId,
            { headers: { Authorization: '' } },
          ),
        );

        if (result?.isPublic || result?.cloudSettings?.publicRead) {
          return true;
        }
      } catch (_error) {}
    }

    await this.router.navigate(['login']);
    return false;
  }

}
