import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { TranslateModule } from '@ngx-translate/core';
import { DevicesModule } from 'src/app/devices/devices.module';
import {AlarmsComponent} from "./alarms.component";

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TranslateModule.forChild(),
  ],
  exports: [
    AlarmsComponent
  ],
  declarations: [AlarmsComponent]
})
export class AlarmsModule {}
