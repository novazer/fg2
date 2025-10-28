import { Pipe, PipeTransform } from '@angular/core';


@Pipe({
  name: 'verbosity'
})
export class VerbosityPipe implements PipeTransform {

  transform(value: any, args?: any): any {
    switch(value) {
      case 1: return 'INFO'
      case 2: return 'DEBUG'
      case 3: return 'WARNING'
      case 4: return 'ERROR'
    }
  }

}
