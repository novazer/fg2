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

  constructor(private devices: DeviceService, public data: DataService) { }

  ngOnInit(): void {
    this.devices.devices.subscribe(devices => {
      console.log(devices)
      this.all_devices = devices;
    });
  }

  claimDevice() {
    this.devices.claim(this.id.toUpperCase());
  }
}
