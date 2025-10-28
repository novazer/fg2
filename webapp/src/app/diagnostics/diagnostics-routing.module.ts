import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { DiagnosticsPage } from './diagnostics.page';

const routes: Routes = [
  {
    path: '',
    component: DiagnosticsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class DiagnosticsPageRoutingModule {}
