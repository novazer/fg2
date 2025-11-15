import { Component, OnInit } from '@angular/core';
import { DataService } from 'src/app/services/data.service';
import { Device, DeviceService } from 'src/app/services/devices.service';

@Component({
  selector: 'app-list',
  templateUrl: './list.page.html',
  styleUrls: ['./list.page.scss'],
})
export class ListPage implements OnInit {


  public all_devices:Device[] = [];
  public id:string = '';

  constructor(private deviceService: DeviceService, public data: DataService) { }

  ngOnInit(): void {
    this.deviceService.devices.subscribe(devices => {
      console.log(devices)
      this.all_devices = devices;

      if (devices.length <= 0) {
        setTimeout(() => this.deviceService.refetchDevices(), 10000);
      }
    });
  }

  claimDevice() {
    this.deviceService.claim(this.id.toUpperCase());
  }
}
