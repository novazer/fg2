import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { TranslateModule } from '@ngx-translate/core';
import { DevicesModule } from 'src/app/devices/devices.module';
import {CloudSettingsComponent} from "./cloud-settings.component";
import {PipesModule} from "../../pipes/pipes.module";
import {ComponentsModule} from "../../components/components.module";
import {RouterModule} from "@angular/router";

@NgModule({
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    PipesModule,
    IonicModule,
    ReactiveFormsModule,
    ComponentsModule,
    RouterModule,
    TranslateModule.forChild()
  ],
  declarations: [CloudSettingsComponent],
  exports: [CloudSettingsComponent]
})
export class CloudSettingsModule {}
