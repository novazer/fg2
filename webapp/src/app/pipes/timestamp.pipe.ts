import { Pipe, PipeTransform } from '@angular/core';
// import * as moment from 'moment';


@Pipe({
  name: 'timestamp'
})
export class TimestampPipe implements PipeTransform {

  transform(value: any, args?: any): any {
    return 0;
    // return moment.utc(value, 'x').local().format('DD.MM.YYYY HH:mm');
  }

}

@Pipe({
  name: 'daytime'
})
export class DaytimestampPipe implements PipeTransform {

  transform(value: any, args?: any): any {
    value -= new Date().getTimezoneOffset()*60;
    if(value<0){
      value += 24*3600;
    } else if(value >= 24*3600){
      value -= 24*3600;
    }
    let hours:number = Math.floor(value / 3600);
    let mins:number = Math.floor((value - hours * 3600) / 60);
    let ret:string = '';
    if(hours < 10) {
      ret += '0'
    }
    ret += hours + ':';
    if(mins < 10) {
      ret += '0'
    }
    ret += mins;
    return ret;
  }

}
