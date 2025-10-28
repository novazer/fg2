import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'multiply'
})
export class MultiplyPipe implements PipeTransform {

  transform(value: any, factor: any): any {
    return parseFloat(value) * parseFloat(factor);
  }

}
