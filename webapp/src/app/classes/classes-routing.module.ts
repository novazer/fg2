import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ClassesPage } from './classes.page';

const routes: Routes = [
  {
    path: '',
    component: ClassesPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ClassesPageRoutingModule {}
