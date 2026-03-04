import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';
import { LogEntryViewerComponent } from './log-entry-viewer.component';
import { LogCategorySelectorComponent } from './log-category-selector.component';

@NgModule({
  declarations: [
    LogEntryViewerComponent,
    LogCategorySelectorComponent,
  ],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    TranslateModule,
  ],
  exports: [
    LogEntryViewerComponent,
    LogCategorySelectorComponent,
  ],
})
export class LogEntryViewerModule {}
