import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { TranslateModule } from '@ngx-translate/core';
import { LogEntryViewerComponent } from './log-entry-viewer.component';
import { LogCategorySelectorComponent } from './log-category-selector.component';
import { LogEntryItemComponent } from './log-entry-item.component';
import { ImageViewerModalComponent } from '../diary/image-viewer-modal/image-viewer-modal.component';

@NgModule({
  declarations: [
    LogEntryViewerComponent,
    LogCategorySelectorComponent,
    LogEntryItemComponent,
    ImageViewerModalComponent,
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
    LogEntryItemComponent,
    ImageViewerModalComponent,
  ],
})
export class LogEntryViewerModule {}
