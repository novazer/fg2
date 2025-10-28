import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ValuedisplayComponent } from './valuedisplay/valuedisplay.component';
import { IonicModule } from '@ionic/angular';
import { PipesModule } from 'src/app/pipes/pipes.module';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

@NgModule({
  declarations: [
    ValuedisplayComponent,
  ],
  exports: [
    ValuedisplayComponent,
  ],
  imports: [
    CommonModule,
    IonicModule,
    FormsModule,
    PipesModule,
    IonicModule,
    ReactiveFormsModule,
    TranslateModule.forChild()
  ]
})
export class ComponentsModule { }
