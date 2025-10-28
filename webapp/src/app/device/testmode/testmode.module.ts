import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { TestmodePageRoutingModule } from './testmode-routing.module';

import { TestmodePage } from './testmode.page';
import { TranslateModule } from '@ngx-translate/core';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TestmodePageRoutingModule,
    TranslateModule.forChild(),
  ],
  declarations: [TestmodePage]
})
export class TestmodePageModule {}
