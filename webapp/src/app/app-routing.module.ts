import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './auth/auth.guard';
import { IsAdminGuard } from './auth/isadmin.guard';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'list',
    pathMatch: 'full'
  },
  {
    path: 'list',
    canActivate:[AuthGuard],
    loadChildren: () => import('./device/list/list.module').then( m => m.ListPageModule)
  },
  {
    path: 'device/:device_id/charts',
    canActivate:[AuthGuard],
    loadChildren: () => import('./device/charts/charts.module').then( m => m.ChartsPageModule)
  },
  {
    path: 'device/:device_id/settings',
    canActivate:[AuthGuard],
    loadChildren: () => import('./device/settings/settings.module').then( m => m.SettingsPageModule)
  },
  {
    path: 'device/:device_id/testmode',
    canActivate:[AuthGuard],
    loadChildren: () => import('./device/testmode/testmode.module').then( m => m.TestmodePageModule)
  },
  {
    path: 'diagnostics',
    canActivate:[IsAdminGuard],
    loadChildren: () => import('./diagnostics/diagnostics.module').then( m => m.DiagnosticsPageModule)
  },
  {
    path: 'login',
    loadChildren: () => import('./login/login.module').then( m => m.LoginPageModule)
  },
  {
    path: 'account',
    canActivate:[AuthGuard],
    loadChildren: () => import('./account/account.module').then( m => m.AccountPageModule)
  },
  {
    path: 'classes',
    loadChildren: () => import('./classes/classes.module').then( m => m.ClassesPageModule)
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule {}
