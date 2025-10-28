import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OnoffPipe } from './onoff.pipe';
import { RoundPipe } from './round.pipe';
import { NoFractPipe } from './nofract.pipe';
import { TimestampPipe, DaytimestampPipe } from './timestamp.pipe';
import { VerbosityPipe } from './verbosity.pipe';
import { MultiplyPipe } from './multiplay.pipe';

@NgModule({
  declarations: [
    OnoffPipe,
    RoundPipe,
    NoFractPipe,
    TimestampPipe,
    DaytimestampPipe,
    VerbosityPipe,
    MultiplyPipe
  ],
  exports: [
    OnoffPipe,
    RoundPipe,
    NoFractPipe,
    TimestampPipe,
    DaytimestampPipe,
    VerbosityPipe,
    MultiplyPipe
  ],
  imports: [
    CommonModule
  ]
})
export class PipesModule { }
