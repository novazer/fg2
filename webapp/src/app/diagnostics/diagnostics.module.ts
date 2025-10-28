import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { DiagnosticsPageRoutingModule } from './diagnostics-routing.module';
import { NgChartsModule } from 'ng2-charts';
import { HighchartsChartModule } from 'highcharts-angular';

import { PipesModule } from 'src/app/pipes/pipes.module';
import { DiagnosticsPage } from './diagnostics.page';
import { TranslateModule } from '@ngx-translate/core';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    NgChartsModule,
    HighchartsChartModule,
    PipesModule,
    DiagnosticsPageRoutingModule,
    TranslateModule.forChild()
  ],
  declarations: [DiagnosticsPage]
})
export class DiagnosticsPageModule {}
