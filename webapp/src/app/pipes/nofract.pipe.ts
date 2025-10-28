import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'nofract'
})
export class NoFractPipe implements PipeTransform {

  transform(value: any, args?: any): any {
    return parseFloat(value).toFixed(0);
  }

}
