import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'round'
})
export class RoundPipe implements PipeTransform {

  transform(value: any, precision?: number): any {
    return parseFloat(value).toFixed((!precision || isNaN(precision)) ? 1 : precision);
  }

}
