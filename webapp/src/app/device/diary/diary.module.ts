import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { NgChartsModule } from 'ng2-charts';
import { HighchartsChartModule } from 'highcharts-angular';

import { DiaryPage } from './diary.page';
import { PipesModule } from 'src/app/pipes/pipes.module';
import { TranslateModule } from '@ngx-translate/core';
import {DiaryPageRoutingModule} from "./diary-routing.module";

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    NgChartsModule,
    HighchartsChartModule,
    DiaryPageRoutingModule,
    PipesModule,
    TranslateModule.forChild()
  ],
  declarations: [DiaryPage]
})
export class DiaryPageModule {}
