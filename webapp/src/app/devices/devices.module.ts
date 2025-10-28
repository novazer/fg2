import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { PipesModule } from 'src/app/pipes/pipes.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { FridgeOverviewComponent } from './fridge/overview/overview.component';
import { FanOverviewComponent } from './fan/overview/overview.component';
import { ComponentsModule } from '../components/components.module';
import { RouterModule } from '@angular/router';
import { FridgeSettingComponent } from './fridge/settings/settings.component';
import { FanSettingsComponent } from './fan/settings/settings.component';
import { LightOverviewComponent } from './light/overview/overview.component';
import { LightSettingsComponent } from './light/settings/settings.component';
import { PlugOverviewComponent } from './plug/overview/overview.component';
import { PlugSettingsComponent } from './plug/settings/settings.component';
import { DryerOverviewComponent } from './dryer/overview/overview.component';
import { DryerSettingComponent } from './dryer/settings/settings.component';


@NgModule({
  declarations: [
    FridgeOverviewComponent,
    FridgeSettingComponent,
    FanOverviewComponent,
    FanSettingsComponent,
    LightOverviewComponent,
    LightSettingsComponent,
    PlugOverviewComponent,
    PlugSettingsComponent,
    DryerOverviewComponent,
    DryerSettingComponent
  ],
  exports: [
    FridgeOverviewComponent,
    FridgeSettingComponent,
    FanOverviewComponent,
    FanSettingsComponent,
    LightOverviewComponent,
    LightSettingsComponent,
    PlugOverviewComponent,
    PlugSettingsComponent,
    DryerOverviewComponent,
    DryerSettingComponent
  ],
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
  ]
})
export class DevicesModule { }
