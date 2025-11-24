import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom, Subject } from 'rxjs';
import { environment } from 'src/environments/environment';
import { DeviceService } from './devices.service';

@Injectable({
  providedIn: 'root'
})
export class DataService {

  private measure_subjects: Map<string, Map<string, BehaviorSubject<number>>> = new Map<string, Map<string, BehaviorSubject<number>>>()
  private measure_avg_subjects: Map<string, Map<string, BehaviorSubject<number>>> = new Map<string, Map<string, BehaviorSubject<number>>>()

  constructor(private http: HttpClient, private devices: DeviceService) {
    this.devices.devices.subscribe((devices) => {
      this.measure_subjects = new Map<string, Map<string, BehaviorSubject<number>>>()
      this.measure_avg_subjects = new Map<string, Map<string, BehaviorSubject<number>>>()
      devices.map((device) => {
        this.measure_subjects.set(device.device_id, new Map<string, BehaviorSubject<number>>())
        this.measure_avg_subjects.set(device.device_id, new Map<string, BehaviorSubject<number>>())
      })
    })

    setInterval(() => {
      this.updateMeasures();
      this.updateAverages();
    }, 10000);
  }

  public measure(device:string, measure:string) : BehaviorSubject<number> {
    let sub = this.measure_subjects.get(device)?.get(measure);
    if(!sub) {
      sub = new BehaviorSubject<number>(NaN);
      this.measure_subjects.get(device)?.set(measure, sub)
      this.updateMeasures();
    }
    return sub;
  }

  public measureAvg(device: string, measure: string, timespan: string = '-1h', interval: string = '1m') : BehaviorSubject<number> {
    let sub = this.measure_avg_subjects.get(device)?.get(measure);
    if(!sub) {
      sub = new BehaviorSubject<number>(NaN);
      this.measure_avg_subjects.get(device)?.set(measure, sub)
      this.updateAverages();
    }
    return sub;
  }

  private updateMeasures() {
    for(let device of this.measure_subjects.entries()) {
      for(let measure of device[1].entries()) {
        this.http.get<number>(environment.API_URL + '/data/latest/' + device[0] + '/' + measure[0]).subscribe((data:any) => {
          if(data && data.value != null) {
            measure[1].next(data.value);
          }
          else {
            measure[1].next(NaN);
          }
        })
      }
    }
  }

  private updateAverages() {
    for(let device of this.measure_avg_subjects.entries()) {
      for(let measure of device[1].entries()) {
        const device_id = device[0];
        const measure_name = measure[0];
        const from = '-1h';
        const to = 'now()';
        const interval = '1m';
        const query = `?from=${from}&to=${to}&interval=${interval}`;
        this.http.get<any>(environment.API_URL + '/data/series/' + device_id + '/' + measure_name + query).subscribe((rows:any[]) => {
          if(Array.isArray(rows) && rows.length > 0) {
            const values = rows.map(r => r._value).filter((v:any) => typeof v === 'number' && !isNaN(v));
            if(values.length > 0) {
              const avg = values.reduce((a:number,b:number)=>a+b,0) / values.length;
              measure[1].next(avg);
              return;
            }
          }
          measure[1].next(NaN);
        }, _err => {
          measure[1].next(NaN);
        });
      }
    }
  }

  public async getSeries(device_id: string, measure: string, timespan: string, interval: string) {
    let to = 'now()';
    let from = timespan;
    let query = `?from=${from}&to=${to}&interval=${interval}`
    let data:any = await firstValueFrom(this.http.get(environment.API_URL + '/data/series/' + device_id + '/' + measure + query))
    return data.map((row: any) => {return [new Date(row._time).getTime(), row._value]});
  }

  public async getLatest(device_id: string, measure: string): Promise<number> {
    let data = await firstValueFrom(this.http.get<number>(environment.API_URL + '/data/latest/' + device_id + '/' + measure))
    return data;
  }

}
