import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { TestmodePage } from './testmode.page';

const routes: Routes = [
  {
    path: '',
    component: TestmodePage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class TestmodePageRoutingModule {}
