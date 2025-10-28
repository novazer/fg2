import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { combineLatest, firstValueFrom } from 'rxjs';
import { DataService } from 'src/app/services/data.service';
import { Device, DeviceService } from 'src/app/services/devices.service';

@Component({
  selector: 'app-testmode',
  templateUrl: './testmode.page.html',
  styleUrls: ['./testmode.page.scss'],
})
export class TestmodePage implements OnInit {

  private ticker:any;

  public device_id:string = "";
  public outputs = {
    heater: 0,
    dehumidifier: 0,
    co2: 0,
    lights: 0,
    fanint: 0,
    fanext: 0,
    fanbw: 0
  }

  constructor(private devices: DeviceService, public data: DataService, private route: ActivatedRoute) { }

  async ngOnInit() {
    this.device_id = this.route.snapshot.paramMap.get('device_id') || "";
    console.log(this.device_id);

    this.outputs.heater = 0
    this.outputs.dehumidifier = 0
    this.outputs.co2 = 0
    this.outputs.lights = 0

    this.ticker = setInterval(() => {
      this.setOutputs()
    }, 5000)
    this.setOutputs()
  }

  setOutputs() {
    this.outputs.heater = parseInt('' + this.outputs.heater);
    this.outputs.co2 = parseInt('' + this.outputs.co2);
    this.outputs.dehumidifier = parseInt('' + this.outputs.dehumidifier);
    this.outputs.lights = parseInt('' + this.outputs.lights);
    this.outputs.fanint = parseInt('' + this.outputs.fanint);
    this.outputs.fanext = parseInt('' + this.outputs.fanext);
    this.outputs.fanbw = parseInt('' + this.outputs.fanbw);

    this.devices.testOutputs(this.device_id, this.outputs);
  }

  ionViewDidLeave() {
    clearInterval(this.ticker)
    this.devices.stopTest(this.device_id)
  }
}
