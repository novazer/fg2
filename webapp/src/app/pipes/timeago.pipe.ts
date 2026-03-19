import { Pipe, PipeTransform } from '@angular/core';
import TimeAgo from 'javascript-time-ago';
import en from 'javascript-time-ago/locale/en';

@Pipe({
  name: 'timeAgo',
  pure: true
})
export class TimeAgoPipe implements PipeTransform {

  private static timeAgo: TimeAgo | null = null;

  private static getInstance(): TimeAgo {
    if (!TimeAgoPipe.timeAgo) {
      TimeAgo.addDefaultLocale(en);
      TimeAgoPipe.timeAgo = new TimeAgo('en-US');
    }
    return TimeAgoPipe.timeAgo;
  }

  transform(value: Date | string | number): string {
    return TimeAgoPipe.getInstance().format(new Date(value));
  }

}
