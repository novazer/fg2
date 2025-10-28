import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { SettingsPageRoutingModule } from './settings-routing.module';

import { SettingsPage } from './settings.page';
import { TranslateModule } from '@ngx-translate/core';
import { DevicesModule } from 'src/app/devices/devices.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DevicesModule,
    SettingsPageRoutingModule,
    TranslateModule.forChild(),
  ],
  declarations: [SettingsPage]
})
export class SettingsPageModule {}
