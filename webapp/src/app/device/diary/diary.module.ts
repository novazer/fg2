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
import {DevicesModule} from "../../devices/devices.module";
import { Co2ReportComponent } from './co2-report/co2-report.component';
import { DiaryEntryModalComponent } from './diary-entry-modal/diary-entry-modal.component';
import { DiaryEntriesReportComponent } from './diary-entries-report/diary-entries-report.component';
import { ImageViewerModalComponent } from './image-viewer-modal/image-viewer-modal.component';
import { GrowReportComponent } from './grow-report/grow-report.component';
import { LogEntryViewerModule } from '../log-entry-viewer/log-entry-viewer.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    NgChartsModule,
    HighchartsChartModule,
    DiaryPageRoutingModule,
    PipesModule,
    TranslateModule,
    DevicesModule,
    LogEntryViewerModule,
  ],
  declarations: [
    DiaryPage,
    Co2ReportComponent,
    DiaryEntryModalComponent,
    DiaryEntriesReportComponent,
    ImageViewerModalComponent,
    GrowReportComponent,
  ]
})
export class DiaryPageModule {}
