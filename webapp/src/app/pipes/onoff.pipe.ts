import { Pipe, PipeTransform } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

@Pipe({
  name: 'onoff'
})
export class OnoffPipe implements PipeTransform {
  private on:string = "";
  private off:string = "";

  constructor(
    private translate: TranslateService
  ) {
    this.init();
  }

  async init() {
    this.on = await firstValueFrom(this.translate.get('misc.on'));
    this.off = await firstValueFrom(this.translate.get('misc.off'));
  }

  transform(value: any, args?: any): any {
    return value == 0 ? 'misc.off' : 'misc.on'//this.off : this.on;
  }

}
